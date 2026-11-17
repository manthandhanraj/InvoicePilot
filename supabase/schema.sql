-- Run once in the Supabase SQL editor, as the project owner.
-- Runtime writes use server-only service_role RPCs; browser users get SELECT only.
begin;
create table if not exists public.ip_uploads (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 file_name text not null,
 file_size bigint not null check(file_size > 0 and file_size <= 10485760),
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
 state text not null default 'pending' check(state in ('pending','processing','complete','aborted')),
 created_at timestamptz not null default now()
);
create table if not exists public.ip_runs (
 id uuid primary key references public.ip_uploads(id),
 owner_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 status text not null check(status in ('approved','review','rejected')),
 invoice_key text,
 file_hash text not null,
 po_id text,
 total_cents bigint not null default 0,
 is_demo boolean not null default false,
 payload jsonb not null
);
create index if not exists ip_runs_owner_created on public.ip_runs(owner_id,created_at desc);
create index if not exists ip_runs_owner_hash on public.ip_runs(owner_id,file_hash);
create table if not exists public.ip_claims (
 owner_id uuid not null references auth.users(id) on delete cascade,
 invoice_key text not null,
 run_id uuid not null references public.ip_runs(id) deferrable initially deferred,
 primary key(owner_id,invoice_key)
);
create table if not exists public.ip_approvals (
 run_id uuid primary key references public.ip_runs(id) deferrable initially deferred,
 owner_id uuid not null references auth.users(id) on delete cascade,
 po_id text not null,
 total_cents bigint not null check(total_cents>0)
);
create index if not exists ip_approvals_owner_po on public.ip_approvals(owner_id,po_id);
alter table public.ip_uploads enable row level security;
alter table public.ip_runs enable row level security;
alter table public.ip_claims enable row level security;
alter table public.ip_approvals enable row level security;
drop policy if exists ip_own_uploads on public.ip_uploads;
create policy ip_own_uploads on public.ip_uploads for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists ip_own_runs on public.ip_runs;
create policy ip_own_runs on public.ip_runs for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists ip_own_approvals on public.ip_approvals;
create policy ip_own_approvals on public.ip_approvals for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.ip_uploads,public.ip_runs,public.ip_claims,public.ip_approvals from anon,authenticated;
grant select on public.ip_uploads,public.ip_runs,public.ip_approvals to authenticated;
grant all on public.ip_uploads,public.ip_runs,public.ip_claims,public.ip_approvals to service_role;

create or replace function public.ip_create_upload(p_owner uuid,p_id uuid,p_name text,p_size bigint,p_mime text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.ip_uploads;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if p_name is null or length(p_name)<1 or length(p_name)>180 then raise exception 'Invalid filename'; end if;
 if (select count(*) from public.ip_uploads where owner_id=p_owner and created_at>now()-interval '1 hour')>=100 then
  raise exception 'Upload rate limit reached. Try again later.';
 end if;
 insert into public.ip_uploads(id,owner_id,file_name,file_size,mime_type) values(p_id,p_owner,p_name,p_size,p_mime) returning * into result;
 return to_jsonb(result);
end;$$;

create or replace function public.ip_consume_upload(p_owner uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.ip_uploads;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 update public.ip_uploads set state='processing' where id=p_id and owner_id=p_owner and state='pending' and created_at>now()-interval '30 minutes' returning * into result;
 if result.id is null then raise exception 'Upload is missing, expired or already being processed. Check the queue before retrying.'; end if;
 return to_jsonb(result);
end;$$;

create or replace function public.ip_ledger(p_owner uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_object_agg(po_id,committed/100.0),'{}'::jsonb) from
 (select po_id,sum(total_cents) as committed from public.ip_approvals where owner_id=p_owner group by po_id) a;
$$;

create or replace function public.ip_persist_run(p_owner uuid,p_run jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 run_id uuid := (p_run->>'id')::uuid;
 run_key text := coalesce(nullif(p_run->>'invoiceKey',''),'file:'||(p_run->>'fileHash'));
 decision text := p_run->>'status';
 po text := p_run#>>'{matchedPO,id}';
 amount bigint := coalesce(round((p_run#>>'{invoice,total}')::numeric*100),0);
 ceiling bigint;
 committed bigint;
 previous jsonb;
begin
 -- Serialize writes per owner: duplicate claims and cumulative allocations form one transaction.
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select payload into previous from public.ip_runs where id=run_id and owner_id=p_owner;
 if previous is not null then return previous; end if;
 if not exists(select 1 from public.ip_uploads where id=run_id and owner_id=p_owner and state='processing') then
  raise exception 'This upload is not available for processing';
 end if;
 if decision not in ('approved','review','rejected') or p_run->>'fileHash' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid run payload'; end if;
 if decision<>'rejected' and (
  exists(select 1 from public.ip_claims where owner_id=p_owner and invoice_key=run_key) or
  exists(select 1 from public.ip_runs where owner_id=p_owner and file_hash=p_run->>'fileHash' and status<>'rejected')
 ) then
  decision:='rejected';
  p_run:=p_run||jsonb_build_object('status',decision,'summary','Duplicate submission blocked.',
   'reasons',jsonb_build_array('An earlier or concurrent run already claimed this invoice.'),
   'checks',coalesce(p_run->'checks','[]'::jsonb)||jsonb_build_array(jsonb_build_object('key','concurrent-duplicate','label','Duplicate reservation','state','fail','detail','An earlier or concurrent run already claimed this invoice.')));
 elsif decision<>'rejected' then
  insert into public.ip_claims(owner_id,invoice_key,run_id) values(p_owner,run_key,run_id);
 end if;
 if decision='approved' then
  if amount<=0 or po is null then raise exception 'Approved run has no valid allocation'; end if;
  ceiling:=round(((p_run#>>'{matchedPO,amount}')::numeric+(p_run->>'tolerance')::numeric)*100);
  if ceiling is null or ceiling<amount then decision:='review'; end if;
  select coalesce(sum(total_cents),0) into committed from public.ip_approvals where owner_id=p_owner and po_id=po;
  if decision='review' or committed+amount>ceiling then
   decision:='review';
   p_run:=p_run||jsonb_build_object('status',decision,'summary','PO balance changed during processing. Human review required.',
    'reasons',jsonb_build_array('Another approved invoice consumed the available PO balance.'),
    'checks',coalesce(p_run->'checks','[]'::jsonb)||jsonb_build_array(jsonb_build_object('key','concurrent-balance','label','Atomic balance check','state','review','detail','Available PO balance changed. This invoice was not committed.')));
  else
   insert into public.ip_approvals(run_id,owner_id,po_id,total_cents) values(run_id,p_owner,po,amount);
  end if;
 end if;
 insert into public.ip_runs(id,owner_id,created_at,status,invoice_key,file_hash,po_id,total_cents,is_demo,payload)
 values(run_id,p_owner,(p_run->>'createdAt')::timestamptz,decision,run_key,p_run->>'fileHash',po,amount,coalesce((p_run->>'isDemo')::boolean,false),p_run);
 update public.ip_uploads set state='complete' where id=run_id and owner_id=p_owner;
 return p_run;
end;$$;

create or replace function public.ip_abort_upload(p_owner uuid,p_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if exists(select 1 from public.ip_runs where owner_id=p_owner and id=p_id) then return false; end if;
 update public.ip_uploads set state='aborted' where owner_id=p_owner and id=p_id and state<>'complete';
 return found;
end;$$;

create or replace function public.ip_reset_demo(p_owner uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ids uuid[];
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select array_agg(id) into ids from public.ip_runs where owner_id=p_owner and is_demo;
 if ids is null then return '[]'::jsonb; end if;
 delete from public.ip_claims where owner_id=p_owner and run_id=any(ids);
 delete from public.ip_approvals where owner_id=p_owner and run_id=any(ids);
 delete from public.ip_runs where owner_id=p_owner and id=any(ids);
 update public.ip_uploads set state='aborted' where owner_id=p_owner and id=any(ids);
 return to_jsonb(ids);
end;$$;

revoke all on function public.ip_create_upload(uuid,uuid,text,bigint,text),public.ip_consume_upload(uuid,uuid),public.ip_ledger(uuid),public.ip_persist_run(uuid,jsonb),public.ip_abort_upload(uuid,uuid),public.ip_reset_demo(uuid) from public,anon,authenticated;
grant execute on function public.ip_create_upload(uuid,uuid,text,bigint,text),public.ip_consume_upload(uuid,uuid),public.ip_ledger(uuid),public.ip_persist_run(uuid,jsonb),public.ip_abort_upload(uuid,uuid),public.ip_reset_demo(uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('invoicepilot','invoicepilot',false,10485760,array['application/pdf','image/png','image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- No public upload/read/update policies: only scoped signed URLs issued by the backend.
commit;

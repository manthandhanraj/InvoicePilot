-- Existing projects: run this entire file once in the Supabase SQL Editor.
-- Does not remove existing invoices, users, files or balances.
begin;
create or replace function public.ip_review_run(p_owner uuid,p_id uuid,p_run jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 original jsonb;
 decision text := p_run->>'status';
 run_key text := p_run->>'invoiceKey';
 po text := p_run#>>'{matchedPO,id}';
 amount bigint := coalesce(round((p_run#>>'{invoice,total}')::numeric*100),0);
 ceiling bigint;
 committed bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select payload into original from public.ip_runs where owner_id=p_owner and id=p_id for update;
 if original is null then raise exception 'Invoice not found'; end if;
 if original->>'status'<>'review' then raise exception 'This invoice has already been decided. Refresh the queue.'; end if;
 if decision not in ('approved','rejected') or p_run#>>'{humanReview,reviewerId}'<>p_owner::text or length(trim(p_run#>>'{humanReview,note}'))<5 then raise exception 'Invalid human review'; end if;
 if decision='approved' then
  if amount<=0 or run_key is null then raise exception 'Confirm invoice details before approval'; end if;
  if exists(select 1 from public.ip_claims where owner_id=p_owner and invoice_key=run_key and run_id<>p_id)
   or exists(select 1 from public.ip_runs where owner_id=p_owner and id<>p_id and status<>'rejected' and file_hash=original->>'fileHash') then
   raise exception 'A duplicate invoice cannot be approved';
  end if;
  if po is not null then
   ceiling:=round(((p_run#>>'{matchedPO,amount}')::numeric+(p_run->>'tolerance')::numeric)*100);
   select coalesce(sum(total_cents),0) into committed from public.ip_approvals where owner_id=p_owner and po_id=po;
   if ceiling is null or committed+amount>ceiling then raise exception 'PO balance changed. Refresh the invoice before approving.'; end if;
   insert into public.ip_approvals(run_id,owner_id,po_id,total_cents) values(p_id,p_owner,po,amount);
  elsif coalesce((p_run#>>'{humanReview,nonPO}')::boolean,false)=false then raise exception 'Confirm the non-PO exception';
  end if;
 end if;
 delete from public.ip_claims where owner_id=p_owner and run_id=p_id;
 if decision='approved' then insert into public.ip_claims(owner_id,invoice_key,run_id) values(p_owner,run_key,p_id); end if;
 -- Source identity and the original automatic result cannot be rewritten by review.
 p_run:=p_run||jsonb_build_object('id',p_id,'fileHash',original->>'fileHash','rawText',original->>'rawText','createdAt',original->>'createdAt',
  'automation',coalesce(original->'automation',jsonb_build_object('status',original->>'status','summary',original->>'summary','reasons',original->'reasons','checks',original->'checks','invoice',original->'invoice')));
 update public.ip_runs set status=decision,invoice_key=run_key,po_id=po,total_cents=amount,payload=p_run where owner_id=p_owner and id=p_id;
 return p_run;
end;$$;
revoke all on function public.ip_review_run(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ip_review_run(uuid,uuid,jsonb) to service_role;
commit;

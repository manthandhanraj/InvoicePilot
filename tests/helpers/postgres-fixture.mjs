import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
export const OWNER_A='11111111-1111-4111-8111-111111111111',OWNER_B='22222222-2222-4222-8222-222222222222';
export async function postgresFixture(){
 const db=new PGlite();await db.waitReady;
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 insert into auth.users(id,email) values('${OWNER_A}','reviewer@example.test'),('${OWNER_B}','other@example.test');`);
 await db.exec(readFileSync(new URL('../../supabase/schema.sql',import.meta.url),'utf8'));
 const rpc=async(name,args)=>{if(!/^ip_[a-z_]+$/.test(name))throw new Error('Unknown RPC');const params=Object.keys(args).map((key,index)=>`${key} => $${index+1}`).join(',');const values=Object.values(args).map(value=>typeof value==='object'?JSON.stringify(value):value);return (await db.query(`select public.${name}(${params}) as result`,values)).rows[0].result;};
 return {db,rpc,close:()=>db.close()};
}

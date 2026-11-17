import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {postgresFixture,OWNER_A,OWNER_B} from './helpers/postgres-fixture.mjs';
import {extractInvoice,evaluateInvoice} from '../src/engine.js';
import {SAMPLES} from '../src/data.js';
const base=SAMPLES.find(s=>s.id==='happy').text;
async function prepared(f,owner=OWNER_A,text=base){const id=crypto.randomUUID();await f.rpc('ip_create_upload',{p_owner:owner,p_id:id,p_name:'invoice.pdf',p_size:1000,p_mime:'application/pdf'});await f.rpc('ip_consume_upload',{p_owner:owner,p_id:id});const invoice=extractInvoice(text);return {id,createdAt:new Date().toISOString(),invoice,...evaluateInvoice(invoice),fileHash:createHash('sha256').update(id).digest('hex'),isDemo:true};}
test('PostgreSQL migration, atomic claims, ledger, idempotence and reset',async()=>{const f=await postgresFixture();try{
 const first=await prepared(f);assert.equal((await f.rpc('ip_persist_run',{p_owner:OWNER_A,p_run:first})).status,'approved');
 assert.equal((await f.rpc('ip_persist_run',{p_owner:OWNER_A,p_run:first})).status,'approved');
 const duplicate=await prepared(f);assert.equal((await f.rpc('ip_persist_run',{p_owner:OWNER_A,p_run:duplicate})).status,'rejected');
 assert.equal((await f.rpc('ip_ledger',{p_owner:OWNER_A}))['PO-2026-041'],4500);
 const other=await prepared(f,OWNER_B);assert.equal((await f.rpc('ip_persist_run',{p_owner:OWNER_B,p_run:other})).status,'approved');
 assert.equal((await f.rpc('ip_reset_demo',{p_owner:OWNER_A})).length,2);assert.deepEqual(await f.rpc('ip_ledger',{p_owner:OWNER_A}),{});
 assert.equal((await f.rpc('ip_ledger',{p_owner:OWNER_B}))['PO-2026-041'],4500);
}finally{await f.close();}});
test('PostgreSQL allocation guard cannot exceed the cumulative ceiling',async()=>{const f=await postgresFixture();try{
 const text=base.replace('Subtotal: 4000.00','Subtotal: 7500.00').replace('Grand Total: 4500.00','Grand Total: 8000.00');
 const one=await prepared(f,OWNER_A,text.replace('INV-1048','RACE-1')),two=await prepared(f,OWNER_A,text.replace('INV-1048','RACE-2'));
 const results=await Promise.all([f.rpc('ip_persist_run',{p_owner:OWNER_A,p_run:one}),f.rpc('ip_persist_run',{p_owner:OWNER_A,p_run:two})]);
 assert.deepEqual(results.map(r=>r.status).sort(),['approved','review']);assert.equal((await f.rpc('ip_ledger',{p_owner:OWNER_A}))['PO-2026-041'],8000);
}finally{await f.close();}});
test('PostgreSQL enforces owner isolation and denies browser writes/RPCs',async()=>{const f=await postgresFixture();try{
 const run=await prepared(f);await f.rpc('ip_persist_run',{p_owner:OWNER_A,p_run:run});
 await f.db.exec(`select set_config('request.jwt.claim.sub','${OWNER_B}',false); set role authenticated;`);
 assert.equal((await f.db.query('select * from public.ip_runs')).rows.length,0);
 await assert.rejects(f.db.query('select public.ip_reset_demo($1)',[OWNER_A]),/permission denied/);
 await assert.rejects(f.db.query('insert into public.ip_runs(id,owner_id,status,file_hash,payload) values($1,$2,$3,$4,$5)',[crypto.randomUUID(),OWNER_B,'approved','x','{}']),/permission denied/);
 await f.db.exec('reset role');
}finally{await f.close();}});
test('PostgreSQL refuses expired, reused and foreign upload reservations',async()=>{const f=await postgresFixture();try{
 const id=crypto.randomUUID();await f.rpc('ip_create_upload',{p_owner:OWNER_A,p_id:id,p_name:'invoice.pdf',p_size:1000,p_mime:'application/pdf'});
 await assert.rejects(f.rpc('ip_consume_upload',{p_owner:OWNER_B,p_id:id}),/missing|expired/);
 await f.db.query("update public.ip_uploads set created_at=now()-interval '1 hour' where id=$1",[id]);
 await assert.rejects(f.rpc('ip_consume_upload',{p_owner:OWNER_A,p_id:id}),/missing|expired/);
}finally{await f.close();}});

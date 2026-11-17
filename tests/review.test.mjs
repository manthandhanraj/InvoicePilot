import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractInvoice,evaluateInvoice} from '../src/engine.js';
import {prepareHumanReview} from '../src/review.js';
import {SAMPLES} from '../src/data.js';
import {postgresFixture,OWNER_A} from './helpers/postgres-fixture.mjs';

function pending(text=SAMPLES.find(s=>s.id==='ambiguous').text){const invoice=extractInvoice(text);return {id:crypto.randomUUID(),invoice,...evaluateInvoice(invoice),fileHash:'a'.repeat(64),method:'pdf',rawText:text,createdAt:new Date().toISOString()};}
const reviewer={id:OWNER_A,email:'reviewer@example.test'};
test('human approval requires acknowledgement and explicit non-PO verification',()=>{
 const run=pending(SAMPLES[0].text.replaceAll('Aster Studio LLC','New Supplier').replace('PO Number: PO-2026-041\n',''));
 assert.equal(run.status,'review');
 const input={decision:'approved',note:'Supplier and source independently verified'};
 assert.throws(()=>prepareHumanReview(run,input,[],{},reviewer),/Confirm that you checked/);
 assert.throws(()=>prepareHumanReview(run,{...input,acknowledged:true},[],{},reviewer),/non-PO exception/);
 const result=prepareHumanReview(run,{...input,acknowledged:true,nonPO:true},[],{},reviewer);assert.equal(result.status,'approved');assert.equal(result.humanReview.nonPO,true);assert.equal(result.matchedPO,null);assert.equal(result.automation.status,'review');
});
test('PostgreSQL review guards stale decisions, balances and browser RPC permissions',async()=>{
 const f=await postgresFixture();try{
  const records=[];
  for(let n=0;n<2;n++){
   const run=pending(SAMPLES.find(s=>s.id==='ambiguous').text.replace('OC-882','REVIEW-'+n).replace('Subtotal: 2000.00','Subtotal: 5000.00').replace('Grand Total: 2000.00','Grand Total: 5000.00'));run.fileHash=String(n+1).repeat(64);
   await f.rpc('ip_create_upload',{p_owner:OWNER_A,p_id:run.id,p_name:'invoice.pdf',p_size:100,p_mime:'application/pdf'});await f.rpc('ip_consume_upload',{p_owner:OWNER_A,p_id:run.id});await f.rpc('ip_persist_run',{p_owner:OWNER_A,p_run:run});records.push(run);
  }
  const input={decision:'approved',note:'Verified source and production PO',acknowledged:true,fields:{poNumber:'PO-2026-043'}};
  const first=prepareHumanReview(records[0],input,records,{},reviewer),stale=prepareHumanReview(records[1],input,records,{},reviewer);
  await f.rpc('ip_review_run',{p_owner:OWNER_A,p_id:first.id,p_run:first});
  await assert.rejects(f.rpc('ip_review_run',{p_owner:OWNER_A,p_id:stale.id,p_run:stale}),/PO balance changed/);
  assert.equal((await f.rpc('ip_ledger',{p_owner:OWNER_A}))['PO-2026-043'],5000);
  const rejected=prepareHumanReview(records[1],{decision:'rejected',note:'Supplier must revise this invoice'},records,{},reviewer);
  assert.equal((await f.rpc('ip_review_run',{p_owner:OWNER_A,p_id:rejected.id,p_run:rejected})).status,'rejected');
  await f.db.exec('set role authenticated');await assert.rejects(f.rpc('ip_review_run',{p_owner:OWNER_A,p_id:first.id,p_run:first}),/permission denied/);await f.db.exec('reset role');
 }finally{await f.close();}
});

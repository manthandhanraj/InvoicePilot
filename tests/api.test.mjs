import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {storage} from '../scripts/local-storage.mjs';
import {SAMPLES} from '../src/data.js';
import {ERP_INVOICE} from './helpers/erp-invoice.mjs';
const source=readFileSync(new URL('../dist/server/index.js',import.meta.url));
const worker=(await import('data:text/javascript;base64,'+source.toString('base64'))).default;
const root=fileURLToPath(new URL('../.local/',import.meta.url));mkdirSync(root,{recursive:true});
async function fixture(fn){const path=mkdtempSync(join(root,'test-')),env=storage(path);try{await fn(env);}finally{env.close();if(!resolve(path).startsWith(resolve(root)+ '\\')&&!resolve(path).startsWith(resolve(root)+'/'))throw new Error('Refusing cleanup outside test root');rmSync(path,{recursive:true,force:true});}}
async function request(env,path,init={}){const tasks=[];const res=await worker.fetch(new Request('http://127.0.0.1'+path,init),env,{waitUntil:p=>tasks.push(p)});const body=await res.text();await Promise.all(tasks);return {status:res.status,body};}
async function run(env,id,textOverride=null,fileSuffix='',owner=null){const s=SAMPLES.find(s=>s.id===id),form=new FormData();const bytes=readFileSync(new URL('../samples/'+s.file,import.meta.url));form.append('file',new File([bytes,fileSuffix],s.file,{type:'application/pdf'}));form.append('text',textOverride??s.text);form.append('method','pdf');const res=await request(env,'/api/runs',{method:'POST',headers:owner?{'oai-authenticated-user-id':owner}:{},body:form});assert.equal(res.status,200,res.body);const events=res.body.trim().split('\n').map(JSON.parse);assert.ok(!events.find(e=>e.error),res.body);assert.ok(events.at(-1).run,res.body);return events.at(-1).run;}
const human=(env,id,body,owner=null)=>request(env,'/api/runs/'+id+'/review',{method:'POST',headers:{'Content-Type':'application/json',...(owner?{'oai-authenticated-user-id':owner}:{})},body:JSON.stringify(body)});

test('human rejection allows incomplete fields and is owner scoped',()=>fixture(async env=>{
 const r=await run(env,'scanned',null,'','owner-a');
 assert.equal((await human(env,r.id,{decision:'rejected',note:'Missing supplier total'},'owner-b')).status,404);
 assert.equal((await human(env,r.id,{decision:'approved',note:'No verified amount',acknowledged:true},'owner-a')).status,400);
 assert.equal((await human(env,r.id,{decision:'rejected',note:'Missing supplier total',reviewerId:'spoof'},'owner-a')).status,200);
 const saved=JSON.parse((await request(env,'/api/state',{headers:{'oai-authenticated-user-id':'owner-a'}})).body);assert.equal(saved.runs[0].humanReview.reviewerId,'owner-a');assert.equal(saved.runs[0].status,'rejected');assert.equal(saved.purchaseOrders[1].committed,0);
}));

test('human review prevents concurrent overbilling and duplicate corrections',()=>fixture(async env=>{
 const text=SAMPLES[0].text.replace('Subtotal: 4000.00','Subtotal: 7500.00').replace('Grand Total: 4500.00','Grand Total: 8000.00').replace('Currency: USD','Currency: EUR');
 const one=await run(env,'happy',text.replace('INV-1048','MAN-1'),'MAN1'),two=await run(env,'happy',text.replace('INV-1048','MAN-2'),'MAN2');
 const input={decision:'approved',note:'Source confirms USD and amount',acknowledged:true,fields:{currency:'USD'}};
 const responses=await Promise.all([human(env,one.id,input),human(env,two.id,input)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const state=JSON.parse((await request(env,'/api/state')).body);assert.equal(state.purchaseOrders[0].committed,8000);
 const pending=state.runs.find(r=>r.status==='review'),approved=state.runs.find(r=>r.status==='approved');assert.equal((await human(env,pending.id,{...input,fields:{currency:'USD',invoiceNumber:approved.invoice.invoiceNumber}})).status,409);
}));

test('human review selects an ambiguous PO, audits corrections and reserves once',()=>fixture(async env=>{
 const r=await run(env,'ambiguous');
 assert.equal((await human(env,r.id,{decision:'approved',note:'Confirmed source and correct cloud PO',acknowledged:true,fields:{poNumber:'PO-2026-043'}})).status,200);
 const saved=JSON.parse((await request(env,'/api/state')).body);assert.equal(saved.runs[0].status,'approved');assert.equal(saved.purchaseOrders.find(p=>p.id==='PO-2026-043').committed,2000);assert.equal(saved.runs[0].automation.status,'review');assert.equal(saved.runs[0].humanReview.changes.poNumber.after,'PO-2026-043');
 assert.match((await request(env,'/api/runs/'+r.id+'/report.pdf')).body,/Human review/);
 assert.equal((await human(env,r.id,{decision:'rejected',note:'Second attempt should fail'})).status,409);
}));




test('real API persists happy path, duplicate, partial and over-limit outcomes',()=>fixture(async env=>{const a=await run(env,'happy');assert.equal(a.status,'approved');assert.equal(a.isDemo,true);assert.equal((await run(env,'happy')).status,'rejected');assert.equal((await run(env,'partial')).status,'approved');assert.equal((await run(env,'over')).status,'review');const res=JSON.parse((await request(env,'/api/state')).body);assert.equal(res.runs.length,4);assert.equal(res.purchaseOrders[0].committed,11500);const f=await request(env,'/api/runs/'+a.id+'/file');assert.equal(f.status,200);assert.ok(f.body.startsWith('%PDF-'));}));
test('simultaneous identical submissions cannot both approve',()=>fixture(async env=>{const results=await Promise.all([run(env,'happy'),run(env,'happy')]);assert.deepEqual(results.map(r=>r.status).sort(),['approved','rejected']);}));
test('atomic balance reservation protects against simultaneous overbilling',()=>fixture(async env=>{const base=SAMPLES[0].text.replace('Subtotal: 4000.00','Subtotal: 7500.00').replace('Grand Total: 4500.00','Grand Total: 8000.00');const results=await Promise.all([run(env,'happy',base.replace('INV-1048','INV-X1'),'X1'),run(env,'happy',base.replace('INV-1048','INV-X2'),'X2')]);assert.deepEqual(results.map(r=>r.status).sort(),['approved','review']);const data=JSON.parse((await request(env,'/api/state')).body);assert.equal(data.purchaseOrders[0].committed,8000);}));
test('ambiguous PO and missing total preserve review outcomes',()=>fixture(async env=>{assert.equal((await run(env,'ambiguous')).status,'review');assert.equal((await run(env,'scanned')).status,'review');}));
test('demo reset preserves separately uploaded records',()=>fixture(async env=>{await run(env,'happy');const custom=SAMPLES[0].text.replace('INV-1048','REAL-101');await run(env,'happy',custom,'CUSTOM');const reset=JSON.parse((await request(env,'/api/reset-demo',{method:'POST'})).body);assert.equal(reset.cleared,1);const data=JSON.parse((await request(env,'/api/state')).body);assert.equal(data.runs.length,1);assert.equal(data.runs[0].invoice.invoiceNumber,'REAL-101');assert.equal(data.purchaseOrders[0].committed,4500);}));
test('workspace records are isolated by authenticated identity',()=>fixture(async env=>{const runA=await run(env,'happy',null,'','owner-a');const b=JSON.parse((await request(env,'/api/state',{headers:{'oai-authenticated-user-id':'owner-b'}})).body);assert.equal(b.runs.length,0);assert.equal((await request(env,'/api/runs/'+runA.id+'/file',{headers:{'oai-authenticated-user-id':'owner-b'}})).status,404);}));
test('rejects cross-origin writes and invalid file signatures',()=>fixture(async env=>{assert.equal((await request(env,'/api/reset-demo',{method:'POST',headers:{Origin:'https://other.invalid'}})).status,403);const form=new FormData();form.append('file',new File(['not a PDF'],'bad.pdf'));form.append('text','Vendor: Aster Studio LLC');assert.equal((await request(env,'/api/runs',{method:'POST',body:form})).status,400);}));

test('PDF reports and rechecks are owner-scoped and keep saved decisions and balances immutable',()=>fixture(async env=>{
 const a=await run(env,'happy',ERP_INVOICE,'ERP','owner-a');const original={...a,invoice:{...a.invoice,date:null,currency:null,total:null},summary:'Legacy extraction needs review.'};
 await env.DB.prepare('UPDATE runs SET payload=? WHERE owner_id=? AND id=?').bind(JSON.stringify(original),'owner-a',a.id).run();
 const headers={'oai-authenticated-user-id':'owner-a'},before=(await request(env,'/api/state',{headers})).body;
 const preview=await request(env,'/api/runs/'+a.id+'/recheck',{headers});assert.equal(preview.status,200);const checked=JSON.parse(preview.body);assert.equal(checked.invoice.total,3741);assert.equal(checked.invoice.currency,'INR');assert.equal(checked.analysisOnly,true);assert.equal(checked.originalStatus,'review');assert.equal(checked.status,'review');
 const report=await request(env,'/api/runs/'+a.id+'/report.pdf?recheck=1',{headers});assert.equal(report.status,200);assert.ok(report.body.startsWith('%PDF-1.4'));assert.match(report.body,/INR 3741.00/);assert.equal((await request(env,'/api/state',{headers})).body,before);
 for(const suffix of ['recheck','report.pdf'])assert.equal((await request(env,'/api/runs/'+a.id+'/'+suffix,{headers:{'oai-authenticated-user-id':'owner-b'}})).status,404);
}));
test('approved run recheck excludes its own allocation but preserves the ledger and duplicate checks',()=>fixture(async env=>{
 const a=await run(env,'happy');const preview=JSON.parse((await request(env,'/api/runs/'+a.id+'/recheck')).body);assert.equal(preview.status,'approved');assert.equal(preview.committed,0);const data=JSON.parse((await request(env,'/api/state')).body);assert.equal(data.runs.length,1);assert.equal(data.purchaseOrders[0].committed,4500);
}));

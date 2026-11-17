import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDemoClient} from '../dist/demo.js';
import {SAMPLES} from '../src/data.js';
import {readFileSync} from 'node:fs';

function store(){const rows=new Map();return {async all(){return structuredClone([...rows.values()]);},async write(records,remove=[]){for(const id of remove)rows.delete(id);for(const record of records)rows.set(record.id,structuredClone(record));}};}
test('browser demo seeds isolated invoices and persists a human review without cloud access',async()=>{
 const saved=store(),demo=createDemoClient(saved);await demo.start();const other=createDemoClient(store());
 let state=await(await demo.fetch('/api/state')).json();assert.equal(state.runs.length,2);assert.equal((await(await other.fetch('/api/state')).json()).runs.length,0);
 const pending=state.runs.find(r=>r.status==='review');
 const input={decision:'approved',note:'Verified source and production cloud PO',acknowledged:true,fields:{poNumber:'PO-2026-043'}};
 assert.equal((await demo.fetch('/api/runs/'+pending.id+'/review',{method:'POST',body:JSON.stringify(input)})).status,200);
 const resumed=createDemoClient(saved);await resumed.start();state=await(await resumed.fetch('/api/state')).json();assert.equal(state.runs.length,2);assert.equal(state.runs.find(r=>r.id===pending.id).humanReview.decision,'approved');assert.equal(state.purchaseOrders.find(p=>p.id==='PO-2026-043').committed,2000);
 const report=await demo.fetch('/api/runs/'+pending.id+'/report.pdf');assert.match(await report.text(),/Human review/);
 const source=await demo.fetch('/api/runs/'+pending.id+'/file');assert.ok((await source.text()).startsWith('%PDF-'));
});
test('browser demo processes duplicates, rechecks and resets',async()=>{
 const demo=createDemoClient(store());await demo.start();const sample=SAMPLES[0],form=new FormData();form.set('file',new File([readFileSync(new URL('../samples/'+sample.file,import.meta.url))],sample.file,{type:'application/pdf'}));form.set('text',sample.text);form.set('method','pdf');
 const response=await demo.fetch('/api/runs',{method:'POST',body:form}),event=JSON.parse((await response.text()).trim());assert.equal(event.run.status,'rejected');
 const preview=await(await demo.fetch('/api/runs/'+event.run.id+'/recheck')).json();assert.equal(preview.analysisOnly,true);
 assert.equal((await(await demo.fetch('/api/state')).json()).runs.length,3);
 assert.equal((await(await demo.fetch('/api/reset-demo',{method:'POST'})).json()).cleared,3);assert.equal((await(await demo.fetch('/api/state')).json()).runs.length,0);
});

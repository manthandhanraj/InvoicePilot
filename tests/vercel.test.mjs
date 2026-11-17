import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVercelHandler} from '../src/vercel.js';
import {supabaseFixture} from './helpers/supabase-fixture.mjs';
import {SAMPLES} from '../src/data.js';
const source=readFileSync(new URL('../dist/server/index.js',import.meta.url));
const worker=(await import('data:text/javascript;base64,'+source.toString('base64'))).default;
async function fixture(fn){const sb=await supabaseFixture(),tasks=[];const handler=createVercelHandler(worker,sb.config,sb.fetcher,p=>tasks.push(p));
 const call=async(path,options={})=>{const response=await handler(new Request('https://invoice.example'+path,options));const body=await response.text();await Promise.all(tasks.splice(0));return {response,body,json:()=>JSON.parse(body)};};
 try{await fn({sb,call});}finally{await sb.close();}}
const cookie='ip_access=access-a; ip_refresh=refresh-a';
async function directRun({sb,call},id='happy',padding=0){const s=SAMPLES.find(s=>s.id===id),bytes=readFileSync(new URL('../samples/'+s.file,import.meta.url));const file=new File([bytes,new Uint8Array(padding)],s.file,{type:'application/pdf'});
 const ticket=await call('/api/uploads',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({fileName:file.name,size:file.size,mime:file.type})});assert.equal(ticket.response.status,200,ticket.body);
 const upload=new FormData();upload.append('cacheControl','0');upload.append('',file);const uploaded=await sb.fetcher(ticket.json().url,{method:'PUT',body:upload});assert.equal(uploaded.status,200);
 const metadata=JSON.stringify({uploadId:ticket.json().id,text:s.text,method:'pdf'});assert.ok(Buffer.byteLength(metadata)<250000);
 const result=await call('/api/runs',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:metadata});assert.equal(result.response.status,200,result.body);const events=result.body.trim().split('\n').map(JSON.parse);assert.ok(!events.some(e=>e.error),result.body);return events.at(-1).run;
}
test('Vercel cookies, auth validation, refresh, sign-out and cross-origin protection',()=>fixture(async({call})=>{
 assert.equal((await call('/api/state')).response.status,401);
 assert.equal((await call('/api/state',{headers:{'oai-authenticated-user-id':'spoof'}})).response.status,401);
 const login=await call('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'reviewer@example.test',password:'test-only-password'})});
 assert.equal(login.response.status,200);assert.equal(login.response.headers.getSetCookie().length,2);for(const c of login.response.headers.getSetCookie()){assert.match(c,/HttpOnly/);assert.match(c,/Secure/);assert.match(c,/SameSite=Lax/);}
 assert.equal((await call('/api/auth/refresh',{method:'POST',headers:{cookie}})).response.status,200);
 assert.equal((await call('/api/auth/logout',{method:'POST',headers:{cookie}})).response.headers.getSetCookie().every(c=>c.includes('Max-Age=0')),true);
 assert.equal((await call('/api/uploads',{method:'POST',headers:{cookie,origin:'https://evil.example'}})).response.status,403);
}));
test('Vercel direct upload accepts >4.5 MB without sending file bytes to the function',()=>fixture(async context=>{
 const run=await directRun(context,'happy',5*1024*1024);assert.equal(run.status,'approved');
 const state=(await context.call('/api/state',{headers:{cookie}})).json();assert.equal(state.runs.length,1);assert.equal(state.purchaseOrders[0].committed,4500);
 const source=await context.call('/api/runs/'+run.id+'/file',{headers:{cookie}});assert.equal(source.response.status,302);assert.match(source.response.headers.get('location'),/storage\/v1\/object\/sign/);
 const report=await context.call('/api/runs/'+run.id+'/report.pdf',{headers:{cookie}});assert.equal(report.response.status,200);assert.equal(report.response.headers.get('content-type'),'application/pdf');assert.match(report.response.headers.get('content-disposition'),/attachment/);assert.ok(report.body.startsWith('%PDF-1.4'));
 const preview=(await context.call('/api/runs/'+run.id+'/recheck',{headers:{cookie}})).json();assert.equal(preview.analysisOnly,true);assert.equal(preview.status,'approved');assert.equal((await context.call('/api/state',{headers:{cookie}})).json().purchaseOrders[0].committed,4500);
 assert.equal((await directRun(context)).status,'rejected');
}));
test('Vercel upload ownership, JSON-only processing and protected source access',()=>fixture(async context=>{
 const run=await directRun(context);const other={cookie:'ip_access=access-b'};
 assert.equal((await context.call('/api/runs/'+run.id+'/file',{headers:other})).response.status,404);
 assert.equal((await context.call('/api/runs/'+run.id+'/report.pdf',{headers:other})).response.status,404);
 assert.equal((await context.call('/api/runs/'+run.id+'/recheck',{headers:other})).response.status,404);
 assert.equal((await context.call('/api/state',{headers:other})).json().runs.length,0);
 assert.equal((await context.call('/api/runs',{method:'POST',headers:{cookie,'Content-Type':'multipart/form-data'},body:'invalid'})).response.status,415);
 const abort=await context.call('/api/uploads/'+run.id,{method:'DELETE',headers:{cookie}});assert.equal(abort.response.status,200);assert.equal(context.sb.objects.has('11111111-1111-4111-8111-111111111111/'+run.id),true);
}));
test('Vercel unconfigured server reports setup state without exposing keys',async()=>{
 const handler=createVercelHandler(worker,{}),result=await handler(new Request('https://invoice.example/api/config'));assert.equal((await result.json()).configured,false);
 assert.equal((await handler(new Request('https://invoice.example/api/state'))).status,503);
});
test('Vercel rewrite preserves POST bodies and routes to authenticated API handlers',()=>fixture(async({call})=>{
 const login=await call('/api/index?__route=auth%2Flogin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'reviewer@example.test',password:'test-only-password'})});assert.equal(login.response.status,200);
 const state=await call('/api/index?__route=state',{headers:{cookie}});assert.equal(state.response.status,200);assert.ok(state.json().purchaseOrders.length);
}));

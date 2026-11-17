// Bundled with the same extraction, decision, review and PDF code as the server.
// Demo records stay in this browser; no real account or cloud data is touched.
function demoStore(){
 let connection;
 const open=()=>connection||(connection=new Promise((resolve,reject)=>{const req=indexedDB.open('invoicepilot-demo-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('records',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Browser demo storage is unavailable. Allow site storage or create an account.'));}));
 return {async all(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('records'),request=tx.objectStore('records').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});},async write(records,remove=[]){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');for(const id of remove)store.delete(id);for(const record of records)store.put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('Demo could not be saved. Browser storage may be full.'));tx.onabort=()=>reject(new Error('Demo storage transaction failed.'));});}};
}
export function createDemoClient(store=demoStore()){
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 const ledgerFor=runs=>{const out={};for(const r of runs)if(r.status==='approved'&&r.matchedPO)out[r.matchedPO.id]=((cents(out[r.matchedPO.id]||0)+cents(r.invoice.total))/100);return out;};
 let queue=Promise.resolve();
 const locked=fn=>{const run=()=>globalThis.navigator?.locks?navigator.locks.request('invoicepilot-demo-write',fn):fn();const next=queue.then(run,run);queue=next.catch(()=>{});return next;};
 async function saveFile(file,text,method='pdf',confidence=null){
  const bytes=new Uint8Array(await file.arrayBuffer()),head=String.fromCharCode(...bytes.slice(0,5));
  if(file.size>10485760||!(head==='%PDF-'||bytes[0]===137&&bytes[1]===80||bytes[0]===255&&bytes[1]===216))throw new Error('Choose a valid PDF, PNG or JPEG up to 10 MB.');
  if(!text||text.length>100000||!['pdf','ocr','manual'].includes(method))throw new Error('Invoice text or extraction method is invalid.');
  const records=await store.all();if(records.length>=100)throw new Error('Demo holds up to 100 invoices. Clear the demo to continue.');
  const runs=records.map(r=>r.run),fileHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const invoice=extractInvoice(text),result=evaluateInvoice(invoice,runs,{method,ocrConfidence:confidence,fileHash,committedByPO:ledgerFor(runs)});delete invoice.rawText;
  const run={id:crypto.randomUUID(),createdAt:new Date().toISOString(),fileName:file.name,fileHash,isDemo:true,method,ocrConfidence:confidence,rawText:text,invoice,...result};
  await store.write([{id:run.id,run,file}]);return run;
 }
 async function start(){return await locked(async()=>{if((await store.all()).length)return;for(const id of ['happy','ambiguous']){const sample=SAMPLES.find(s=>s.id===id),bytes=Uint8Array.from(atob(DEMO_SAMPLE_FILES[id]),c=>c.charCodeAt(0));await saveFile(new File([bytes],sample.file,{type:'application/pdf'}),sample.text);}});}
 async function demoFetch(path,options={}){try{
  const url=new URL(path,'https://demo.local'),method=options.method||'GET';
  const records=await store.all(),runs=records.map(r=>({...r.run,documentAnalysis:summarizeDocumentChecks(r.run.checks)})),ledger=ledgerFor(runs);
  if(url.pathname==='/api/state')return reply({runs:runs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),vendors:VENDORS,policy:POLICY,purchaseOrders:PURCHASE_ORDERS.map(p=>({...p,vendor:VENDORS.find(v=>v.id===p.vendorId)?.name,committed:ledger[p.id]||0})),samples:SAMPLES.map(({text,...s})=>s)});
  const sample=url.pathname.match(/^\/api\/samples\/([^/]+)$/);
  if(sample){const s=SAMPLES.find(s=>s.id===sample[1]);if(!s)return reply({error:'Sample not found'},404);return new Response(Uint8Array.from(atob(DEMO_SAMPLE_FILES[s.id]),c=>c.charCodeAt(0)),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+s.file+'"'}});}
  if(url.pathname==='/api/runs'&&method==='POST')return await locked(async()=>{const form=options.body,file=form.get('file');const run=await saveFile(file,String(form.get('text')||''),String(form.get('method')||'pdf'),form.get('ocrConfidence')===null?null:Number(form.get('ocrConfidence')));return new Response(JSON.stringify({stage:'decision',state:'done',detail:run.summary,run})+'\n',{headers:{'Content-Type':'application/x-ndjson'}});});
  if(url.pathname==='/api/reset-demo'&&method==='POST')return await locked(async()=>{const all=await store.all();await store.write([],all.map(r=>r.id));return reply({cleared:all.length});});
  const match=url.pathname.match(/^\/api\/runs\/([a-z0-9-]+)\/(review|recheck|report\.pdf|file)$/);
  if(match){const record=records.find(r=>r.id===match[1]);if(!record)return reply({error:'Run not found'},404);
   if(match[2]==='review'&&method==='POST')return await locked(async()=>{const latest=await store.all(),item=latest.find(r=>r.id===match[1]);if(!item)return reply({error:'Run not found'},404);const run=prepareHumanReview(item.run,JSON.parse(options.body),latest.map(r=>r.run),ledgerFor(latest.map(r=>r.run)),{id:'browser-demo',email:'Demo reviewer'});await store.write([{...item,run}]);return reply(run);});
   if(match[2]==='file')return new Response(record.file,{headers:{'Content-Type':record.file.type||'application/pdf'}});
   let run=record.run;
   if(match[2]==='recheck'||url.searchParams.get('recheck')==='1'){const committed={...ledger};if(run.status==='approved'&&run.matchedPO)committed[run.matchedPO.id]=Math.max(0,(cents(committed[run.matchedPO.id]||0)-cents(run.invoice.total))/100);const invoice=extractInvoice(run.rawText),result=evaluateInvoice(invoice,runs.filter(r=>r.id!==run.id),{method:run.method,ocrConfidence:run.ocrConfidence,fileHash:run.fileHash,committedByPO:committed});delete invoice.rawText;run={...run,...result,invoice,analysisOnly:true,originalStatus:record.run.status,recheckedAt:new Date().toISOString()};}
   if(match[2]==='report.pdf')return new Response(invoiceReportPDF(run),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+run.id+'-report.pdf"'}});
   return reply(run);
  }
  return reply({error:'Demo route not found'},404);
 }catch(error){return reply({error:error.message},error.status||400);}}
 return {fetch:demoFetch,start};
}

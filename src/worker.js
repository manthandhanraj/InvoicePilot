import { VENDORS, PURCHASE_ORDERS, POLICY, SAMPLES } from './data.js';
import { extractInvoice, evaluateInvoice, cents, summarizeDocumentChecks } from './engine.js';
import { invoiceReportPDF } from './report.js';

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
async function user(request,env){if(env.resolveUser)return env.resolveUser(request);const id=request.headers.get('oai-authenticated-user-id');if(id)return id;const u=new URL(request.url);return ['localhost','127.0.0.1','[::1]'].includes(u.hostname)?'local_demo':null;}
async function history(env,owner){const runs=env.REPO?await env.REPO.history(owner):(await env.DB.prepare('SELECT payload FROM runs WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1000').bind(owner).all()).results.map(r=>JSON.parse(r.payload));return runs.map(r=>({...r,documentAnalysis:summarizeDocumentChecks(r.checks)}));}
async function ledger(env,owner){if(env.REPO)return env.REPO.ledger(owner);const r=await env.DB.prepare('SELECT po_id, SUM(total_cents) AS committed FROM approvals WHERE owner_id = ? GROUP BY po_id').bind(owner).all();return Object.fromEntries(r.results.map(x=>[x.po_id,x.committed/100]));}
async function storedRun(env,owner,id){const r=env.REPO?await env.REPO.getRun(id):JSON.parse((await env.DB.prepare('SELECT payload FROM runs WHERE owner_id=? AND id=?').bind(owner,id).first())?.payload||'null');return r?{...r,documentAnalysis:summarizeDocumentChecks(r.checks)}:null;}
async function recheckAnalysis(env,owner,run){
 const [previous,committedByPO]=await Promise.all([history(env,owner),ledger(env,owner)]);
 // Rechecking is read-only. Exclude this record's existing reservation for comparison,
 // but retain other claims and allocations so a preview cannot hide duplicates.
 if(run.status==='approved'&&run.matchedPO)committedByPO[run.matchedPO.id]=Math.max(0,(cents(committedByPO[run.matchedPO.id]??0)-cents(run.invoice.total))/100);
 const invoice=extractInvoice(run.rawText),result=evaluateInvoice(invoice,previous.filter(r=>r.id!==run.id),{method:run.method,ocrConfidence:run.ocrConfidence,fileHash:run.fileHash,committedByPO});delete invoice.rawText;
 return {...run,invoice,...result,stages:null,analysisOnly:true,originalStatus:run.status,originalSummary:run.summary,recheckedAt:new Date().toISOString()};
}
async function persist(env,owner,run){
  if(env.REPO)return env.REPO.persist(owner,run);
  const base=JSON.stringify(run),key=run.invoiceKey||'file:'+run.fileHash;
  const duplicate=JSON.stringify({...run,status:'rejected',summary:'Duplicate submission blocked.',reasons:['Another run already claimed this vendor/invoice number or file.'],checks:[...run.checks,{key:'concurrent-duplicate',label:'Duplicate reservation',state:'fail',detail:'An earlier or concurrent run already claimed this invoice.'}]});
  const over=JSON.stringify({...run,status:'review',summary:'PO balance changed during processing. Human review required.',reasons:['Another approved invoice consumed the available PO balance.'],checks:[...run.checks,{key:'concurrent-balance',label:'Atomic balance check',state:'review',detail:'Available PO balance changed. This invoice was not committed.'}]});
  if(run.status==='rejected'){
    await env.DB.prepare('INSERT INTO runs(id,owner_id,created_at,status,invoice_key,file_hash,po_id,total_cents,is_demo,payload) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(run.id,owner,run.createdAt,run.status,key,run.fileHash,run.matchedPO?.id??null,cents(run.invoice.total??0),run.isDemo?1:0,base).run();return run;
  }
  const statements=[env.DB.prepare('INSERT OR IGNORE INTO claims(owner_id,invoice_key,run_id) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM runs WHERE owner_id=? AND file_hash=? AND status != ?)').bind(owner,key,run.id,owner,run.fileHash,'rejected')];
  if(run.status==='approved')statements.push(env.DB.prepare('INSERT INTO approvals(run_id,owner_id,po_id,total_cents) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM claims WHERE owner_id=? AND invoice_key=? AND run_id=?) AND COALESCE((SELECT SUM(total_cents) FROM approvals WHERE owner_id=? AND po_id=?),0)+? <= ?').bind(run.id,owner,run.matchedPO.id,cents(run.invoice.total),owner,key,run.id,owner,run.matchedPO.id,cents(run.invoice.total),cents(run.matchedPO.amount+run.tolerance)));
  const claimed='EXISTS(SELECT 1 FROM claims WHERE owner_id=? AND invoice_key=? AND run_id=?)';
  const allocated='EXISTS(SELECT 1 FROM approvals WHERE run_id=?)';
  const statusSQL=run.status==='approved'?`CASE WHEN NOT ${claimed} THEN 'rejected' WHEN NOT ${allocated} THEN 'review' ELSE 'approved' END`:`CASE WHEN NOT ${claimed} THEN 'rejected' ELSE 'review' END`;
  const payloadSQL=run.status==='approved'?`CASE WHEN NOT ${claimed} THEN ? WHEN NOT ${allocated} THEN ? ELSE ? END`:`CASE WHEN NOT ${claimed} THEN ? ELSE ? END`;
  const args=[run.id,owner,run.createdAt,owner,key,run.id];
  if(run.status==='approved')args.push(run.id);
  args.push(key,run.fileHash,run.matchedPO?.id??null,cents(run.invoice.total??0),run.isDemo?1:0,owner,key,run.id,duplicate);
  if(run.status==='approved')args.push(run.id,over);
  args.push(base);
  statements.push(env.DB.prepare(`INSERT INTO runs(id,owner_id,created_at,status,invoice_key,file_hash,po_id,total_cents,is_demo,payload) SELECT ?,?,?,${statusSQL},?,?,?,?,?,${payloadSQL}`).bind(...args));
  await env.DB.batch(statements);
  const stored=await env.DB.prepare('SELECT payload FROM runs WHERE owner_id=? AND id=?').bind(owner,run.id).first();return JSON.parse(stored.payload);
}

export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname;
  try{
   if(path==='/'&&request.method==='GET')return new Response(HTML,{headers:{'Content-Type':'text/html;charset=utf-8'}});
   if(path==='/style.css')return new Response(CSS,{headers:{'Content-Type':'text/css;charset=utf-8'}});
   if(path==='/comfort.css')return new Response(COMFORT,{headers:{'Content-Type':'text/css;charset=utf-8'}});
 if(path==='/neon.css')return new Response(NEON,{headers:{'Content-Type':'text/css;charset=utf-8'}});
   if(path==='/app.js')return new Response(CLIENT,{headers:{'Content-Type':'text/javascript;charset=utf-8'}});
   if(path==='/favicon.svg')return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#123b35"/><path d="M18 16h28v32H18z" fill="none" stroke="#bce6ce" stroke-width="4"/><path d="m24 32 6 6 12-13" fill="none" stroke="#bce6ce" stroke-width="4"/></svg>',{headers:{'Content-Type':'image/svg+xml'}});
   if(!path.startsWith('/api/'))return json({error:'Not found'},404);
   if(path==='/api/config'&&request.method==='GET')return json({authMode:env.AUTH_MODE||'local',directUploads:Boolean(env.REPO),configured:true});
   const owner=await user(request,env);if(!owner)return json({error:'Sign in to access this invoice workspace.'},401);
   if(request.method!=='GET'&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'Cross-origin request blocked.'},403);
   if((!env.DB&&!env.REPO)||!env.BUCKET)return json({error:'Workspace storage is unavailable. Please try again shortly.'},503);
   if(path==='/api/state'&&request.method==='GET'){
     const [runs,committed]=await Promise.all([history(env,owner),ledger(env,owner)]);
     return json({runs,purchaseOrders:PURCHASE_ORDERS.map(p=>({...p,vendor:VENDORS.find(v=>v.id===p.vendorId)?.name,committed:committed[p.id]??0})),vendors:VENDORS,policy:POLICY,samples:SAMPLES.map(({text,...s})=>s)});
   }
   if(path.startsWith('/api/samples/')&&request.method==='GET'){
     const id=path.split('/')[3];if(!SAMPLE_FILES[id])return json({error:'Sample not found'},404);
     return new Response(Uint8Array.from(atob(SAMPLE_FILES[id]),c=>c.charCodeAt(0)),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${SAMPLES.find(s=>s.id===id).file}"`}});
   }
   if(path==='/api/reset-demo'&&request.method==='POST'){
     if(env.REPO){const ids=await env.REPO.resetDemo(owner);const cleaned=await Promise.allSettled(ids.map(id=>env.BUCKET.delete(owner+'/'+id)));return json({cleared:ids.length,cleanupPending:cleaned.some(r=>r.status==='rejected')});}
     const demos=await env.DB.prepare('SELECT id FROM runs WHERE owner_id=? AND is_demo=1').bind(owner).all();
     const ids=demos.results.map(r=>r.id);
     if(ids.length){const statements=[];for(const id of ids){statements.push(env.DB.prepare('DELETE FROM claims WHERE owner_id=? AND run_id=?').bind(owner,id));statements.push(env.DB.prepare('DELETE FROM approvals WHERE owner_id=? AND run_id=?').bind(owner,id));}statements.push(env.DB.prepare('DELETE FROM runs WHERE owner_id=? AND is_demo=1').bind(owner));await env.DB.batch(statements);await Promise.allSettled(ids.map(id=>env.BUCKET.delete(owner+'/'+id)));}
     return json({cleared:ids.length});
   }
   const reportMatch=path.match(/^\/api\/runs\/([a-z0-9-]+)\/(recheck|report\.pdf)$/);
   if(reportMatch&&request.method==='GET'){
     let record=await storedRun(env,owner,reportMatch[1]);if(!record)return json({error:'Run not found'},404);
     if(reportMatch[2]==='recheck'||url.searchParams.get('recheck')==='1')record=await recheckAnalysis(env,owner,record);
     if(reportMatch[2]==='recheck')return json(record);
     const name=(record.invoice.invoiceNumber||record.id).replace(/[^a-zA-Z0-9._-]/g,'_');
     return new Response(invoiceReportPDF(record),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+name+'-report.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   const fileMatch=path.match(/^\/api\/runs\/([a-z0-9-]+)\/file$/);
   if(fileMatch&&request.method==='GET'){
     if(env.REPO){const record=await env.REPO.getRun(fileMatch[1]);if(!record)return json({error:'Run not found'},404);const location=await env.BUCKET.signedDownload(owner+'/'+fileMatch[1]);return new Response(null,{status:302,headers:{Location:location,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}
     const r=await env.DB.prepare('SELECT payload FROM runs WHERE owner_id=? AND id=?').bind(owner,fileMatch[1]).first();if(!r)return json({error:'Run not found'},404);
     const file=await env.BUCKET.get(owner+'/'+fileMatch[1]);if(!file)return json({error:'Source document is unavailable'},404);
     return new Response(file.body,{headers:{'Content-Type':file.httpMetadata?.contentType??'application/pdf','Content-Disposition':'inline; filename="'+JSON.parse(r.payload).fileName.replace(/[^a-zA-Z0-9._-]/g,'_')+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(path==='/api/runs'&&request.method==='POST'){
     if(Number(request.headers.get('content-length'))>POLICY.maxFileBytes+250000)return json({error:'Maximum document size is 10 MB.'},413);
     let data,file,bytes,lease=null;
     if(env.REPO){
       const raw=await request.text();if(raw.length>250000)return json({error:'Invoice metadata is too large.'},413);
       const body=JSON.parse(raw);data=new Map(Object.entries(body));
     }else{data=await request.formData();file=data.get('file');}
     const text=String(data.get('text')??'').trim(),method=String(data.get('method')??'pdf');
     if(!text||text.length>100000)return json({error:'No readable invoice text found, or the document is too long. Use the transcription option.'},400);
     if(!['pdf','ocr','manual'].includes(method))return json({error:'Invalid extraction method'},400);
     if(env.REPO){lease=await env.REPO.consumeUpload(String(data.get('uploadId')||''));bytes=await env.BUCKET.read(owner+'/'+lease.id,POLICY.maxFileBytes);if(bytes.length!==Number(lease.file_size))return json({error:'Uploaded file size does not match the upload reservation.'},400);file={name:lease.file_name,size:bytes.length};}
     else{if(!file||typeof file==='string'||file.size>POLICY.maxFileBytes)return json({error:'Choose a PDF or image up to 10 MB.'},400);bytes=new Uint8Array(await file.arrayBuffer());}
     const head=String.fromCharCode(...bytes.slice(0,5));
     const mime=head==='%PDF-'?'application/pdf':bytes[0]===137&&bytes[1]===80?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':null;
     if(!mime)return json({error:'Only valid PDF, PNG or JPEG files are accepted.'},400);
     const hashBytes=await crypto.subtle.digest('SHA-256',bytes),fileHash=[...new Uint8Array(hashBytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
     if(lease&&mime!==lease.mime_type)return json({error:'The uploaded document format does not match its declared type.'},400);
     const isDemo=Object.values(SAMPLE_HASHES).includes(fileHash),id=lease?.id||crypto.randomUUID(),started=Date.now();
     const stream=new TransformStream(),writer=stream.writable.getWriter(),encoder=new TextEncoder(),stageLog=[];let connected=true;
     const emit=async(event)=>{if(event.stage)stageLog.push({stage:event.stage,state:event.state,detail:event.detail,at:new Date().toISOString(),elapsedMs:Date.now()-started});if(connected)try{await writer.write(encoder.encode(JSON.stringify(event)+'\n'));}catch{connected=false;}};
     const task=(async()=>{try{
       await emit({stage:'extract',state:'running',detail:'Reading invoice fields from '+(method==='ocr'?'OCR text':method==='manual'?'manual transcription':'PDF text')+'.'});
       const invoice=extractInvoice(text);
       await emit({stage:'extract',state:'done',invoice,detail:'Extracted invoice fields. Missing fields stay empty.'});
       await emit({stage:'validate',state:'running',detail:'Checking supplier, required fields and prior invoices.'});
       const [previous,committedByPO]=await Promise.all([history(env,owner),ledger(env,owner)]),result=evaluateInvoice(invoice,previous,{method,ocrConfidence:data.get('ocrConfidence')===null?null:Number(data.get('ocrConfidence')),fileHash,committedByPO});
       await emit({stage:'validate',state:'done',detail:result.checks.filter(c=>['required','date','vendor','duplicate'].includes(c.key)).map(c=>c.label+': '+c.state).join(' · ')});
       await emit({stage:'match',state:'running',detail:'Matching the purchase order and checking committed spend.'});
       await emit({stage:'match',state:'done',detail:result.matchedPO?result.matchedPO.id+' · '+result.matchMethod:result.candidates.length+' eligible PO candidates.'});
       await emit({stage:'decision',state:'running',detail:'Applying decision rules and reserving the PO balance.'});
       const rawText=invoice.rawText;delete invoice.rawText;
       const readDuration=Number(data.get('readDurationMs'));
       let run={id,createdAt:new Date().toISOString(),fileName:file.name.slice(0,180),fileHash,isDemo,method,ocrConfidence:method==='ocr'&&Number.isFinite(Number(data.get('ocrConfidence')))?Number(data.get('ocrConfidence')):null,invoice,rawText,...result,stages:[...stageLog],readDurationMs:Number.isFinite(readDuration)&&readDuration>=0?Math.min(readDuration,3600000):null,durationMs:Date.now()-started};
       if(!env.REPO)await env.BUCKET.put(owner+'/'+id,bytes,{httpMetadata:{contentType:mime}});
       try{run=await persist(env,owner,run);run.documentAnalysis=summarizeDocumentChecks(run.checks);}catch(error){if(!env.REPO)await env.BUCKET.delete(owner+'/'+id);throw error;}
       await emit({stage:'decision',state:'done',detail:run.summary,run});
     }catch(error){await emit({error:'Processing could not be confirmed. Check the invoice queue before retrying. '+(env.LOCAL_DEV?error.message:'Please check workspace availability if this continues.')});console.error('Invoice processing failed',error.message);}finally{try{await writer.close();}catch{}}})();
     ctx.waitUntil(task);
     return new Response(stream.readable,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   }
   return json({error:'Not found'},404);
  }catch(error){console.error(error.message);return json({error:env.LOCAL_DEV?error.message:'The request could not complete. Please try again.'},500);}
 }
};

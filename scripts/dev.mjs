import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {storage} from './local-storage.mjs';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
const env=storage(process.env.INVOICEPILOT_DATA_DIR||fileURLToPath(new URL('../.local/',import.meta.url)));
let cachedWorker,stamp=0;async function worker(){const file=new URL('../dist/server/index.js',import.meta.url);const time=statSync(file).mtimeMs;if(time!==stamp){cachedWorker=(await import('data:text/javascript;base64,'+readFileSync(file).toString('base64'))).default;stamp=time;}return cachedWorker;}
const server=createServer(async(req,res)=>{try{const buffers=[];let length=0;for await(const part of req){length+=part.length;if(length>11*1024*1024){res.writeHead(413);res.end('File is too large');return;}buffers.push(part);}const url=new URL(req.url,'http://127.0.0.1:'+port);const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v!==undefined&&!k.startsWith('oai-authenticated-'))headers.set(k,Array.isArray(v)?v.join(','):v);const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(buffers)}:{})});const tasks=[];const response=await(await worker()).fetch(request,env,{waitUntil:p=>tasks.push(p)});res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body){const reader=response.body.getReader();while(true){const {done,value}=await reader.read();if(done)break;res.write(Buffer.from(value));}}res.end();await Promise.allSettled(tasks);}catch(error){console.error(error);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Local server error: '+error.message}));}});
let port=Number(process.env.PORT||4173),retried=false;
const autoOpen=process.argv.includes('--open');
server.once('listening',()=>{
 port=server.address().port;
 const url='http://127.0.0.1:'+port;
 console.log('\nInvoicePilot is running: '+url);
 console.log('Keep this window open. Press Ctrl+C to stop.\n');
 if(autoOpen){
  const command=process.platform==='win32'?'explorer.exe':process.platform==='darwin'?'open':'xdg-open';
  execFile(command,[url],{windowsHide:true},error=>{if(error)console.log('Open the address above in your browser.');});
 }
});
server.on('error',error=>{
 if(error.code==='EADDRINUSE'&&autoOpen&&!retried){
  retried=true;
  console.log('Port '+port+' is busy; choosing another available local port.');
  server.listen(0,'127.0.0.1');
 }else{
  console.error('InvoicePilot could not start: '+error.message);
  env.close();process.exitCode=1;
 }
});
server.listen(port,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{env.close();process.exit(0);}));

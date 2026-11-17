import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {createVercelHandler} from '../src/vercel.js';

const worker=(await import('data:text/javascript;base64,'+readFileSync(new URL('../dist/server/index.js',import.meta.url)).toString('base64'))).default;
const tasks=[];
const handler=createVercelHandler(worker,process.env,fetch,p=>tasks.push(p));
const port=Number(process.env.PORT||4188);
const server=createServer(async(req,res)=>{
 try{
  const parts=[];let size=0;for await(const b of req){size+=b.length;if(size>300000){res.writeHead(413);res.end('Metadata exceeds 300 KB. Upload the document directly to storage.');return;}parts.push(b);}
  const url=new URL(req.url,'http://127.0.0.1:'+port),headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
  const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(parts)}:{})});
  let response;
  if(!url.pathname.startsWith('/api/'))response=await worker.fetch(request,{}, {waitUntil:p=>tasks.push(p)});
  else response=await handler(request);
  const resultHeaders=Object.fromEntries(response.headers);const cookies=response.headers.getSetCookie();if(cookies.length)resultHeaders['set-cookie']=cookies;
  res.writeHead(response.status,resultHeaders);if(response.body)for await(const chunk of response.body)res.write(Buffer.from(chunk));res.end();await Promise.allSettled(tasks.splice(0));
 }catch(error){if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
server.listen(port,'127.0.0.1',()=>{const url='http://127.0.0.1:'+port;console.log('Vercel-compatible preview: '+url);if(process.argv.includes('--open'))execFile(process.platform==='win32'?'explorer.exe':process.platform==='darwin'?'open':'xdg-open',[url],{windowsHide:true},error=>{if(error)console.log('Open the address above in your browser.');});});
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));

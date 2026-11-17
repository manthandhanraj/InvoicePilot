// Local QA fixture only. It is excluded from Vercel deployment; no real accounts are created.
import {createServer} from 'node:http';
import {supabaseFixture} from '../tests/helpers/supabase-fixture.mjs';
const port=Number(process.env.PORT||4189),fixture=await supabaseFixture('http://127.0.0.1:'+port);
const server=createServer(async(req,res)=>{res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:4188');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','content-type,x-upsert');if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}try{const body=[];for await(const b of req)body.push(b);const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);const request=new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(body)}:{})});const response=await fixture.fetcher(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){res.writeHead(500);res.end(error.message);}});
server.listen(port,'127.0.0.1',()=>console.log('Local Supabase-contract fixture ready on '+port));
process.on('SIGTERM',()=>server.close(async()=>{await fixture.close();process.exit(0);}));

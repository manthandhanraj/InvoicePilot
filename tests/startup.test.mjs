import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function harness(){
 const elements=new Map(),listeners=new Map(),requests=new Map(),started=new Map();
 const element=()=>({innerHTML:'',textContent:'',value:'',disabled:false,hidden:true,addEventListener(){},classList:{toggle(){}},setAttribute(){},removeAttribute(){}});
 const document={querySelector(key){if(!elements.has(key))elements.set(key,element());return elements.get(key);},querySelectorAll(){return [];},addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);}};
 const fetcher=(path)=>{const d=deferred();requests.set(path,d);started.get(path)?.resolve();return d.promise;};
 const waitFor=path=>{if(requests.has(path))return Promise.resolve();const d=deferred();started.set(path,d);return d.promise;};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const app=await new AsyncFunction('document','window','location','fetch','navigator','setTimeout','clearTimeout',readFileSync(new URL('../public/app.js',import.meta.url),'utf8')+'; return {startup,cancelStartup,showLogin,setSignup(){authView="signup";showLogin();},isSignedIn(){return signedIn;}};')(document,{addEventListener(){},scrollTo(){}},{hash:''},fetcher,{},setTimeout,clearTimeout);
 return {app,elements,listeners,requests,waitFor};
}

test('login is interactive before config resolves and session checks preserve typed values',async()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.match(html,/<main id="main">[\s\S]*id="login-form"/);assert.doesNotMatch(html,/Opening your workspace/);
 const h=await harness(),main=h.elements.get('#main'),markup=main.innerHTML;
 assert.match(markup,/Welcome back/);assert.match(markup,/Open demo workspace/);assert.equal(h.listeners.get('submit').length,1);
 h.elements.get('#login-email')??h.elements.set('#login-email',{value:''});h.elements.get('#login-email').value='typed@example.test';
 h.requests.get('/api/config').resolve(Response.json({authMode:'supabase',directUploads:true,configured:true}));await h.waitFor('/api/state');
 h.requests.get('/api/state').resolve(Response.json({error:'Sign in'},{status:401}));await h.waitFor('/api/auth/refresh');h.requests.get('/api/auth/refresh').resolve(Response.json({error:'No session'},{status:401}));await h.app.startup;
 assert.equal(main.innerHTML,markup);assert.equal(h.elements.get('#login-email').value,'typed@example.test');assert.equal(h.app.isSignedIn(),false);
});

test('a stale startup response cannot replace a user-selected signup screen',async()=>{
 const h=await harness();h.requests.get('/api/config').resolve(Response.json({authMode:'supabase',directUploads:true,configured:true}));await h.waitFor('/api/state');
 h.app.cancelStartup();h.app.setSignup();const markup=h.elements.get('#main').innerHTML;assert.match(markup,/Confirm password/);
 h.requests.get('/api/state').resolve(Response.json({runs:[],purchaseOrders:[],samples:[],vendors:[]}));await h.app.startup;
 assert.equal(h.elements.get('#main').innerHTML,markup);assert.equal(h.app.isSignedIn(),false);
});

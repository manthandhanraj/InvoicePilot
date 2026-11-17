import {supabaseClient} from './supabase.js';

const cookies=request=>Object.fromEntries((request.headers.get('cookie')||'').split(';').map(x=>{const at=x.indexOf('=');return at<0?['','']:[x.slice(0,at).trim(),x.slice(at+1).trim()];}));
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});}
function withSession(response,session,request){
 const headers=new Headers(response.headers),secure=new URL(request.url).protocol==='https:'?'; Secure':'';
 const cookie=(name,value,age)=>`${name}=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`;
 headers.append('Set-Cookie',cookie('ip_access',session?.access_token||'',session?Math.min(Number(session.expires_in)||3600,3600):0));
 headers.append('Set-Cookie',cookie('ip_refresh',session?.refresh_token||'',session?2592000:0));
 return new Response(response.body,{status:response.status,headers});
}
export function createVercelHandler(worker,config,fetcher=fetch,waitUntil=promise=>promise.catch(error=>console.error(error.message))){
 return async function handle(originalRequest){
  const url=new URL(originalRequest.url),route=url.searchParams.get('__route');
  if(route&&url.pathname==='/api/index'){url.pathname='/api/'+route.replace(/^\/+/, '');url.searchParams.delete('__route');}
  const request=url.toString()===originalRequest.url?originalRequest:new Request(url,originalRequest);
  const path=url.pathname;
  if(request.method!=='GET'&&request.method!=='HEAD'){
   const origin=request.headers.get('origin');
   if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Cross-origin request blocked.'},403);
  }
  const configured=Boolean(config.SUPABASE_URL&&(config.SUPABASE_ANON_KEY||config.SUPABASE_PUBLISHABLE_KEY)&&config.SUPABASE_SERVICE_ROLE_KEY);
  if(path==='/api/config'&&request.method==='GET')return json({authMode:'supabase',directUploads:true,configured});
  if(!configured)return json({error:'Server setup is incomplete. Add the three Supabase environment variables and redeploy.'},503);
  let sb;
  try{sb=supabaseClient(config,fetcher);}catch{return json({error:'Supabase server configuration is invalid. Check the project URL and server keys.'},503);}
  try{
   const jar=cookies(request);
   if(path==='/api/auth/login'&&request.method==='POST'){
    if(Number(request.headers.get('content-length'))>8192)return json({error:'Sign-in request is too large.'},413);
    const {email,password}=await request.json();
    if(typeof email!=='string'||email.length>254||typeof password!=='string'||password.length<1||password.length>1024)return json({error:'Enter your email and password.'},400);
    try{const session=await sb.signIn(email.trim(),password);if(!session.access_token||!session.refresh_token)throw new Error('No session');return withSession(json({user:{email:session.user?.email||email}}),session,request);}catch(error){const unavailable=!error.status||error.status>=500;return json({error:error.status===429?'Too many sign-in attempts. Try again later.':unavailable?'The sign-in service is unavailable. Please try again shortly.':'Sign-in failed. Check your email, password and account confirmation.'},error.status===429?429:unavailable?503:401);}
   }
   if(path==='/api/auth/refresh'&&request.method==='POST'){
    if(!jar.ip_refresh)return withSession(json({error:'Sign in to continue.'},401),null,request);
    try{const session=await sb.refresh(jar.ip_refresh);if(!session.access_token||!session.refresh_token)throw new Error('No session');return withSession(json({refreshed:true}),session,request);}catch{return withSession(json({error:'Session expired. Sign in again.'},401),null,request);}
   }
   if(path==='/api/auth/logout'&&request.method==='POST'){
    if(jar.ip_access)await sb.signOut(jar.ip_access).catch(()=>{});
    return withSession(json({signedOut:true}),null,request);
   }
   const account=await sb.getUser(jar.ip_access);
   if(!account)return json({error:'Sign in to access this invoice workspace.'},401);
   if(path==='/api/auth/me'&&request.method==='GET')return json({user:account});
   const env=sb.forOwner(account.id);
   if(path==='/api/uploads'&&request.method==='POST'){
    if(Number(request.headers.get('content-length'))>8192)return json({error:'Upload metadata is too large.'},413);
    const body=await request.json();
    if(typeof body.fileName!=='string'||!body.fileName.trim()||body.fileName.length>180||!Number.isInteger(body.size)||body.size<=0||body.size>10485760||!['application/pdf','image/png','image/jpeg'].includes(body.mime))return json({error:'Choose a PDF, PNG or JPEG up to 10 MB.'},400);
    return json(await env.REPO.createUpload(body.fileName,body.size,body.mime));
   }
   const upload=path.match(/^\/api\/uploads\/([a-f0-9-]+)$/);
   if(upload&&request.method==='DELETE'){await env.REPO.abortUpload(upload[1]);return json({released:true});}
   if(path==='/api/runs'&&request.method==='POST'&&!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Upload files directly to storage before submitting invoice metadata.'},415);
   return await worker.fetch(request,env,{waitUntil});
  }catch(error){
   console.error('Vercel request failed:',error.message);
   return json({error:'The request could not complete. Check your connection and workspace setup, then retry.'},error.status===429?429:500);
  }
 };
}

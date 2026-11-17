const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function supabaseClient(config,fetcher=fetch){
 const base=String(config.SUPABASE_URL||'').replace(/\/$/,''),anon=config.SUPABASE_ANON_KEY||config.SUPABASE_PUBLISHABLE_KEY,service=config.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!anon||!service)throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY on the server.');
 const parsed=new URL(base);if(parsed.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('Supabase requires an HTTPS project URL.');
 async function request(path,{method='GET',body,token,admin=false,raw=false}={}){
  const key=admin?service:anon,headers={apikey:key};
  if(token)headers.Authorization='Bearer '+token;else if(admin&&!service.startsWith('sb_secret_'))headers.Authorization='Bearer '+service;
  if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetcher(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  if(!response.ok){let error={};try{error=await response.json();}catch{}const e=new Error(error.msg||error.message||error.error_description||error.error||'Supabase request failed.');e.status=response.status;throw e;}
  if(raw)return response;if(response.status===204)return null;return response.json();
 }
 const rpc=(name,args)=>request('/rest/v1/rpc/'+name,{method:'POST',admin:true,body:args});
 function objectPath(owner,id){if(!UUID.test(owner)||!UUID.test(id))throw new Error('Invalid document identity');return owner+'/'+id;}
 return {
  async getUser(token){if(!token)return null;try{const u=await request('/auth/v1/user',{token});return UUID.test(u.id)?{id:u.id,email:u.email}:null;}catch(error){if(error.status===401||error.status===403)return null;throw error;}},
  signIn:(email,password)=>request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}),
  signUp:(email,password)=>request('/auth/v1/signup',{method:'POST',body:{email,password}}),
  refresh:token=>request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:token}}),
  signOut:token=>request('/auth/v1/logout?scope=local',{method:'POST',token}),
  forOwner(owner){if(!UUID.test(owner))throw new Error('Invalid user identity');
   const repository={
    async history(){const rows=await request('/rest/v1/ip_runs?owner_id=eq.'+owner+'&select=payload&order=created_at.desc&limit=1000',{admin:true});return rows.map(r=>r.payload);},
    ledger:()=>rpc('ip_ledger',{p_owner:owner}),
    persist:(_owner,run)=>rpc('ip_persist_run',{p_owner:owner,p_run:run}),
    review:(id,run)=>rpc('ip_review_run',{p_owner:owner,p_id:id,p_run:run}),
    async getRun(id){if(!UUID.test(id))return null;const rows=await request('/rest/v1/ip_runs?owner_id=eq.'+owner+'&id=eq.'+id+'&select=payload&limit=1',{admin:true});return rows[0]?.payload??null;},
    async createUpload(name,size,mime){const id=crypto.randomUUID();await rpc('ip_create_upload',{p_owner:owner,p_id:id,p_name:name,p_size:size,p_mime:mime});const path=objectPath(owner,id);try{const signed=await request('/storage/v1/object/upload/sign/invoicepilot/'+path,{method:'POST',admin:true,body:{}});const url=new URL(base+'/storage/v1'+signed.url);if(url.origin!==parsed.origin)throw new Error('Unexpected upload URL');return {id,url:url.toString(),path};}catch(error){await rpc('ip_abort_upload',{p_owner:owner,p_id:id}).catch(()=>{});throw error;}},
    consumeUpload(id){if(!UUID.test(id))throw new Error('Invalid upload identity');return rpc('ip_consume_upload',{p_owner:owner,p_id:id});},
    async abortUpload(id){if(!UUID.test(id))return false;const remove=await rpc('ip_abort_upload',{p_owner:owner,p_id:id});if(remove)await bucket.delete(objectPath(owner,id));return remove;},
    resetDemo:()=>rpc('ip_reset_demo',{p_owner:owner})
   };
   const bucket={
    async read(key,maxBytes){if(!key.startsWith(owner+'/'))throw new Error('Document access denied');const response=await request('/storage/v1/object/authenticated/invoicepilot/'+key,{admin:true,raw:true});if(Number(response.headers.get('content-length'))>maxBytes)throw new Error('Maximum document size is 10 MB.');const reader=response.body.getReader(),chunks=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes){await reader.cancel();throw new Error('Maximum document size is 10 MB.');}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;},
    async signedDownload(key){if(!key.startsWith(owner+'/'))throw new Error('Document access denied');const r=await request('/storage/v1/object/sign/invoicepilot/'+key,{method:'POST',admin:true,body:{expiresIn:60}});const url=new URL(base+'/storage/v1'+(r.signedURL||r.signedUrl));if(url.origin!==parsed.origin)throw new Error('Unexpected document URL');return url.toString();},
    async delete(key){if(!key.startsWith(owner+'/'))throw new Error('Document access denied');await request('/storage/v1/object/invoicepilot',{method:'DELETE',admin:true,body:{prefixes:[key]}});}
   };
   return {REPO:repository,BUCKET:bucket,AUTH_MODE:'supabase',resolveUser:async()=>owner};
  }
 };
}

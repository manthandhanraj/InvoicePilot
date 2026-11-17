import {postgresFixture,OWNER_A,OWNER_B} from './postgres-fixture.mjs';

export async function supabaseFixture(base='https://fixture.supabase.co'){
 const pg=await postgresFixture(),objects=new Map(),uploadTokens=new Map(),calls=[];
 const users={['access-a']:{id:OWNER_A,email:'reviewer@example.test'},['access-b']:{id:OWNER_B,email:'other@example.test'}};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 const config={SUPABASE_URL:base,SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service'};
 async function fetcher(input,options={}){
  const req=input instanceof Request?input:new Request(input,options),url=new URL(req.url),path=url.pathname;
  calls.push({method:req.method,path,size:Number(req.headers.get('content-length')||0)});
  const token=req.headers.get('authorization')?.replace(/^Bearer /,''),service=req.headers.get('apikey')===config.SUPABASE_SERVICE_ROLE_KEY;
  try{
   if(path==='/auth/v1/token'){
    const body=await req.json();
    if(url.searchParams.get('grant_type')==='refresh_token')return body.refresh_token==='refresh-a'?reply({access_token:'access-a',refresh_token:'refresh-a',expires_in:3600}):reply({message:'Invalid refresh token'},401);
    const user=body.email==='reviewer@example.test'?users['access-a']:body.email==='other@example.test'?users['access-b']:null;
    if(!user||body.password!=='test-only-password')return reply({message:'Invalid login credentials'},400);
    return reply({access_token:user.id===OWNER_A?'access-a':'access-b',refresh_token:'refresh-a',expires_in:3600,user});
   }
   if(path==='/auth/v1/user')return users[token]?reply(users[token]):reply({message:'Invalid session'},401);
   if(path==='/auth/v1/logout')return new Response(null,{status:204});
   const signed=path.match(/^\/storage\/v1\/object\/upload\/sign\/invoicepilot\/(.+)$/);
   if(signed&&req.method==='PUT'){
    const key=signed[1];if(uploadTokens.get(key)!==url.searchParams.get('token'))return reply({message:'Invalid signed upload token'},403);
    if(objects.has(key))return reply({message:'Already uploaded'},409);
    const form=await req.formData(),file=form.get('');if(!file||file.size>10485760)return reply({message:'Invalid file'},413);
    objects.set(key,{bytes:new Uint8Array(await file.arrayBuffer()),type:file.type});return reply({Key:'invoicepilot/'+key});
   }
   if(!service)return reply({message:'Service key is required'},403);
   if(path.startsWith('/rest/v1/rpc/')){
    const name=path.split('/').at(-1),body=await req.json();return reply(await pg.rpc(name,body));
   }
   if(path==='/rest/v1/ip_runs'){
    const owner=url.searchParams.get('owner_id')?.slice(3),id=url.searchParams.get('id')?.slice(3);
    const result=id?await pg.db.query('select payload from public.ip_runs where owner_id=$1 and id=$2 limit 1',[owner,id]):await pg.db.query('select payload from public.ip_runs where owner_id=$1 order by created_at desc limit 1000',[owner]);return reply(result.rows);
   }
   if(signed&&req.method==='POST'){const key=signed[1],token=crypto.randomUUID();uploadTokens.set(key,token);return reply({url:'/object/upload/sign/invoicepilot/'+key+'?token='+token});}
   const download=path.match(/^\/storage\/v1\/object\/authenticated\/invoicepilot\/(.+)$/);
   if(download){const value=objects.get(download[1]);return value?new Response(value.bytes,{headers:{'Content-Type':value.type}}):reply({message:'Object not found'},404);}
   const signing=path.match(/^\/storage\/v1\/object\/sign\/invoicepilot\/(.+)$/);
   if(signing)return reply({signedURL:'/object/sign/invoicepilot/'+signing[1]+'?token=fixture-download'});
   if(path==='/storage/v1/object/invoicepilot'&&req.method==='DELETE'){const {prefixes}=await req.json();for(const key of prefixes)objects.delete(key);return reply([]);}
   return reply({message:'Fixture route not found: '+path},404);
  }catch(error){return reply({message:error.message},400);}
 }
 return {...pg,config,fetcher,objects,calls,users};
}

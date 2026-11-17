import './build.mjs';
import {mkdirSync,cpSync} from 'node:fs';
const root=new URL('../',import.meta.url),client=new URL('dist/client/',root);
mkdirSync(client,{recursive:true});
cpSync(new URL('dist/demo.js',root),new URL('demo.js',client));
for(const name of ['index.html','style.css','comfort.css','neon.css','app.js','favicon.svg'])cpSync(new URL('public/'+name,root),new URL(name,client));
console.log('Vercel assets ready. API entrypoint: api/index.js; database/storage: Supabase.');

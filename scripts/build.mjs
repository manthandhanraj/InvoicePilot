import {readFileSync,writeFileSync,mkdirSync,cpSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SAMPLES} from '../src/data.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const dir=new URL('../dist/',import.meta.url);mkdirSync(new URL('server/',dir),{recursive:true});mkdirSync(new URL('.openai/',dir),{recursive:true});
const files={},hashes={};for(const s of SAMPLES){const bytes=readFileSync(new URL('../samples/'+s.file,import.meta.url));files[s.id]=bytes.toString('base64');hashes[s.id]=createHash('sha256').update(bytes).digest('hex');}
const stripImports=source=>source.replace(/^import .+;\r?\n/gm,'').replace(/^export \{[^}]+\};\r?\n/gm,'').replace(/export (const|function) /g,'$1 ');
const demoBundle=['src/data.js','src/extraction.js','src/engine.js','src/review.js','src/report.js'].map(p=>stripImports(read(p))).join('\n')+'\nconst DEMO_SAMPLE_FILES='+JSON.stringify(files)+';\n'+read('public/demo.js');
const constants={HTML:read('public/index.html'),CSS:read('public/style.css'),COMFORT:read('public/comfort.css'),NEON:read('public/neon.css'),CLIENT:read('public/app.js'),DEMO:demoBundle,SAMPLE_FILES:files,SAMPLE_HASHES:hashes};
let output=Object.entries(constants).map(([k,v])=>'const '+k+' = '+JSON.stringify(v)+';').join('\n')+'\n';
for(const p of ['src/data.js','src/extraction.js','src/engine.js','src/review.js','src/report.js','src/worker.js'])output+=stripImports(read(p))+'\n';
writeFileSync(new URL('demo.js',dir),demoBundle);
writeFileSync(new URL('server/index.js',dir),output);
// Hosting metadata is only used by the original hosting target and is excluded
// from Vercel uploads. The shared server bundle does not depend on it.
const hostingManifest=new URL('../.openai/hosting.json',import.meta.url);
if(existsSync(hostingManifest)){
  cpSync(hostingManifest,new URL('.openai/hosting.json',dir));
  cpSync(new URL('../drizzle/',import.meta.url),new URL('.openai/drizzle/',dir),{recursive:true});
}
console.log('Built invoice workspace, embedded browser assets, sample PDFs and database migrations.');

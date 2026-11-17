import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
export function storage(directory){
 mkdirSync(directory,{recursive:true});const db=new DatabaseSync(join(directory,'workspace.sqlite'));db.exec('PRAGMA journal_mode = WAL');
 if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='runs'").get())db.exec(readFileSync(new URL('../drizzle/0000_invoicepilot.sql',import.meta.url),'utf8'));
 class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async all(){return {results:db.prepare(this.sql).all(...this.args)};}async first(){return db.prepare(this.sql).get(...this.args)??null;}async run(){const result=db.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(result.changes)}};}}
 const DB={prepare(sql){return new Statement(sql);},async batch(statements){db.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>{const r=db.prepare(s.sql).run(...s.args);return {success:true,meta:{changes:Number(r.changes)}};});db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};
 const keyPath=key=>{if(key.includes('..')||!/^[-a-zA-Z0-9_/]+$/.test(key))throw new Error('Invalid file key');return join(directory,'files',...key.split('/'));};
 const BUCKET={async put(key,bytes,options){const path=keyPath(key);mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,Buffer.from(bytes));writeFileSync(path+'.json',JSON.stringify(options));},async get(key){const path=keyPath(key);if(!existsSync(path))return null;const options=JSON.parse(readFileSync(path+'.json','utf8'));return {body:readFileSync(path),httpMetadata:options.httpMetadata};},async delete(key){const path=keyPath(key);for(const p of [path,path+'.json'])if(existsSync(p))unlinkSync(p);}};
 return {DB,BUCKET,LOCAL_DEV:true,close:()=>db.close()};
}

import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
export function storage(directory){
 mkdirSync(directory,{recursive:true});const db=new DatabaseSync(join(directory,'workspace.sqlite'));db.exec('PRAGMA journal_mode = WAL');
 if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='runs'").get())db.exec(readFileSync(new URL('../drizzle/0000_invoicepilot.sql',import.meta.url),'utf8'));
 class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async all(){return {results:db.prepare(this.sql).all(...this.args)};}async first(){return db.prepare(this.sql).get(...this.args)??null;}async run(){const result=db.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(result.changes)}};}}
 const DB={prepare(sql){return new Statement(sql);},async batch(statements){db.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>{const r=db.prepare(s.sql).run(...s.args);return {success:true,meta:{changes:Number(r.changes)}};});db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};
 DB.review=async(owner,id,run)=>{
  db.exec('BEGIN IMMEDIATE');try{
   const row=db.prepare('SELECT payload,status FROM runs WHERE owner_id=? AND id=?').get(owner,id);
   if(!row||row.status!=='review')throw new Error('This invoice has already been decided. Refresh the queue.');
   const original=JSON.parse(row.payload),amount=Math.round(run.invoice.total*100)||0;
   if(run.status==='approved'){
    if(db.prepare('SELECT 1 FROM claims WHERE owner_id=? AND invoice_key=? AND run_id<>?').get(owner,run.invoiceKey,id)||db.prepare("SELECT 1 FROM runs WHERE owner_id=? AND file_hash=? AND id<>? AND status<>'rejected'").get(owner,original.fileHash,id))throw new Error('A duplicate invoice cannot be approved.');
    if(run.matchedPO){
     const committed=db.prepare('SELECT COALESCE(SUM(total_cents),0) AS total FROM approvals WHERE owner_id=? AND po_id=?').get(owner,run.matchedPO.id).total;
     if(committed+amount>Math.round((run.matchedPO.amount+run.tolerance)*100))throw new Error('PO balance changed. Refresh the invoice before approving.');
     db.prepare('INSERT INTO approvals(run_id,owner_id,po_id,total_cents) VALUES(?,?,?,?)').run(id,owner,run.matchedPO.id,amount);
    }
   }
   db.prepare('DELETE FROM claims WHERE owner_id=? AND run_id=?').run(owner,id);
   if(run.status==='approved')db.prepare('INSERT INTO claims(owner_id,invoice_key,run_id) VALUES(?,?,?)').run(owner,run.invoiceKey,id);
   db.prepare('UPDATE runs SET status=?,invoice_key=?,po_id=?,total_cents=?,payload=? WHERE owner_id=? AND id=?').run(run.status,run.invoiceKey,run.matchedPO?.id??null,amount,JSON.stringify(run),owner,id);
   db.exec('COMMIT');return run;
  }catch(error){db.exec('ROLLBACK');throw error;}
 };
 const keyPath=key=>{if(key.includes('..')||!/^[-a-zA-Z0-9_/]+$/.test(key))throw new Error('Invalid file key');return join(directory,'files',...key.split('/'));};
 const BUCKET={async put(key,bytes,options){const path=keyPath(key);mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,Buffer.from(bytes));writeFileSync(path+'.json',JSON.stringify(options));},async get(key){const path=keyPath(key);if(!existsSync(path))return null;const options=JSON.parse(readFileSync(path+'.json','utf8'));return {body:readFileSync(path),httpMetadata:options.httpMetadata};},async delete(key){const path=keyPath(key);for(const p of [path,path+'.json'])if(existsSync(p))unlinkSync(p);}};
 return {DB,BUCKET,LOCAL_DEV:true,close:()=>db.close()};
}

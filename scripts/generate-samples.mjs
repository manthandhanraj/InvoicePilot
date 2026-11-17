import {writeFileSync,mkdirSync} from 'node:fs';
import {SAMPLES} from '../src/data.js';
mkdirSync(new URL('../samples/',import.meta.url),{recursive:true});
function pdf(text){
const escape=s=>s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const stream=['0.09 0.25 0.21 rg','BT','/F1 20 Tf','50 780 Td','(INVOICE) Tj','/F1 11 Tf',...text.split('\n').filter(x=>x!=='INVOICE').map((line,i)=>`0 -${i===0?44:28} Td (${escape(line)}) Tj`),'ET','0.7 0.76 0.67 RG','50 95 m 545 95 l S','BT /F1 8 Tf 50 78 Td (Synthetic invoice - InvoicePilot case study test input) Tj ET'].join('\n');
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
let out='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${o}\nendobj\n`;});const start=Buffer.byteLength(out);out+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return out;
}
for(const s of SAMPLES)if(!['scanned','scan-complete'].includes(s.id))writeFileSync(new URL('../samples/'+s.file,import.meta.url),pdf(s.text));
console.log('Generated text PDF fixtures. Generate image-only PDFs with scripts/generate-scan.py.');

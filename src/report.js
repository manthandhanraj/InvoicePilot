// Dependency-free PDF output shared by the local, Vercel and Worker builds.
// Every PDF string is escaped; invoice content is never interpreted as PDF code.
import {summarizeDocumentChecks} from './engine.js';
export function invoiceReportPDF(run){
 const pages=[];let commands=[],y=770;
 const plain=value=>String(value??'Not found').replace(/\u20b9/g,'INR ').replace(/\u20ac/g,'EUR ').replace(/\u00a3/g,'GBP ').replace(/[\r\n\t]+/g,' ').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 const quote=s=>'('+s.replace(/[\\()]/g,'\\$&')+')';
 function newPage(){if(commands.length)pages.push(commands);commands=[];y=770;commands.push('0.08 0.12 0.21 rg 0 795 595 47 re f','0.76 0.65 1 rg BT /F2 14 Tf 44 812 Td (invoicepilot. / Invoice analysis report) Tj ET');}
 function line(value,{size=10,bold=false,color='0.10 0.15 0.24',space=14}={}){if(y<62)newPage();commands.push(`${color} rg BT /${bold?'F2':'F1'} ${size} Tf 44 ${y} Td ${quote(plain(value))} Tj ET`);y-=space;}
 function text(value,options={}){const words=plain(value).match(/\S+/g)||[''],max=Math.floor(88*10/(options.size||10));let row='';for(let word of words){while(word.length>max){if(row){line(row,options);row='';}line(word.slice(0,max),options);word=word.slice(max);}if((row+' '+word).length>max){line(row,options);row='';}row+=(row?' ':'')+word;}if(row)line(row,options);}
 function section(label){y-=9;if(y<110)newPage();text(label,{size:12,bold:true,color:'0.40 0.22 0.70',space:20});}
 const amount=(v,currency=run.invoice.currency)=>v===null||v===undefined?'Not found':(currency||'Currency unknown')+' '+Number(v).toFixed(2);
 newPage();text(run.invoice.invoiceNumber||'Invoice without a number',{size:20,bold:true,space:27});
 const analysis=summarizeDocumentChecks(run.checks);
 text(analysis.title,{bold:true,space:19});text(analysis.summary);
 text('AP approval: '+({approved:'Approved - eligible for AP approval',review:'Pending procurement verification',rejected:'Rejected / blocked'}[run.status]||run.status),{bold:true,space:20});text(run.summary);
 if(run.analysisOnly){text('RECHECK PREVIEW - original saved decision: '+run.originalStatus,{bold:true});text('Latest extraction and current rules only. No saved decision or PO allocation was changed.');}
 if(run.humanReview){section('Human review');text('Reviewer: '+(run.humanReview.reviewerEmail||run.humanReview.reviewerId));text('Reviewed: '+run.humanReview.reviewedAt);text('Decision: '+run.humanReview.decision);text('Reason: '+run.humanReview.note);if(run.humanReview.nonPO)text('Verified non-PO exception: no PO balance was reserved.');for(const [key,change]of Object.entries(run.humanReview.changes||{}))text(key+': '+(change.before??'Not found')+' -> '+change.after);text('Original automatic decision: '+run.automation.status);for(const reason of run.automation.reasons||[])text('Original finding: '+reason);}
 section('Invoice fields');
 for(const [label,value]of [['Vendor',run.invoice.vendor],['Invoice number',run.invoice.invoiceNumber],['Invoice date',run.invoice.date],['Currency',run.invoice.currency?(run.invoice.currency+(run.invoice.currencyDetection?.name?' - '+run.invoice.currencyDetection.name:'')):(run.invoice.currencyDetection?.name||'Not identified')],['PO reference',run.invoice.poNumber],['Subtotal',amount(run.invoice.subtotal)],['Discount',amount(run.invoice.discount)],['Tax',amount(run.invoice.tax)],['Shipping',amount(run.invoice.shipping)],['Round-off',amount(run.invoice.roundoff)],['Invoice total',amount(run.invoice.total)]])text(label+': '+(value??'Not found'));
 section('Checks and findings');for(const check of run.checks||[]){text('['+check.state.toUpperCase()+'] '+check.label,{bold:true});text(check.detail);y-=3;}
 section('Procurement context');text('Matched purchase order: '+(run.matchedPO?.id||'No trusted match'));if(run.candidates?.length)text('Candidates: '+run.candidates.map(p=>p.id).join(', '));
 if(run.matchedPO){text('PO currency: '+run.matchedPO.currency);text('Committed before this analysis: '+amount(run.committed,run.matchedPO.currency));text('Available PO balance: '+amount(run.remaining,run.matchedPO.currency));text('Cumulative tolerance: '+amount(run.tolerance,run.matchedPO.currency));}
 section('Traceability and scope');text('Source file: '+run.fileName);text('Extraction method: '+run.method);text('Run: '+run.id);text('Saved: '+run.createdAt);if(run.recheckedAt)text('Rechecked: '+run.recheckedAt);text('SHA-256: '+run.fileHash);text('Approved is approval eligibility, not a payment. Unregistered suppliers and missing procurement records require human review. The original document remains the source of truth.');if(/[^\x00-\x7f]/.test(String(run.invoice.vendor||'')+String(run.fileName||'')))text('Non-Latin text uses Unicode escapes; consult the source for exact characters.',{size:8,space:12});
 pages.push(commands);
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
 pages.forEach((cmd,i)=>{cmd.push(`0.4 0.45 0.55 rg BT /F1 8 Tf 44 30 Td (InvoicePilot / Page ${i+1} of ${pages.length}) Tj ET`);const pageId=5+i*2,stream=cmd.join('\n');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId+1} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);});
 objects[1]=`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>(5+i*2)+' 0 R').join(' ')}] >>`;
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const start=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;return new TextEncoder().encode(pdf);
}

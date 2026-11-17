import {evaluateInvoice, normalize, cents} from './engine.js';

export function reviewError(message,status=400){const error=new Error(message);error.status=status;return error;}

// This runs on the server for real accounts and locally for the isolated demo.
export function prepareHumanReview(run,input,previous,committedByPO,reviewer){
 if(run.status!=='review')throw reviewError('This invoice has already been decided. Refresh the queue.',409);
 if(!input||!['approved','rejected'].includes(input.decision))throw reviewError('Choose Approve or Reject.');
 const note=typeof input.note==='string'?input.note.trim():'';
 if(note.length<5||note.length>2000)throw reviewError('Enter a review reason between 5 and 2,000 characters.');
 const invoice=structuredClone(run.invoice),changes={};
 if(input.decision==='approved'){
  if(input.acknowledged!==true)throw reviewError('Confirm that you checked the source document and all flagged findings.');
  for(const key of ['vendor','invoiceNumber','date','currency','total','poNumber']){
   if(!Object.hasOwn(input.fields||{},key))continue;
   let value=input.fields[key];
   if(key==='total'){if(typeof value!=='number'||!Number.isFinite(value)||value<=0||!Number.isSafeInteger(cents(value)))throw reviewError('Enter a positive invoice total.');}
   else {if(typeof value!=='string'||value.length>200)throw reviewError('Invalid '+key+'.');value=value.trim();if(key==='currency')value=value.toUpperCase();if(key==='poNumber'&&!value)value=null;}
   if(value!==invoice[key]){changes[key]={before:invoice[key]??null,after:value};invoice[key]=value;}
  }
  if(!invoice.vendor||!invoice.invoiceNumber||!Number.isFinite(invoice.total)||invoice.total<=0||!Number.isSafeInteger(cents(invoice.total)))throw reviewError('Confirm the supplier, invoice number and positive total before approval.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(invoice.date||''))throw reviewError('Confirm the invoice date as YYYY-MM-DD.');
  const date=new Date(invoice.date+'T00:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==invoice.date||date>new Date())throw reviewError('Confirm a valid invoice date that is not in the future.');
  if(!/^[A-Z]{3}$/.test(invoice.currency||''))throw reviewError('Confirm the three-letter invoice currency.');
 }
 const result=evaluateInvoice(invoice,previous.filter(r=>r.id!==run.id),{method:run.method,ocrConfidence:run.ocrConfidence,fileHash:run.fileHash,committedByPO});
 if(input.decision==='approved'){
  if(result.checks.some(c=>['duplicate','vendor'].includes(c.key)&&c.state==='fail'))throw reviewError('A duplicate invoice or blocked supplier cannot be approved.',409);
  if(result.matchedPO){
   if(result.checks.some(c=>['ownership','open','currency','balance'].includes(c.key)&&c.state!=='pass'))throw reviewError('Resolve the PO supplier, currency, open status and available balance before approval.',409);
  }else if(invoice.poNumber||input.nonPO!==true)throw reviewError('Select a valid PO, or clear the PO reference and explicitly confirm a verified non-PO exception.');
 }
 const approved=input.decision==='approved';
 const humanReview={decision:input.decision,note,reviewerId:reviewer.id,reviewerEmail:reviewer.email||null,reviewedAt:new Date().toISOString(),changes,acknowledged:approved,nonPO:approved&&!result.matchedPO};
 const current=approved?{...result,invoice}:{};
 return {...run,...current,invoice:approved?invoice:run.invoice,
  invoiceKey:approved?(result.invoiceKey||'manual:'+normalize(invoice.vendor)+':'+normalize(invoice.invoiceNumber)):run.invoiceKey,
  automation:run.automation||{status:run.status,summary:run.summary,reasons:run.reasons,checks:run.checks,invoice:run.invoice},
  status:input.decision,summary:approved?'Approved after human review.':'Rejected after human review.',reasons:[note],humanReview,
  checks:[...(approved?result.checks:run.checks),{key:'human-review',label:'Human review',state:approved?'pass':'fail',detail:(reviewer.email||reviewer.id)+': '+note}],
  analysisOnly:false,updatedAt:humanReview.reviewedAt};
}

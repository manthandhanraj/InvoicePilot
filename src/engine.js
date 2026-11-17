import { VENDORS, PURCHASE_ORDERS, POLICY } from './data.js';
import { normalize, cents, parseMoney, extractInvoice } from './extraction.js';
export { normalize, cents, parseMoney, extractInvoice };

// Document analysis is independent of supplier registration and payment approval.
export function summarizeDocumentChecks(checks=[]){
  const keys=new Set(['extraction','required','currency-detection','date','positive','duplicate','concurrent-duplicate','math','items','ocr','manual']);
  const documentChecks=checks.filter(c=>keys.has(c.key));
  const passed=documentChecks.filter(c=>c.state==='pass').length,attention=documentChecks.filter(c=>c.state==='review').length,blocked=documentChecks.filter(c=>c.state==='fail').length,unverified=documentChecks.filter(c=>c.state==='info').length;
  const status=blocked?'blocked':attention?'review':'complete';
  return {status,passed,attention,blocked,unverified,total:documentChecks.length,title:blocked?'Invoice analysed - blocking issue found':attention?'Invoice analysed - findings need attention':'Invoice analysis complete',summary:`${passed} document checks passed; ${attention+blocked} findings need attention; ${unverified} checks could not be verified from the source.`,checks:documentChecks};
}

export function evaluateInvoice(invoice, history=[], options={}) {
  const checks=[];let rejected=false,review=false;
  const add=(key,label,state,detail)=>{checks.push({key,label,state,detail});if(state==='fail')rejected=true;if(state==='review')review=true;};
  const now=options.now??new Date();
  if(invoice.extractionWarnings?.length)add('extraction','Extraction ambiguity','review',invoice.extractionWarnings.join(' '));
  const missing=['vendor','invoiceNumber','date','currency','total'].filter(k=>invoice[k]===null||invoice[k]===undefined||invoice[k]==='');
  add('required','Required information',missing.length?'review':'pass',missing.length?'Missing: '+missing.join(', ')+'. Confirm these fields before approval.':'Vendor, invoice number, date, currency and total are present.');
  add('currency-detection','Invoice currency',invoice.currency?'pass':'review',invoice.currency?invoice.currency+(invoice.currencyDetection?.name?' - '+invoice.currencyDetection.name:'')+'. '+(invoice.currencyDetection?.basis||'Currency recorded in the invoice fields.'):invoice.currencyDetection?.basis||'Currency was not identified. No USD or other default is assumed.');
  if(invoice.total!==null&&(!Number.isFinite(invoice.total)||invoice.total<=0))add('positive','Payable amount','review','Invoice total must be a positive finite amount. Credit notes need a separate workflow.');
  let dateValid=false;
  if(invoice.date){
    if(/^\d{4}-\d{2}-\d{2}$/.test(invoice.date)){
      const d=new Date(invoice.date+'T00:00:00Z');dateValid=Number.isFinite(+d)&&d.toISOString().slice(0,10)===invoice.date;
      add('date','Invoice date',!dateValid||d>now?'review':'pass',!dateValid?'The invoice date is invalid.':d>now?'Invoice date is in the future.':'Valid ISO invoice date.');
    }else add('date','Invoice date','review','Date format is ambiguous. Confirm an ISO date (YYYY-MM-DD).');
  }
  const vendor=VENDORS.find(v=>[v.name,...v.aliases].some(n=>normalize(n)===normalize(invoice.vendor)));
  add('vendor','Approved vendor',vendor?.approved?'pass':vendor?'fail':'review',vendor?vendor.approved?vendor.name+' is on the approved vendor list.':vendor.name+' is not approved for payment.':'The supplier is not in the configured approved-vendor dataset. Procurement must confirm registration; invoice analysis and the report remain available.');
  const key=vendor&&invoice.invoiceNumber?`${vendor.id}:${normalize(invoice.invoiceNumber)}`:null;
  const duplicate=history.find(r=>r.status!=='rejected'&&((key&&r.invoiceKey===key&&invoice.invoiceNumber)||(options.fileHash&&r.fileHash===options.fileHash)));
  add('duplicate','Duplicate detection',duplicate?'fail':'pass',duplicate?'Already received in run '+duplicate.id.slice(0,8)+'. Repeated submission blocked.':'No earlier invoice with this vendor/number or identical file.');
  let matchedPO=null,candidates=[],matchMethod=null;
  if(invoice.poNumber){
    matchedPO=PURCHASE_ORDERS.find(p=>normalize(p.id)===normalize(invoice.poNumber))??null;matchMethod='Explicit reference';
    add('po','Purchase order',matchedPO?'pass':'review',matchedPO?'Matched '+matchedPO.id+' from the invoice reference.':'Referenced PO does not exist in the purchase-order dataset.');
  }else if(vendor){
    candidates=PURCHASE_ORDERS.filter(p=>p.vendorId===vendor.id&&p.status==='open'&&(!invoice.currency||p.currency===invoice.currency));
    if(candidates.length===1){matchedPO=candidates[0];matchMethod='Unique vendor + currency';add('po','Purchase order','pass','PO reference missing; '+matchedPO.id+' is the only open PO for this vendor and currency.');}
    else add('po','Purchase order','review',candidates.length>1?'Multiple eligible POs: '+candidates.map(p=>p.id).join(', ')+'. Human selection required.':'No eligible open purchase order found.');
  }else add('po','Purchase order','review','The supplier is not registered in the configured procurement dataset, so no trusted PO match can be made. Document analysis is still available.');
  let committed=0,remaining=null,tolerance=null;
  if(matchedPO){
    add('ownership','Vendor / PO ownership',vendor&&matchedPO.vendorId===vendor.id?'pass':'review',vendor&&matchedPO.vendorId===vendor.id?'Invoice and purchase order belong to the same supplier.':'The invoice vendor does not match the PO supplier.');
    add('open','PO status',matchedPO.status==='open'?'pass':'review',matchedPO.status==='open'?'Purchase order is open for billing.':'Purchase order is closed. Procurement review required.');
    const currencyMatches=invoice.currency===matchedPO.currency;
    add('currency','Currency',currencyMatches?'pass':'review',currencyMatches?invoice.currency+' on both invoice and purchase order.':'Invoice '+(invoice.currency??'unknown')+' / PO '+matchedPO.currency+'. No exchange rate is assumed.');
    committed=options.committedByPO?.[matchedPO.id]??history.filter(r=>r.status==='approved'&&r.matchedPO?.id===matchedPO.id).reduce((a,r)=>a+cents(r.invoice.total),0)/100;
    remaining=(cents(matchedPO.amount)-cents(committed))/100;
    tolerance=Math.min(matchedPO.amount*POLICY.tolerancePercent/100,POLICY.toleranceCap);
    if(currencyMatches&&invoice.total!==null){
      const projected=cents(committed)+cents(invoice.total),limit=cents(matchedPO.amount)+cents(tolerance);
      add('balance','Cumulative PO balance',projected<=limit?'pass':'review',`PO ${matchedPO.currency} ${matchedPO.amount.toFixed(2)}; already committed ${committed.toFixed(2)}; this invoice ${invoice.total.toFixed(2)}; projected ${(projected/100).toFixed(2)}. Allowed cumulative tolerance: ${tolerance.toFixed(2)}.`);
    }
  }
  if(invoice.subtotal!==null&&invoice.tax!==null&&invoice.total!==null){
    const computed=cents(invoice.subtotal)+cents(invoice.tax)+cents(invoice.shipping??0)-cents(invoice.discount??0)+cents(invoice.roundoff??0);
    const delta=Math.abs(computed-cents(invoice.total));
    add('math','Invoice arithmetic',delta<=cents(POLICY.mathTolerance)?'pass':'review',`Subtotal + tax + shipping - discount + round-off = ${(computed/100).toFixed(2)}; stated total ${invoice.total.toFixed(2)}.`);
  }else add('math','Invoice arithmetic','info','Not fully verifiable: subtotal and tax breakdown are not both present. Tax-inclusive totals are accepted without inferring a split.');
  if(invoice.lineItems?.length){
    const bad=invoice.lineItems.some(l=>![l.quantity,l.unitPrice,l.amount].every(Number.isFinite)||l.quantity<=0||l.unitPrice<0||l.amount<0||Math.abs(cents(l.quantity*l.unitPrice)-cents(l.amount))>2);
    const sum=invoice.lineItems.reduce((a,l)=>a+cents(l.amount),0);
    add('items','Line items',bad||(invoice.subtotal!==null&&Math.abs(sum-cents(invoice.subtotal))>2)?'review':'pass',bad?'Quantity × unit price does not equal a line amount.':invoice.subtotal!==null?`Itemised sum ${(sum/100).toFixed(2)} compared with subtotal ${invoice.subtotal.toFixed(2)}.`:'Line quantities and unit prices reconcile.');
  }
  if(options.method==='ocr'){
    const confidence=Number(options.ocrConfidence),valid=options.ocrConfidence!==null&&options.ocrConfidence!==undefined&&Number.isFinite(confidence)&&confidence>=0&&confidence<=100;
    add('ocr','OCR quality',!valid||confidence<80?'review':'pass',valid?'OCR reported '+confidence.toFixed(0)+'% recognition confidence. '+(confidence<80?'Confirm the source before approval.':'Critical fields still pass the standard checks.'):'OCR confidence is unavailable or invalid. Confirm the source before approval.');
  }
  if(options.method==='manual')add('manual','Manual transcription','review','Text was entered manually. Confirm it against the source document before approval.');
  const status=rejected?'rejected':review?'review':'approved';
  return {status,documentAnalysis:summarizeDocumentChecks(checks),checks,matchedPO,candidates,matchMethod,committed,remaining,tolerance,invoiceKey:key,reasons:checks.filter(c=>c.state==='fail'||c.state==='review').map(c=>c.detail),summary:status==='approved'?'All blocking checks passed. Invoice is eligible for AP approval.':status==='rejected'?'Processing blocked by a duplicate or unapproved supplier.':'Human review required before this invoice can be approved.'};
}

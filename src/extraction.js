import {VENDORS} from './data.js';

const currencyCodes='USD|EUR|GBP|INR|AUD|CAD';
const currencyInfo={INR:{name:'Indian Rupee',symbol:'\u20b9'},USD:{name:'US Dollar',symbol:'US$'},AUD:{name:'Australian Dollar',symbol:'A$'},CAD:{name:'Canadian Dollar',symbol:'CA$'},EUR:{name:'Euro',symbol:'\u20ac'},GBP:{name:'Pound Sterling',symbol:'\u00a3'}};
export function detectInvoiceCurrency(lines){
 const signals=[],add=(code,source,basis)=>signals.push({code,source,basis});
 const unsupported=lines.map(source=>({source,code:source.match(/^(?:invoice\s+)?currency\s*[:=-]?\s*([a-z]{3})\b/i)?.[1]?.toUpperCase()})).find(s=>s.code&&!currencyInfo[s.code]);
 if(unsupported)return {code:null,status:'ambiguous',name:'Unconfirmed currency: '+unsupported.code,symbol:null,candidates:[unsupported.code],basis:'The declared currency '+unsupported.code+' is outside the supported currency set. Do not infer INR or USD from a generic symbol.',source:unsupported.source};
 for(const line of lines){
  for(const match of line.matchAll(new RegExp('\\b('+currencyCodes+')(?=\\b|[0-9])','gi')))add(match[1].toUpperCase(),line,'Explicit currency code '+match[1].toUpperCase());
  if(/\u20b9|\b(?:Rs|Re)\.?(?=[\s:()0-9]|$)|\bindian rupees?\b|\brupees?\b.*\bonly\b|\b(?:currency|amount in(?: words)?|total|in)\s*[:()=-]*\s*rupees?\b|\u0930\u0941\u092a(?:\u092f\u0947|\u092f\u093e)|\u0930\u0941[.\s]/i.test(line))add('INR',line,'Rupee symbol, abbreviation or rupee amount wording');
  if(/\bUS\s*\$|\b(?:US|U\.S\.|United States)\s+dollars?\b/i.test(line))add('USD',line,'US dollar notation');
  if(/\b(?:AU|A)\s*\$|\baustralian dollars?\b/i.test(line))add('AUD',line,'Australian dollar notation');
  if(/\b(?:CA|C)\s*\$|\bcanadian dollars?\b/i.test(line))add('CAD',line,'Canadian dollar notation');
  if(/\u20ac|\beuros?\b/i.test(line))add('EUR',line,'Euro notation');
  if(/\u00a3|\bpounds? sterling\b|\bbritish pounds?\b/i.test(line))add('GBP',line,'Pound sterling notation');
 }
 const candidates=[...new Set(signals.map(s=>s.code))],dollarLine=lines.find(line=>line.includes('$')||/\bdollars?\b/i.test(line));
 if(candidates.length>1)return {code:null,status:'ambiguous',name:'Conflicting currencies: '+candidates.join(' / '),symbol:null,candidates,basis:'Multiple currency indicators disagree. Confirm the invoice currency.',source:[...new Set(signals.map(s=>s.source))].join('\n')};
 if(candidates.length===1){const code=candidates[0];if(dollarLine&&!['USD','AUD','CAD'].includes(code))return {code:null,status:'ambiguous',name:'Conflicting currency symbols',symbol:null,candidates,basis:'A dollar indicator conflicts with '+code+'. Confirm the total currency.',source:signals[0].source+'\n'+dollarLine};const evidence=signals.find(s=>s.basis.startsWith('Explicit'))||signals[0];return {code,status:'identified',...currencyInfo[code],candidates,basis:evidence.basis,source:evidence.source};}
 if(dollarLine)return {code:null,status:'ambiguous',name:'Dollar ($) - country unspecified',symbol:'$',candidates:['USD','AUD','CAD'],basis:'A bare dollar sign does not distinguish US, Australian or Canadian dollars. Confirm the currency code.',source:dollarLine};
 return {code:null,status:'missing',name:'Not identified',symbol:null,candidates:[],basis:'No supported currency indicator found; no default currency is assumed.',source:null};
}
export function normalize(value=''){return String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');}
export function cents(value){return Math.round(Number(value)*100);}
export function parseMoney(value){
 if(value===null||value===undefined||String(value).trim()==='')return null;
 let s=String(value).trim().replace(/\b(?:US|AU|CA|A|C)\s*\$/gi,'$').replace(/^(?:rs\.?|re\.?|rupees?|\u0930\u0941\u092a\u092f\u0947|\u0930\u0941\.?)\s*[:.]?\s*/i,'').replace(new RegExp('\\b(?:'+currencyCodes+')(?=\\b|[0-9])','gi'),'').replace(/[$\u20ac\u00a3\u20b9\s']/g,'').replace(/\/-$/,'');
 if(s.startsWith('+'))s=s.slice(1);
 if(/^\([\d.,]+\)$/.test(s))s='-'+s.slice(1,-1);
 if(!/^-?\d[\d.,]*$/.test(s))return null;
 const negative=s.startsWith('-');if(negative)s=s.slice(1);
 const dot=s.lastIndexOf('.'),comma=s.lastIndexOf(',');
 if(dot>=0&&comma>=0){
  const decimal=dot>comma?'.':',',group=decimal==='.'?',':'.';
  const parts=s.split(decimal);if(parts.length!==2||!/^\d{1,2}$/.test(parts[1]))return null;
  const integers=parts[0].split(group),western=/^\d{1,3}(?:,\d{3})+$/.test(parts[0]),indian=/^\d{1,2}(?:,\d{2})*,\d{3}$/.test(parts[0]);
  if(integers.length>1&&!(group===','?(western||indian):/^\d{1,3}(?:\.\d{3})+$/.test(parts[0])))return null;
  s=integers.join('')+'.'+parts[1];
 }else if(comma>=0){
  if(/^\d{1,3}(?:,\d{3})+$/.test(s)||/^\d{1,2}(?:,\d{2})*,\d{3}$/.test(s))s=s.replace(/,/g,'');
  else if(/^\d+,\d{1,2}$/.test(s))s=s.replace(',','.');
  else return null;
 }else if(dot>=0&&!/^\d+\.\d{1,2}$/.test(s))return null;
 const n=Number((negative?'-':'')+s);return Number.isFinite(n)&&Number.isSafeInteger(Math.round(n*100))?n:null;
}
function normaliseDate(value){
 if(!value)return null;value=value.trim();
 if(/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(value)){const [y,m,d]=value.split(/[-/.]/);return y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0');}
 const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 let m=value.match(/^(\d{1,2})[ -]+([a-z]+)[ ,\-]+(\d{4})$/i);
 if(m){const month=months.indexOf(m[2].slice(0,3).toLowerCase());if(month>=0)return `${m[3]}-${String(month+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
 m=value.match(/^([a-z]+)[ -]+(\d{1,2})[ ,\-]+(\d{4})$/i);
 if(m){const month=months.indexOf(m[1].slice(0,3).toLowerCase());if(month>=0)return `${m[3]}-${String(month+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`;}
 m=value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
 if(m&&Number(m[1])>12&&Number(m[2])<=12)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
 if(m&&Number(m[2])>12&&Number(m[1])<=12)return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
 return value;
}
export function extractInvoice(text){
 const clean=String(text).replace(/\r/g,'').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').replace(/\uff1a/g,':');
 const lines=clean.split('\n').map(s=>s.trim()).filter(Boolean),warnings=[],evidence={};
 function labelled(pattern,key){
  const found=[];for(let i=0;i<lines.length;i++){const m=lines[i].match(pattern);if(m){const value=(m[1]||lines[i+1]||'').trim();if(value)found.push({value,source:lines[i]+(!m[1]?'\n'+(lines[i+1]||''):'')});}}
  if(found.length)evidence[key]=found[0];return found;
 }
 const vendors=labelled(/^(?:vendor|supplier|seller|from|billed by)(?: name)?[ \t]*(?:[:\-][ \t]*(.*)|$)/i,'vendor');
 let vendor=vendors[0]?.value??null;
 if(new Set(vendors.map(v=>normalize(v.value))).size>1)warnings.push('Conflicting supplier labels were found. Confirm the vendor against the source.');
 if(!vendor){
  const known=VENDORS.filter(v=>lines.some(line=>[v.name,...v.aliases].some(n=>normalize(n)===normalize(line))));
  if(known.length===1){vendor=known[0].name;evidence.vendor={value:vendor,source:lines.find(line=>[known[0].name,...known[0].aliases].some(n=>normalize(n)===normalize(line)))};}
  else if(known.length>1)warnings.push('Multiple known companies appear without a supplier label. Confirm which company issued the invoice.');
  else vendor=lines.find(x=>x.length>2&&!/^(?:(?:tax|commercial)\s+)?invoice\b|^bill\s+to\b|^page\s+\d/i.test(x))??null;
 }
 const numberFields=labelled(/^(?:(?:tax|commercial)\s+)?inv(?:oice)?\.?\s*(?:number\b|no\b\.?|#|id\b)\s*[:#\-]?\s*(.*)$/i,'invoiceNumber');
 let invoiceNumber=numberFields[0]?.value.match(/^([a-z0-9][a-z0-9/_-]*)/i)?.[1]??null;
 if(!invoiceNumber){const m=clean.match(/^invoice\s*:\s*([a-z0-9][a-z0-9/_-]*)\s*$/im);if(m)invoiceNumber=m[1];}
 if(new Set(numberFields.map(v=>v.value.split(/\s/)[0].toLowerCase())).size>1)warnings.push('More than one invoice number appears in this document. Split the invoices or request review.');
 const dates=labelled(/^(?:invoice date|issue date|date issued|issued|dated|date)\b[ \t]*[:\-]?[ \t]*(.*)$/i,'date');
 // ERP exports often put the invoice number and issue date on the same line.
 for(const line of lines){if(!/\binv(?:oice)?\.?\s*(?:number|no\.?|#)/i.test(line))continue;const m=line.match(/\b(?:invoice\s+date|dated?|issued)\s*[:\-]?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/i);if(m)dates.push({value:m[1],source:line});}
 if(dates.length)evidence.date=dates[0];
 const date=normaliseDate(dates[0]?.value??null);
 if(new Set(dates.map(d=>normaliseDate(d.value))).size>1)warnings.push('Conflicting invoice dates appear in the source. Confirm the issue date.');
 const poFields=labelled(/^(?:purchase order|p\.?o\.?)(?:\s*(?:number|no\.?|#|ref(?:erence)?))?\s*[:#]\s*(.*)$/i,'poNumber');
 const poMatches=[...clean.matchAll(/\bPO[- ]\d{4}[- ]\d{2,}\b/gi)].map(m=>m[0].toUpperCase().replace(/ /g,'-'));
 for(const p of poFields){const value=p.value.match(/^[a-z0-9][a-z0-9_-]*/i)?.[0];if(value)poMatches.push(value.toUpperCase());}
 const uniquePO=[...new Set(poMatches.map(p=>p.replace(/ /g,'-')))];
 const poNumber=uniquePO.length===1?uniquePO[0]:null;
 if(uniquePO.length>1)warnings.push('This invoice references multiple purchase orders: '+uniquePO.join(', ')+'. Human allocation is required.');
 const currencyDetection=detectInvoiceCurrency(lines),currency=currencyDetection.code;
 if(currencyDetection.source)evidence.currency={value:currency,source:currencyDetection.source,basis:currencyDetection.basis};
 if(currencyDetection.status==='ambiguous')warnings.push('Currency conflict or ambiguity: '+currencyDetection.basis);
 function amount(label,key){
  const pattern=new RegExp('^(?:'+label+')(?=[ \\t:=]|$)[ \\t]*(?:(?:\\([^)]*%\\))|(?:[0-9.]+[ \\t]*%))?[ \\t]*[:=]?[ \\t]*(.*?)$','i');
  const found=[];
  for(let i=0;i<lines.length;i++){
   if(/^(?:tax|gst|commercial)\s+invoice\b/i.test(lines[i]))continue;
   const candidate=key==='total'?lines[i].replace(/^.*?\b(?=(?:grand\s+total|invoice\s+total)\b)/i,''):lines[i];
   const m=candidate.match(pattern);if(!m)continue;
   let raw=m[1],source=lines[i];
   if(!raw){raw=lines[i+1]||'';source+='\n'+raw;}
   else if(new RegExp('^(?:'+currencyCodes+')$','i').test(raw)&&lines[i+1]){raw+=' '+lines[i+1];source+='\n'+lines[i+1];}
   const calculation=/^(\d[\d,.]*)\s*[*x\u00d7]\s*(\d+(?:\.\d+)?)\s*%\s*=\s*(\d[\d,.]*)\s*(?:IGST|CGST|SGST|GST|VAT)?\s*[,;]?$/i.exec(raw);
   const value=calculation&&['tax','igst','cgst','sgst'].includes(key)?parseMoney(calculation[3]):parseMoney(raw);
   if(calculation&&value!==null&&Math.abs(cents(parseMoney(calculation[1])*Number(calculation[2])/100)-cents(value))>2)warnings.push('The '+key+' tax calculation does not reconcile with its stated amount.');
   if(value!==null)found.push({value,source});
   else if(raw)warnings.push('The '+key+' field could not be read unambiguously: '+raw+'.');
  }
  if(found.length){if(!evidence[key])evidence[key]=found[0];if(new Set(found.map(f=>cents(f.value))).size>1)warnings.push('Conflicting '+key+' amounts appear in the document.');}
  return found[0]?.value??null;
 }
 const primaryTotal=amount('grand\\s+total|invoice\\s+total','total');
 const labelledTotal=amount('total(?:\\s+(?:amount|payable|due))?','total');
 const amountDue=amount('amount\\s+(?:due|payable)|balance\\s+due','amountDue');
 const total=primaryTotal??labelledTotal??amountDue;
 if(primaryTotal!==null&&labelledTotal!==null&&cents(primaryTotal)!==cents(labelledTotal))warnings.push('The stated invoice total and total due disagree. Confirm discounts or earlier payments.');
 if(amountDue!==null&&total!==null&&cents(amountDue)!==cents(total))warnings.push('Amount due differs from the invoice total. Earlier payments or credits require review.');
 const subtotal=amount('sub[ -]?total|net\\s+(?:amount|total)','subtotal');
 let tax=amount('tax|vat|gst|sales\\s+tax','tax');
 const cgst=amount('cgst','cgst'),sgst=amount('sgst','sgst'),igst=amount('igst','igst');
 const componentTax=(cgst??0)+(sgst??0)+(igst??0),hasTaxComponents=cgst!==null||sgst!==null||igst!==null;
 if(tax!==null&&hasTaxComponents&&Math.abs(cents(tax)-cents(componentTax))>2)warnings.push('The stated tax total does not match the tax components.');
 if(tax===null&&hasTaxComponents)tax=componentTax;
 if((cgst!==null)!==(sgst!==null))warnings.push('Only one of CGST and SGST was found. Confirm the complete tax breakdown.');
 const discount=amount('discount','discount'),shipping=amount('shipping|freight','shipping'),roundoff=amount('round[ -]?off|rounding(?:\\s+adjustment)?','roundoff');
 const lineItems=[];
 for(const line of lines){
  const m=line.match(/^(.+?)\s*\|\s*(\d+(?:\.\d+)?)\s*\|\s*([$\u20ac\u00a3\u20b9]?[\d,.]+)\s*\|\s*([$\u20ac\u00a3\u20b9]?[\d,.]+)\s*$/);
  if(m)lineItems.push({description:m[1].trim(),quantity:Number(m[2]),unitPrice:parseMoney(m[3]),amount:parseMoney(m[4])});
 }
 return {vendor,invoiceNumber,date,poNumber,currency,currencyDetection,subtotal,tax,discount,shipping,roundoff,total,lineItems,evidence,extractionWarnings:[...new Set(warnings)],rawText:clean};
}

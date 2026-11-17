import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractInvoice,evaluateInvoice} from '../src/engine.js';
import {invoiceReportPDF} from '../src/report.js';
const input=amount=>'Example Supplier\nInvoice No: CUR-1\nInvoice Date: 2026-06-27\nGrand Total: '+amount;

test('rupee symbols, abbreviations and word labels identify INR with evidence',()=>{
 for(const text of ['\u20b9 3,741.00','Rs. 3741.00','Rs3741.00','Rs: 3741.00','Re. 3741.00','Rupees 3741.00','INR3741.00','INR 3741.00/-','\u0930\u0941. 3741.00']){
  const i=extractInvoice(input(text));assert.equal(i.currency,'INR',text);assert.equal(i.total,3741,text);assert.equal(i.currencyDetection.name,'Indian Rupee');assert.equal(i.currencyDetection.status,'identified');assert.ok(i.evidence.currency.source);assert.equal(evaluateInvoice(i).checks.find(c=>c.key==='currency-detection').state,'pass');
 }
 const words=extractInvoice(input('3741.00')+'\nAmount in words: Rupees Three Thousand Seven Hundred Forty One only');assert.equal(words.currency,'INR');
 const header=extractInvoice(input('3741.00')+'\nAmount (Rs.)');assert.equal(header.currency,'INR');
});
test('national dollar notation preserves USD, AUD and CAD instead of sharing a default',()=>{
 for(const [amount,code]of [['US$ 123.45','USD'],['USD123.45','USD'],['A$123.45','AUD'],['AU$123.45','AUD'],['C$123.45','CAD'],['CA$123.45','CAD']]){const i=extractInvoice(input(amount));assert.equal(i.currency,code,amount);assert.equal(i.total,123.45,amount);}
 for(const [name,code]of [['US Dollars','USD'],['Australian Dollars','AUD'],['Canadian Dollars','CAD']])assert.equal(extractInvoice(input('$123.45')+'\nCurrency: '+name).currency,code);
});
test('missing and ambiguous currencies never silently become USD or INR',()=>{
 for(const text of [input('123.45'),input('$123.45'),input('123.45')+'\nCurrency: PKR\nAmount in Rs.']){const i=extractInvoice(text);assert.equal(i.currency,null);assert.equal(evaluateInvoice(i).checks.find(c=>c.key==='currency-detection').state,'review');}
 const bare=extractInvoice(input('$123.45'));assert.match(bare.currencyDetection.name,/country unspecified/);assert.equal(bare.total,123.45);
 const company=extractInvoice('Rsmith Trading\nGrand Total: 123.45');assert.equal(company.currency,null);
});
test('conflicting rupee, dollar and explicit code evidence requires confirmation',()=>{
 for(const text of [input('Rs. 123.45')+'\nCurrency: USD',input('\u20b9 123.45')+'\nTotal due: $123.45',input('US$123.45')+'\nCurrency: CAD']){const i=extractInvoice(text);assert.equal(i.currency,null);assert.equal(i.currencyDetection.status,'ambiguous');assert.ok(i.extractionWarnings.length);assert.equal(evaluateInvoice(i).status,'review');}
});
test('PDF labels invoice rupees separately from dollar PO balances and explains detection',()=>{
 const invoice=extractInvoice(input('Rs. 3741.00')),result=evaluateInvoice(invoice),run={id:'currency-report',invoice,...result,method:'pdf',fileName:'example.pdf',createdAt:'2026-11-17',fileHash:'a'.repeat(64),matchedPO:{id:'USD-PO',currency:'USD'},committed:20,remaining:80,tolerance:1};
 const pdf=new TextDecoder().decode(invoiceReportPDF(run));assert.match(pdf,/Currency: INR - Indian Rupee/);assert.match(pdf,/Invoice total: INR 3741.00/);assert.match(pdf,/PO currency: USD/);assert.match(pdf,/Available PO balance: USD 80.00/);assert.match(pdf,/Rupee symbol, abbreviation or rupee amount wording/);
});

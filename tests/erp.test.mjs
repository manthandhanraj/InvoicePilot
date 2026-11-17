import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractInvoice,evaluateInvoice,parseMoney} from '../src/engine.js';
import {invoiceReportPDF} from '../src/report.js';
import {ERP_INVOICE} from './helpers/erp-invoice.mjs';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';

test('ERP inline date, words before total, Rs, GST summaries and round-off extract without false ambiguity',()=>{
 const i=extractInvoice(ERP_INVOICE);
 assert.equal(i.vendor,'EXAMPLE PHARMA LTD');assert.equal(i.invoiceNumber,'ERP-122');assert.equal(i.date,'2026-06-27');assert.equal(i.currency,'INR');assert.equal(i.total,3741);assert.equal(i.subtotal,4048.4);assert.equal(i.tax,178.13);assert.equal(i.discount,485.81);assert.equal(i.roundoff,.28);assert.deepEqual(i.extractionWarnings,[]);
 const r=evaluateInvoice(i);assert.equal(r.checks.find(c=>c.key==='required').state,'pass');assert.equal(r.checks.find(c=>c.key==='math').state,'pass');assert.equal(r.status,'review');assert.deepEqual(r.checks.filter(c=>c.state==='review').map(c=>c.key),['vendor','po']);assert.match(i.evidence.date.source,/Invoice No/);assert.match(i.evidence.total.source,/GRAND TOTAL 3741/);
});
test('GST headings and registration identifiers are not tax amounts; due date is not the issue date',()=>{
 const i=extractInvoice('Example Supplier\nGST INVOICE\nGSTIN NO : 06BCDEF2345G1Z5\nDue Date : 30-06-2026\nGRAND TOTAL 100.00');assert.equal(i.tax,null);assert.equal(i.date,null);assert.equal(i.currency,null);assert.deepEqual(i.extractionWarnings,[]);
});
test('Indian grouped rupee amounts are supported without accepting malformed money',()=>{
 for(const [s,n]of [['Rs. 1,23,456.78',123456.78],['INR 12,34,567.89',1234567.89],['Rs 1,234.50',1234.5],['+0.28',.28],['-0.28',-.28]])assert.equal(parseMoney(s),n,s);
 for(const s of ['1,2,3','12,345,67','1,23,45.67','1,000.123'])assert.equal(parseMoney(s),null,s);
});
test('conflicting currencies and incorrect GST calculations still require review',()=>{
 assert.ok(extractInvoice(ERP_INVOICE+'\nCurrency: USD').extractionWarnings.some(w=>/conflict/.test(w)));
 const i=extractInvoice(ERP_INVOICE.replace('3562.59*5%=178.13','3562.59*5%=180.00'));assert.ok(i.extractionWarnings.some(w=>/calculation/.test(w)));assert.equal(evaluateInvoice(i).status,'review');
 assert.equal(evaluateInvoice(extractInvoice(ERP_INVOICE.replace('Roundoff 0.28','Roundoff -0.28'))).checks.find(c=>c.key==='math').state,'review');
});
test('PDF report is parseable, includes all findings and escapes untrusted document strings',()=>{
 const invoice=extractInvoice(ERP_INVOICE),r={id:'synthetic-report',invoice,...evaluateInvoice(invoice),method:'pdf',fileName:'example.pdf',createdAt:'2026-11-17T00:00:00Z',fileHash:'a'.repeat(64),analysisOnly:true,originalStatus:'review'};
 r.invoice.vendor='Example (Pharma) \\ Test';const bytes=invoiceReportPDF(r);assert.ok(new TextDecoder().decode(bytes).startsWith('%PDF-1.4'));
 const root=resolve('.local'),folder=mkdtempSync(join(root,'report-test-'));try{const path=join(folder,'report.pdf');writeFileSync(path,bytes);const text=execFileSync('python',['-c','from pypdf import PdfReader; import sys; r=PdfReader(sys.argv[1]); print("\\n".join(p.extract_text() for p in r.pages))',path],{encoding:'utf8'});for(const expected of ['INR 3741.00','2026-06-27','Round-off: INR 0.28','Example (Pharma) \\ Test','RECHECK PREVIEW','[PASS] Invoice arithmetic'])assert.ok(text.includes(expected),expected);}finally{assert.ok(resolve(folder).startsWith(root+'\\')||resolve(folder).startsWith(root+'/'));rmSync(folder,{recursive:true,force:true});}
});

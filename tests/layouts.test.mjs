import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractInvoice,evaluateInvoice,parseMoney} from '../src/engine.js';
import {SAMPLES} from '../src/data.js';
const base=SAMPLES[0].text;
test('English written dates normalise without guessing a locale',()=>{
 for(const [source,date]of [['10 November 2026','2026-11-10'],['November 10, 2026','2026-11-10'],['13/11/2026','2026-11-13'],['11/13/2026','2026-11-13']]){
  const i=extractInvoice(base.replace('2026-11-10',source));assert.equal(i.date,date);assert.equal(evaluateInvoice(i).status,'approved');
 }
 const i=extractInvoice(base.replace('2026-11-10','10/11/2026'));assert.equal(evaluateInvoice(i).status,'review');
});
test('alternate invoice labels, tax rate and next-line amounts extract correctly',()=>{
 const text='Aster Studio LLC\nTAX INVOICE\nInvoice No.: ALT-888\nIssued: November 14, 2026\nPurchase Order: PO-2026-041\nCurrency: USD\nNet Amount\n2000.00\nVAT (10%): 200.00\nTotal Due USD 2200.00';
 const i=extractInvoice(text);assert.equal(i.invoiceNumber,'ALT-888');assert.equal(i.subtotal,2000);assert.equal(i.tax,200);assert.equal(i.total,2200);assert.equal(evaluateInvoice(i).status,'approved');
});
test('conflicting totals and earlier payment balances require review',()=>{
 for(const suffix of ['\nGrand Total: 4501.00','\nTotal: 4501.00','\nAmount Due: 4000.00']){
  const i=extractInvoice(base+suffix);assert.ok(i.extractionWarnings.length);assert.equal(evaluateInvoice(i).status,'review');
 }
});
test('multiple invoice numbers or PO references do not silently select one',()=>{
 for(const suffix of ['\nInvoice Number: INV-OTHER','\nPO Number: PO-2026-042'])assert.equal(evaluateInvoice(extractInvoice(base+suffix)).status,'review');
});
test('ambiguous currency and malformed money cannot auto-approve',()=>{
 assert.equal(evaluateInvoice(extractInvoice(base+'\nBank currency: EUR')).status,'review');
 for(const x of ['1,2,3','1.234','1,000.123','NaN','Infinity'])assert.equal(parseMoney(x),null);
 assert.equal(parseMoney('(1,234.50)'),-1234.5);
});
test('both GST components reconcile; one missing component requires review',()=>{
 const both=extractInvoice(base.replace('Tax: 500.00','CGST (5%): 250.00\nSGST (5%): 250.00'));assert.equal(both.tax,500);assert.equal(evaluateInvoice(both).status,'approved');
 assert.equal(evaluateInvoice(extractInvoice(base.replace('Tax: 500.00','CGST: 500.00'))).status,'review');
});
test('OCR scores must be finite, present and within the valid range',()=>{
 for(const confidence of [null,undefined,NaN,Infinity,-1,101])assert.equal(evaluateInvoice(extractInvoice(base),[],{method:'ocr',ocrConfidence:confidence}).status,'review');
 assert.equal(evaluateInvoice(extractInvoice(base),[],{method:'ocr',ocrConfidence:95}).status,'approved');
});
test('authoritative full ledger overrides a truncated display history',()=>{
 const r=evaluateInvoice(extractInvoice(base),[],{committedByPO:{'PO-2026-041':10000}});assert.equal(r.committed,10000);assert.equal(r.status,'review');
});
test('conflicting dates and tax-component totals require review',()=>{
 assert.equal(evaluateInvoice(extractInvoice(base+'\nInvoice Date: 2026-11-11')).status,'review');
 assert.equal(evaluateInvoice(extractInvoice(base+'\nCGST: 400.00\nSGST: 400.00')).status,'review');
});
test('missing invoice numbers have no shared vendor-only duplicate key',()=>{
 const i=extractInvoice(base.replace('Invoice Number: INV-1048',''));const r=evaluateInvoice(i);assert.equal(r.invoiceKey,null);assert.equal(r.status,'review');
});

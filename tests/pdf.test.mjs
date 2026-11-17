import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {extractInvoice,evaluateInvoice} from '../src/engine.js';
test('actual PDF text passes through extraction and decision rules',()=>{
 const result=JSON.parse(execFileSync('python',['scripts/verify-pdfs.py'],{encoding:'utf8',windowsHide:true}));
 const happy=extractInvoice(result['aster-inv-1048.pdf']);assert.equal(happy.total,4500);assert.equal(evaluateInvoice(happy).status,'approved');
 const ambiguous=evaluateInvoice(extractInvoice(result['orbit-inv-882.pdf']));assert.equal(ambiguous.status,'review');assert.equal(ambiguous.candidates.length,2);
 assert.equal(evaluateInvoice(extractInvoice(result['aster-eur-1052.pdf'])).status,'review');assert.equal(result['northstar-scan.pdf'].trim(),'');
});

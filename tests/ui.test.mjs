import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SAMPLES,PURCHASE_ORDERS,VENDORS} from '../src/data.js';
import {extractInvoice,evaluateInvoice} from '../src/engine.js';
test('UI renders all routes, a processing run and a saved decision without runtime errors',async()=>{
 const elements=new Map();const el=()=>({innerHTML:'',textContent:'',value:'',disabled:false,hidden:true,addEventListener(){},classList:{toggle(){}},setAttribute(){},removeAttribute(){}});
 const doc={querySelector(s){if(!elements.has(s))elements.set(s,el());return elements.get(s);},querySelectorAll(){return [];},addEventListener(){}};
 const location={hash:''},window={addEventListener(){},scrollTo(){}};
 const fixture={runs:[],purchaseOrders:PURCHASE_ORDERS,vendors:VENDORS,samples:SAMPLES};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const app=await new AsyncFunction('document','window','location','fetch','navigator','setTimeout','clearTimeout',readFileSync(new URL('../public/app.js',import.meta.url),'utf8')+'; return {render,formatMoney:money,renderFields:extracted,renderComparison:poComparison,setLive(value){live=value;},setRuns(runs){state.runs=runs;}};')(doc,window,location,async()=>({ok:true,json:async()=>fixture}),{},setTimeout,clearTimeout);
 assert.match(elements.get('#main').innerHTML,/Every invoice. Crystal clear/);
 assert.match(app.formatMoney(3741,'INR'),/\u20b93,741\.00/);assert.doesNotMatch(app.formatMoney(3741,'INR'),/\$/);assert.match(app.formatMoney(123,null),/currency unknown/);
 const rupees=extractInvoice('Example Supplier\nGrand Total: Rs. 3741.00');assert.match(app.renderFields(rupees,'pdf'),/INR - Indian Rupee/);assert.match(app.renderFields(rupees,'pdf'),/Currency detection/);
 const unknown=extractInvoice(SAMPLES[0].text.replace('Currency: USD',''));assert.match(app.renderComparison({invoice:unknown,matchedPO:PURCHASE_ORDERS[0],committed:0,remaining:12000,tolerance:50}),/This invoice[\s\S]*?4500\.00 \(currency unknown\)/);
 for(const route of ['queue','orders','playbook']){location.hash='#'+route;app.render();assert.ok(elements.get('#main').innerHTML.length>500);}
 app.setLive({fileName:'invoice.pdf',stages:{read:{state:'running'}},invoice:null,method:'pdf'});location.hash='#live';app.render();assert.match(elements.get('#main').innerHTML,/Following the invoice/);
 const invoice=extractInvoice(SAMPLES[0].text),r={id:'example',invoice,...evaluateInvoice(invoice),method:'pdf',fileName:'example.pdf',rawText:SAMPLES[0].text,createdAt:new Date().toISOString()};app.setRuns([r]);location.hash='#run/example';app.render();assert.match(elements.get('#main').innerHTML,/The decision trail/);assert.match(elements.get('#main').innerHTML,/Approved/);
});

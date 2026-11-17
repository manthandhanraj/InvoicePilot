export const VENDORS = [
  {id:'aster', name:'Aster Studio LLC', aliases:['Aster Studio'], approved:true},
  {id:'northstar', name:'Northstar Supplies Inc', aliases:['Northstar Supplies'], approved:true},
  {id:'orbit', name:'Orbit Cloud Ltd', aliases:['Orbit Cloud'], approved:true},
  {id:'cedar', name:'Cedar Logistics Inc', aliases:['Cedar Logistics'], approved:true},
  {id:'sequoia', name:'Sequoia Hardware LLC', aliases:['Sequoia Hardware'], approved:false},
];
export const PURCHASE_ORDERS = [
  {id:'PO-2026-041',vendorId:'aster',description:'Brand strategy & design services',amount:12000,currency:'USD',status:'open'},
  {id:'PO-2026-042',vendorId:'northstar',description:'Office supplies · November',amount:6000,currency:'USD',status:'open'},
  {id:'PO-2026-043',vendorId:'orbit',description:'Cloud infrastructure · production',amount:8000,currency:'USD',status:'open'},
  {id:'PO-2026-044',vendorId:'orbit',description:'Cloud infrastructure · staging',amount:8000,currency:'USD',status:'open'},
  {id:'PO-2026-045',vendorId:'cedar',description:'Regional distribution',amount:3000,currency:'USD',status:'closed'},
  {id:'PO-2026-046',vendorId:'sequoia',description:'Hardware procurement',amount:2500,currency:'USD',status:'open'},
];
export const POLICY = {tolerancePercent:1,toleranceCap:50,mathTolerance:0.02,maxFileBytes:10*1024*1024,maxPages:10};
export const SAMPLES = [
 {id:'happy',title:'A clean match',subtitle:'Happy path · $4,500 / Aster Studio',file:'aster-inv-1048.pdf',expected:'Approved on its first run. Run it again to catch a duplicate.',text:'ASTER STUDIO LLC\nINVOICE\nVendor: Aster Studio LLC\nInvoice Number: INV-1048\nInvoice Date: 2026-11-10\nPO Number: PO-2026-041\nCurrency: USD\nDescription: Brand strategy milestone 1\nSubtotal: 4000.00\nTax: 500.00\nGrand Total: 4500.00'},
 {id:'partial',title:'A second milestone',subtitle:'Partial billing · $7,000 / Aster Studio',file:'aster-inv-1050.pdf',expected:'Approved: after the clean match, total committed is $11,500 of $12,000.',text:'ASTER STUDIO LLC\nINVOICE\nVendor: Aster Studio LLC\nInvoice Number: INV-1050\nInvoice Date: 2026-11-11\nPO Number: PO-2026-041\nCurrency: USD\nDescription: Brand strategy milestone 2\nSubtotal: 6500.00\nTax: 500.00\nGrand Total: 7000.00'},
 {id:'over',title:'The balance check',subtitle:'Overbilling · $1,500 / Aster Studio',file:'aster-inv-1051.pdf',expected:'After the first two samples, this exceeds the PO balance and needs review.',text:'ASTER STUDIO LLC\nINVOICE\nVendor: Aster Studio LLC\nInvoice Number: INV-1051\nInvoice Date: 2026-11-12\nPO Number: PO-2026-041\nCurrency: USD\nDescription: Brand strategy final milestone\nSubtotal: 1400.00\nTax: 100.00\nGrand Total: 1500.00'},
 {id:'ambiguous',title:'Which purchase order?',subtitle:'Missing PO · two plausible matches',file:'orbit-inv-882.pdf',expected:'Needs review: Orbit has two eligible POs. The system will not guess.',text:'ORBIT CLOUD LTD\nINVOICE\nVendor: Orbit Cloud Ltd\nInvoice Number: OC-882\nInvoice Date: 2026-11-09\nCurrency: USD\nDescription: Monthly cloud infrastructure\nSubtotal: 2000.00\nTax: 0.00\nGrand Total: 2000.00'},
 {id:'scanned',title:'An incomplete scan',subtitle:'OCR · critical total is missing',file:'northstar-scan.pdf',expected:'OCR reads a real scanned PDF. Missing total sends it for human review.',text:'NORTHSTAR SUPPLIES INC\nINVOICE\nVendor: Northstar Supplies Inc\nInvoice Number: NS-3091\nInvoice Date: 2026-11-08\nPO Number: PO-2026-042\nCurrency: USD\nDescription: Office stationery\nAmount to be confirmed by supplier'},
 {id:'currency',title:'The wrong currency',subtitle:'Currency mismatch · EUR invoice / USD PO',file:'aster-eur-1052.pdf',expected:'Needs review: amounts in different currencies are not compared.',text:'ASTER STUDIO LLC\nINVOICE\nVendor: Aster Studio LLC\nInvoice Number: INV-1052\nInvoice Date: 2026-11-13\nPO Number: PO-2026-041\nCurrency: EUR\nSubtotal: 900.00\nTax: 100.00\nGrand Total: 1000.00'},
 {id:'formatted',title:'A different vendor layout',subtitle:'Written date · itemised lines · tax rate',file:'northstar-formatted.pdf',expected:'Approved against Northstar PO-2026-042 while its cumulative balance permits.',text:'Northstar Supplies Inc\nTAX INVOICE\nInvoice No.: NS-3093\nIssued: November 14, 2026\nPurchase Order: PO-2026-042\nCurrency: USD\nDescription | Quantity | Unit Price | Amount\nOffice equipment | 2 | 1000.00 | 2000.00\nNet Amount\n2000.00\nVAT (10%): 200.00\nTotal Due USD 2200.00'},
 {id:'scan-complete',title:'A complete scanned invoice',subtitle:'Real OCR · $550 / Northstar Supplies',file:'northstar-complete-scan.pdf',expected:'Approved when OCR quality is sufficient and the PO balance permits. Low recognition quality goes to review.',text:'NORTHSTAR SUPPLIES INC\nINVOICE\nVendor: Northstar Supplies Inc\nInvoice Number: NS-3092\nInvoice Date: 2026-11-14\nPO Number: PO-2026-042\nCurrency: USD\nSubtotal: 500.00\nTax: 50.00\nGrand Total: 550.00'},
];

import {fileURLToPath} from 'node:url';

if(Number(process.versions.node.split('.')[0])<24){
  console.error('InvoicePilot needs Node.js 24 or later. Download it from https://nodejs.org.');
  process.exitCode=1;
}else{
  process.chdir(fileURLToPath(new URL('../',import.meta.url)));
  console.log('\nInvoicePilot · building your workspace…\n');
  try{
    await import('./build.mjs');
    await import('./dev.mjs');
  }catch(error){
    console.error('\nInvoicePilot could not start: '+error.message);
    process.exitCode=1;
  }
}

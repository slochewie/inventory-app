#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const {parseCsv,stringifyCsv}=require('./lib/csv');
function main(){
 const [input,output]=process.argv.slice(2);
 if(!input||!output)throw new Error('Usage: toast.liquor-review.js toast-liquor.csv output.csv');
 const rows=parseCsv(fs.readFileSync(input,'utf8')),h=rows[0]||[];
 const ix=n=>h.indexOf(n);
 const out=[['Liquor Type','Item Name','Base Price ($)','Possible Well Candidate']];
 for(const r of rows.slice(1)){
   const type=r[ix('Liquor Type')]||'',name=r[ix('Item Name')]||'',price=r[ix('Base Price ($)')]||'';
   const amount=Number.parseFloat(price);
   const possible=Number.isFinite(amount)&&amount<=7?'YES':'';
   out.push([type,name,price,possible]);
 }
 fs.writeFileSync(output,stringifyCsv(out));
 console.log(JSON.stringify({input,output,rows:out.length-1,note:'Possible Well Candidate is review-only; no Happy Hour liquor pricing is assigned yet.'},null,2));
}
try{main();}catch(e){console.error('Error: '+e.message);process.exitCode=1;}

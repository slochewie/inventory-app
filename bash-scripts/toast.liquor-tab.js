#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {parseCsv,stringifyCsv}=require('./lib/csv');
const TYPES=['VODKA','GIN','RUM','TEQUILA','WHISKEY/BOURBON','SCOTCH','LIQUEURS'];
function main(){
 const [input,output]=process.argv.slice(2);
 if(!input||!output)throw new Error('Usage: toast.liquor-tab.js toast-liquor.csv output.csv');
 const rows=parseCsv(fs.readFileSync(input,'utf8')),h=rows[0]||[],ix=n=>h.indexOf(n);
 const grouped=new Map(TYPES.map(t=>[t,[]]));
 for(const r of rows.slice(1)){
   const type=r[ix('Liquor Type')]||'';
   if(grouped.has(type)) grouped.get(type).push([r[ix('Item Name')]||'',r[ix('Base Price ($)')]||'',r[ix('Happy Hour $')]||'']);
 }
 const header=[],max=Math.max(...[...grouped.values()].map(v=>v.length));
 for(const t of TYPES) header.push(t,'Price $','Happy Hour $');
 const out=[header];
 for(let i=0;i<max;i++){
   const row=[];
   for(const t of TYPES) row.push(...(grouped.get(t)[i]||['','','']));
   out.push(row);
 }
 fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
 fs.writeFileSync(output,stringifyCsv(out));
 console.log(JSON.stringify({input,output,rows:max,sections:TYPES},null,2));
}
try{main();}catch(e){console.error('Error: '+e.message);process.exitCode=1;}

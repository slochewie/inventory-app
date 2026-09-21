#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {parseCsv,stringifyCsv}=require('./lib/csv');
const {collapseScheduledPrices}=require('./lib/collapse-scheduled-prices');
function records(rows){const h=rows[0]||[];return rows.slice(1).map(r=>Object.fromEntries(h.map((x,i)=>[x,r[i]??''])));}
function hh(v){const n=Number.parseFloat(v);return Number.isFinite(n)?Math.max(0,n-1).toFixed(2):'';}
function main(){
 const [input,output]=process.argv.slice(2);
 if(!input||!output)throw new Error('Usage: toast.wine-build.js mapped.csv output.csv');
 const rows=collapseScheduledPrices(records(parseCsv(fs.readFileSync(input,'utf8'))))
   .filter(r=>String(r.category||'').trim().toUpperCase()==='WINE GLASS');
 const out=[['Wine Name','Glass Price $','Happy Hour $']];
 for(const r of rows)out.push([r.item_name||'',/^ask$/i.test(r.price||'')?'':r.price||'',hh(r.price)]);
 fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,stringifyCsv(out));
 console.log(JSON.stringify({input,output,wineItems:rows.length,note:'Wine glass Happy Hour is $1 off.'},null,2));
}
try{main();}catch(e){console.error('Error: '+e.message);process.exitCode=1;}

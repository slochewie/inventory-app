#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {parseCsv,stringifyCsv}=require('./lib/csv');
const {collapseScheduledPrices}=require('./lib/collapse-scheduled-prices');
const {DEFAULT_RULES}=require('./lib/migration-rules');
const {buildBeverageRows}=require('./lib/toast-beverage-build');
function records(rows){const h=rows[0]||[];return rows.slice(1).map(r=>Object.fromEntries(h.map((x,i)=>[x,r[i]??''])));}
function main(){
 const [input,beerOutput,liquorOutput]=process.argv.slice(2);
 if(!input||!beerOutput||!liquorOutput)throw new Error('Usage: toast.beverage-build.js intermediate.csv beer.csv liquor.csv');
 const source=collapseScheduledPrices(records(parseCsv(fs.readFileSync(input,'utf8'))));
 const included=new Set(DEFAULT_RULES.includedGroups);
 const relevant=source.filter(r=>included.has(String(r.category||'').trim().toUpperCase()));
 const {beer,liquor}=buildBeverageRows(relevant);
 fs.mkdirSync(path.dirname(path.resolve(beerOutput)),{recursive:true});
 fs.writeFileSync(beerOutput,stringifyCsv([['Beer Name','Draft 10 oz Price','Draft 16 oz Price','Can 12 oz Price','Can 24 oz Price','Obsolete 20 oz Price (Review Only)'],...beer.map(r=>[r.item_name,r.draft_10oz_price,r.draft_16oz_price,r.can_12oz_price,r.can_24oz_price,r.obsolete_20oz_price])]));
 fs.writeFileSync(liquorOutput,stringifyCsv([['Item Name','Base Price ($)','Liquor Type'],...liquor.map(r=>[r.item_name,r.base_price,r.liquor_type])]));
 console.log(JSON.stringify({input,beerOutput,liquorOutput,beerProducts:beer.length,liquorItems:liquor.length,note:'10 oz draft preserved explicitly; not mapped to Toast stock 8 oz.'},null,2));
}
try{main();}catch(error){console.error('Error: '+error.message);process.exitCode=1;}

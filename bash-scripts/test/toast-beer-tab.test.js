#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'toast-beer-tab-'));
const input=path.join(dir,'beer.csv'),output=path.join(dir,'tab.csv');
fs.writeFileSync(input,[
 'Beer Name,Draft 10 oz Price,Draft 10 oz Happy Hour,Draft 16 oz Price,Draft 16 oz Happy Hour,Can 12 oz Price,Can 12 oz Happy Hour,Can 24 oz Price,Can 24 oz Happy Hour,Obsolete 20 oz Price (Review Only)',
 'PBR,3.00,2.00,4.00,3.00,3.00,2.00,6.50,5.50,7.00',
].join('\n')+'\n');
cp.execFileSync(process.execPath,[path.join(__dirname,'..','toast.beer-tab.js'),input,output]);
const lines=fs.readFileSync(output,'utf8').trim().split('\n');
assert.equal(lines[0],'Draft Beer,10oz,Happy Hour $,16oz,Happy Hour $,24oz,Happy Hour $,Pitcher,Happy Hour $,Can,Price $,Happy Hour $,Bottle,Price $,Happy Hour $');
assert.equal(lines.length,4);
assert.match(lines[1],/^PBR,3\.00,2\.00,4\.00,3\.00/);
assert.match(lines[2],/,PBR,3\.00,2\.00,,,?$/);
assert.match(lines[3],/,PBR,6\.50,5\.50$/);
assert.ok(!fs.readFileSync(output,'utf8').includes('7.00'));
console.log('Toast Beer tab tests passed');

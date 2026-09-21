#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'toast-wine-')),input=path.join(dir,'mapped.csv'),output=path.join(dir,'wine.csv');
fs.writeFileSync(input,[
 'item_number,item_name,price,effective_time,category',
 '1,Wine,6.50,00:00,WINE GLASS',
 '1,Wine,5.50,17:00,WINE GLASS',
 '1,Wine,6.50,19:00,WINE GLASS',
 '2,Jameson,8.00,00:00,BOURB WHISK'
].join('\n')+'\n');
cp.execFileSync(process.execPath,[path.join(__dirname,'..','toast.wine-build.js'),input,output]);
const lines=fs.readFileSync(output,'utf8').trim().split('\n');
assert.equal(lines[0],'Wine,Glass $,Happy Hour $,Bottle $,Happy Hour $');
assert.equal(lines[1],'Wine,6.50,5.50,,');
assert.equal(lines.length,2);
console.log('Toast Wine tab tests passed');

#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'toast-liquor-tab-')),input=path.join(dir,'liquor.csv'),output=path.join(dir,'tab.csv');
fs.writeFileSync(input,[
 'Item Name,Base Price ($),Happy Hour $,Liquor Type',
 'Vodka Well,7.00,6.00,VODKA',
 'Titos,8.00,,VODKA',
 'Gin Well,7.00,6.00,GIN',
 'Jameson,8.00,,WHISKEY/BOURBON',
 'Amaretto,7.00,,LIQUEURS',
].join('\n')+'\n');
cp.execFileSync(process.execPath,[path.join(__dirname,'..','toast.liquor-tab.js'),input,output]);
const text=fs.readFileSync(output,'utf8');
const lines=text.trim().split('\n');
assert.equal(lines[0],'VODKA,Price $,Happy Hour $,GIN,Price $,Happy Hour $,RUM,Price $,Happy Hour $,TEQUILA,Price $,Happy Hour $,WHISKEY/BOURBON,Price $,Happy Hour $,SCOTCH,Price $,Happy Hour $,LIQUEURS,Price $,Happy Hour $');
assert.match(lines[1],/^Vodka Well,7\.00,6\.00,Gin Well,7\.00,6\.00/);
assert.ok(text.includes('Jameson,8.00,'));
assert.ok(text.includes('Amaretto,7.00,'));
assert.ok(!text.includes('Titos,8.00,7.00'));
console.log('Toast Liquor tab tests passed');

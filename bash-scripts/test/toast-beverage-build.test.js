#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {buildBeverageRows}=require('../lib/toast-beverage-build');
const {beer,liquor}=buildBeverageRows([
 {item_name:'Guinness 10oz',price:'6.00',category:'DRAFT 10OZ'},
 {item_name:'Guinness Pint',price:'8.00',category:'DRAFT REG PINT'},
 {item_name:'Guinness Imp',price:'10.00',category:'DRAFT IMP PINT'},
 {item_name:'Modelo',price:'7.00',category:'BEER CAN'},
 {item_name:'Modelo Tall',price:'9.00',category:'BEER CAN'},
 {item_name:'Jameson',price:'9.00',category:'BOURB WHISK'},
]);
assert.equal(beer.length,2);
const guinness=beer.find(r=>r.item_name.toLowerCase().startsWith('guinness'));
assert.equal(guinness.draft_10oz_price,'6.00');
assert.equal(guinness.draft_16oz_price,'8.00');
assert.equal(guinness.obsolete_20oz_price,'10.00');
assert.equal(guinness.item_name,'Guinness');
const modelo=beer.find(r=>r.item_name.toLowerCase().startsWith('modelo'));
assert.equal(modelo.can_12oz_price,'7.00');
assert.equal(modelo.can_24oz_price,'9.00');
assert.equal(liquor.length,1);
assert.equal(liquor[0].liquor_type,'WHISKEY/BOURBON');
console.log('Toast beverage build tests passed');

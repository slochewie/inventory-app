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
 {item_name:'Bourbon Well',price:'7.00',category:'BOURB WHISK'},
 {item_name:'Titos',price:'8.00',category:'TEQUILA'},
 {item_name:'Flor de Cana',price:'7.00',category:'TEQUILA'},
 {item_name:'Flor de Cana',price:'8.00',category:'RUM'},
 {item_name:'Bombay East',price:'9.00',category:'SCOTCH'},
 {item_name:'Tangueray',price:'7.00',category:'LIQUEURS'},
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
assert.equal(modelo.item_name,'Modelo');
assert.equal(liquor.length,6);
assert.equal(liquor[0].liquor_type,'WHISKEY/BOURBON');
assert.equal(liquor.find(r=>r.item_name==='Jameson').happy_hour_price,'');
assert.equal(liquor.find(r=>r.item_name==='Bourbon Well').happy_hour_price,'6.00');
assert.equal(liquor.find(r=>r.item_name==='Titos').liquor_type,'VODKA');
assert.equal(liquor.filter(r=>r.item_name==='Flor de Cana').length,1);
assert.equal(liquor.find(r=>r.item_name==='Flor de Cana').liquor_type,'RUM');
assert.equal(liquor.find(r=>r.item_name==='Flor de Cana').base_price,'8.00');
assert.equal(liquor.find(r=>r.item_name==='Bombay East').liquor_type,'GIN');
assert.equal(liquor.find(r=>r.item_name==='Tangueray').liquor_type,'GIN');
assert.equal(guinness.draft_10oz_happy_hour,'5.00');
assert.equal(guinness.draft_16oz_happy_hour,'7.00');
assert.equal(modelo.can_12oz_happy_hour,'6.00');
assert.equal(modelo.can_24oz_happy_hour,'8.00');
console.log('Toast beverage build tests passed');

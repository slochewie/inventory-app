#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { collapseScheduledPrices } = require('../lib/collapse-scheduled-prices');

const rows = [
  { plu: '50001', item_name: 'Guinness Pint', price: '8.00', effective_time: '00:00' },
  { plu: '50001', item_name: 'Guinness Pint', price: '8.00', effective_time: '10:00' },
  { plu: '50001', item_name: 'Guinness Pint', price: '7.00', effective_time: '17:00' },
  { plu: '50001', item_name: 'Guinness Pint', price: '8.00', effective_time: '19:00' },
  { plu: '50002', item_name: 'Open Beer', price: 'Ask', effective_time: '00:00' },
];

const collapsed = collapseScheduledPrices(rows);
assert.equal(collapsed.length, 2);
assert.equal(collapsed[0].plu, '50001');
assert.equal(collapsed[0].price, '8.00');
assert.equal(collapsed[0].effective_time, '00:00');
assert.equal(collapsed[1].price, 'Ask');

console.log('scheduled price collapse tests passed');

#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { validateRecords } = require('../lib/validate-intermediate');

const good = validateRecords([
  { source_row_number: '10', item_name: 'Guinness', price: '9.00', category: 'Draft Beer', plu: '100' },
]);
assert.equal(good.valid, true);
assert.equal(good.counts.error, 0);

const bad = validateRecords([
  { source_row_number: '11', item_name: '', price: 'abc', category: '', plu: '200' },
  { source_row_number: '12', item_name: 'Other', price: '5.00', category: 'Beer', plu: '200' },
]);
assert.equal(bad.valid, false);
assert.equal(bad.issues.some((issue) => issue.code === 'missing_item_name'), true);
assert.equal(bad.issues.some((issue) => issue.code === 'invalid_price'), true);
assert.equal(bad.issues.some((issue) => issue.code === 'duplicate_plu'), true);

console.log('intermediate validation tests passed');

#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { mapToTemplate } = require('../lib/toast-template');

const record = {
  item_name: 'Guinness',
  price: '9.00',
  category: 'Draft Beer',
  plu: '1234',
};

const headers = ['Item Name', 'Price', 'Sales Category', 'PLU', 'Active', 'Unknown Toast Field'];
const mapped = mapToTemplate(record, headers, { defaults: { Active: 'TRUE' } });

assert.deepEqual(mapped, {
  'Item Name': 'Guinness',
  Price: '9.00',
  'Sales Category': 'Draft Beer',
  PLU: '1234',
  Active: 'TRUE',
  'Unknown Toast Field': '',
});

const custom = mapToTemplate(record, ['Product'], { columns: { Product: 'item_name' } });
assert.equal(custom.Product, 'Guinness');

console.log('toast-template mapping tests passed');

#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { mapRecord } = require('../lib/aloha-fields');

const source = {
  source_row_number: '42',
  description: 'Guinness',
  price: '9.00',
  sales_category: 'Draft Beer',
  item_number: '1234',
};

assert.deepEqual(mapRecord(source), {
  source_row_number: '42',
  item_name: 'Guinness',
  price: '9.00',
  category: 'Draft Beer',
  plu: '1234',
  effective_time: '',
  pricing_program_classification: '',
  pricing_program_confidence: '',
  pricing_program_reason: '',
  pricing_program_matching_rows: '',
});

assert.equal(
  mapRecord({ custom_name: 'Smithwicks' }, { fields: { itemName: 'custom_name' } }).item_name,
  'Smithwicks'
);

console.log('aloha-field mapping tests passed');

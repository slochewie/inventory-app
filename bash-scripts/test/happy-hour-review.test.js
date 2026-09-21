#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { reviewRows } = require('../lib/happy-hour-review');

const result = reviewRows([
  {
    source_row_number: '10',
    item_name: 'Guinness',
    price: '9.00',
    pricing_program_classification: '',
  },
  {
    source_row_number: '11',
    item_name: 'Guinness',
    price: '8.00',
    pricing_program_classification: 'possible_happy_hour',
    pricing_program_confidence: 'medium',
    pricing_program_reason: 'price_is_1.00_below_matching_item',
    pricing_program_matching_rows: '10',
  },
]);

assert.equal(result.length, 1);
assert.equal(result[0].source_row_number, '11');
assert.equal(result[0].alternate_price, '8.00');
assert.equal(result[0].matching_regular_source_rows, '10');
assert.equal(result[0].review_status, '');
assert.equal(result[0].confirmed_start_time, '');

console.log('Happy Hour review tests passed');

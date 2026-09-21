#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { classifyPriceVariants, comparableName } = require('../lib/pricing-programs');

assert.equal(comparableName(' Guinness HH '), 'guinness');

const rows = [
  { toast_candidate_name: 'Guinness', toast_candidate_price: '9.00' },
  { toast_candidate_name: 'Guinness', toast_candidate_price: '8.00' },
  { toast_candidate_name: 'Smithwicks', toast_candidate_price: '8.00' },
  { toast_candidate_name: 'Smithwicks Happy Hour', toast_candidate_price: '7.00' },
  { toast_candidate_name: 'Food Special', toast_candidate_price: '10.00' },
];

const result = classifyPriceVariants(rows);

assert.equal(result[0].classification, '');
assert.equal(result[1].classification, 'possible_happy_hour');
assert.equal(result[1].confidence, 'medium');
assert.deepEqual(result[1].matchedRowIndexes, [0]);

assert.equal(result[3].classification, 'explicit_happy_hour');
assert.equal(result[3].confidence, 'high');
assert.deepEqual(result[3].matchedRowIndexes, [2]);

assert.equal(result[4].classification, '');

console.log('pricing-program tests passed');

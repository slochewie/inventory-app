#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const config = require('../config/toast-menu-template-2025.json');
const { toMenuBuildRow } = require('../lib/toast-menu-build');

const row = toMenuBuildRow({
  item_name: 'Guinness',
  price: '9.00',
  category: 'Draft Beer',
  description: '',
  modifier_groups: 'Pint Size|Beer Mods'
}, config);

assert.equal(row[0], 'Guinness');
assert.equal(row[1], '9.00');
assert.equal(row[2], '');
assert.equal(row[3], 'Draft Beer');
assert.equal(row[4], 'Pint Size');
assert.equal(row[5], 'Beer Mods');
assert.equal(row.length, 14);

console.log('Toast Menu Build tests passed');

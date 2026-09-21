#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { applyMigrationRules } = require('../lib/migration-rules');

const result = applyMigrationRules([
  { item_name: 'Old Fashioned', category: 'COCKTAILS', plu: '1' },
  { item_name: 'Jameson', category: 'BOURB WHISK', plu: '2' },
  { item_name: 'Guinness Pint', category: 'DRAFT REG PINT', plu: '3' },
  { item_name: 'Guinness 10oz', category: 'DRAFT 10OZ', plu: '4' },
  { item_name: 'Guinness Imperial', category: 'DRAFT IMP PINT', plu: '5' },
  { item_name: 'Modelo Can', category: 'BEER CAN', plu: '6' },
]);

assert.deepEqual(result.kept.map((row) => row.item_name), [
  'Jameson',
  'Guinness Pint',
  'Guinness 10oz',
  'Modelo Can',
]);
assert.equal(result.kept[0].category, 'WHISKEY/BOURBON');
assert.equal(result.renamedCount, 1);
assert.equal(result.held.length, 2);
assert.equal(result.held.find((row) => row.item_name === 'Old Fashioned').migration_action, 'out_of_scope');
assert.equal(result.held.find((row) => row.item_name === 'Guinness Imperial').migration_action, 'obsolete');

console.log('migration rule tests passed');

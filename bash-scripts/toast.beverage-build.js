#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, stringifyCsv } = require('./lib/csv');
const { collapseScheduledPrices } = require('./lib/collapse-scheduled-prices');
const { DEFAULT_RULES } = require('./lib/migration-rules');
const { buildBeverageRows } = require('./lib/toast-beverage-build');

function records(rows) {
  const headers = rows[0] || [];
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function main() {
  const [input, beerOutput, liquorOutput] = process.argv.slice(2);
  if (!input || !beerOutput || !liquorOutput) {
    throw new Error('Usage: toast.beverage-build.js intermediate.csv beer.csv liquor.csv');
  }

  const source = collapseScheduledPrices(records(parseCsv(fs.readFileSync(input, 'utf8'))));
  const included = new Set(DEFAULT_RULES.includedGroups);
  const relevant = source.filter((record) =>
    included.has(String(record.category || '').trim().toUpperCase()));

  const { beer, liquor } = buildBeverageRows(relevant);

  fs.mkdirSync(path.dirname(path.resolve(beerOutput)), { recursive: true });
  fs.writeFileSync(beerOutput, stringifyCsv([
    ['Beer Name', 'Draft 10 oz Price', 'Draft 10 oz Happy Hour', 'Draft 16 oz Price', 'Draft 16 oz Happy Hour', 'Can 12 oz Price', 'Can 12 oz Happy Hour', 'Can 24 oz Price', 'Can 24 oz Happy Hour', 'Obsolete 20 oz Price (Review Only)'],
    ...beer.map((row) => [
      row.item_name, row.draft_10oz_price, row.draft_10oz_happy_hour,
      row.draft_16oz_price, row.draft_16oz_happy_hour,
      row.can_12oz_price, row.can_12oz_happy_hour,
      row.can_24oz_price, row.can_24oz_happy_hour,
      row.obsolete_20oz_price,
    ]),
  ]));

  fs.writeFileSync(liquorOutput, stringifyCsv([
    ['Item Name', 'Base Price ($)', 'Happy Hour $', 'Liquor Type'],
    ...liquor.map((row) => [
      row.item_name, row.base_price, row.happy_hour_price, row.liquor_type,
    ]),
  ]));

  console.log(JSON.stringify({
    input,
    beerOutput,
    liquorOutput,
    beerProducts: beer.length,
    liquorItems: liquor.length,
    note: '10 oz draft preserved explicitly; not mapped to Toast stock 8 oz.',
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error('Error: ' + error.message);
  process.exitCode = 1;
}

#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, stringifyCsv } = require('./lib/csv');
const { reviewRows } = require('./lib/happy-hour-review');

const HEADERS = [
  'source_row_number',
  'item_name',
  'alternate_price',
  'classification',
  'confidence',
  'reason',
  'matching_regular_source_rows',
  'review_status',
  'confirmed_program_name',
  'confirmed_start_time',
  'confirmed_end_time',
  'reviewer_notes',
];

function records(rows) {
  const headers = rows[0] || [];
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  );
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    throw new Error('Usage: happy-hour.review.js classified-intermediate.csv review.csv');
  }

  const rows = parseCsv(fs.readFileSync(input, 'utf8'));
  if (rows.length < 2) throw new Error('Input CSV has no data rows');

  const review = reviewRows(records(rows));
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(
    output,
    stringifyCsv([HEADERS, ...review.map((record) => HEADERS.map((header) => record[header] ?? ''))])
  );

  console.log(JSON.stringify({
    input,
    output,
    rowsForReview: review.length,
    note: 'Happy Hour must be configured manually in Toast after review; this file preserves the pricing-program evidence and schedule fields.'
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

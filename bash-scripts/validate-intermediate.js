#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, stringifyCsv } = require('./lib/csv');
const { validateRecords } = require('./lib/validate-intermediate');

const HEADERS = ['source_row_number', 'severity', 'field', 'code', 'message'];

function records(rows) {
  const headers = rows[0] || [];
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  );
}

function main() {
  const [input, report] = process.argv.slice(2);
  if (!input || !report) {
    throw new Error('Usage: validate-intermediate.js mapped.csv validation.csv');
  }

  const rows = parseCsv(fs.readFileSync(input, 'utf8'));
  if (rows.length < 2) throw new Error('Mapped CSV has no data rows');

  const result = validateRecords(records(rows));
  fs.mkdirSync(path.dirname(path.resolve(report)), { recursive: true });
  fs.writeFileSync(
    report,
    stringifyCsv([HEADERS, ...result.issues.map((issue) => HEADERS.map((header) => issue[header] ?? ''))])
  );

  console.log(JSON.stringify({
    input,
    report,
    valid: result.valid,
    errors: result.counts.error,
    warnings: result.counts.warning,
  }, null, 2));

  if (!result.valid) process.exitCode = 2;
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

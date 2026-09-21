#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, stringifyCsv } = require('./lib/csv');
const { mapRecords } = require('./lib/aloha-fields');

const HELP = `Usage:
  aloha.map-fields.js input.csv output.csv [--config mapping.json]

The output is a stable intermediate schema:
  source_row_number,item_name,price,category,plu,
  pricing_program_classification,pricing_program_confidence,
  pricing_program_reason,pricing_program_matching_rows

A JSON config can explicitly select source columns, for example:
{
  "fields": {
    "itemName": "description",
    "price": "price",
    "category": "sales_category",
    "plu": "item_number"
  }
}
`;

function parseArgs(argv) {
  const positional = [];
  let configPath = '';
  let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') help = true;
    else if (arg === '--config') configPath = argv[++i] || '';
    else if (arg.startsWith('--config=')) configPath = arg.slice(9);
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  return { input: positional[0] || '', output: positional[1] || '', configPath, help };
}

function recordsFromRows(rows) {
  const headers = rows[0] || [];
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP.trimEnd());
    return;
  }
  if (!args.input || !args.output) throw new Error(HELP.trimEnd());

  const rows = parseCsv(fs.readFileSync(args.input, 'utf8'));
  if (rows.length < 2) throw new Error('Input CSV has no data rows');

  const config = args.configPath
    ? JSON.parse(fs.readFileSync(args.configPath, 'utf8'))
    : {};

  const mapped = mapRecords(recordsFromRows(rows), config);
  const headers = [
    'source_row_number',
    'item_name',
    'price',
    'category',
    'plu',
    'pricing_program_classification',
    'pricing_program_confidence',
    'pricing_program_reason',
    'pricing_program_matching_rows',
  ];

  const missingName = mapped.filter((record) => !record.item_name).length;
  const missingPrice = mapped.filter((record) => !record.price).length;

  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(
    args.output,
    stringifyCsv([headers, ...mapped.map((record) => headers.map((header) => record[header] ?? ''))])
  );

  console.log(JSON.stringify({
    input: args.input,
    output: args.output,
    config: args.configPath || null,
    rows: mapped.length,
    missingItemName: missingName,
    missingPrice,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

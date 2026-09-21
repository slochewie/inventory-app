#!/usr/bin/env node
'use strict';

/*
 * Classify pricing variants in a normalized Aloha CSV.
 *
 * This stage does not turn possible Happy Hour rows into confirmed Toast
 * configuration. It records the evidence so the review/mapping stage can make
 * that decision with organization-specific pricing rules and schedules.
 */

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, stringifyCsv } = require('./lib/csv');
const { classifyPriceVariants } = require('./lib/pricing-programs');

const HELP = `Usage:
  aloha.classify-pricing.js input.csv output.csv [options]

Options:
  --discount amount     Expected alternate-price difference. Default: 1.00
  --name-field name     Item-name column. Default: toast_candidate_name
  --price-field name    Price column. Default: toast_candidate_price
  -h, --help            Show this help.
`;

function parseArgs(argv) {
  const positional = [];
  const options = {
    discount: 1,
    nameField: 'toast_candidate_name',
    priceField: 'toast_candidate_price',
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg === '--discount') options.discount = Number.parseFloat(argv[++i]);
    else if (arg.startsWith('--discount=')) options.discount = Number.parseFloat(arg.slice(11));
    else if (arg === '--name-field') options.nameField = argv[++i] || '';
    else if (arg.startsWith('--name-field=')) options.nameField = arg.slice(13);
    else if (arg === '--price-field') options.priceField = argv[++i] || '';
    else if (arg.startsWith('--price-field=')) options.priceField = arg.slice(14);
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }

  if (!Number.isFinite(options.discount) || options.discount <= 0) {
    throw new Error('--discount must be a positive number');
  }

  return { ...options, input: positional[0] || '', output: positional[1] || '' };
}

function rowsToRecords(headers, rows) {
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
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

  const headers = rows[0];
  if (!headers.includes(args.nameField)) throw new Error(`Missing name field: ${args.nameField}`);
  if (!headers.includes(args.priceField)) throw new Error(`Missing price field: ${args.priceField}`);

  const records = rowsToRecords(headers, rows.slice(1));
  const results = classifyPriceVariants(records, {
    nameField: args.nameField,
    priceField: args.priceField,
    discount: args.discount,
  });

  const addedHeaders = [
    'pricing_program_classification',
    'pricing_program_confidence',
    'pricing_program_reason',
    'pricing_program_matching_rows',
  ];
  const outputHeaders = [...headers, ...addedHeaders.filter((header) => !headers.includes(header))];

  const outputRows = records.map((record, index) => {
    const result = results[index];
    const enriched = {
      ...record,
      pricing_program_classification: result.classification,
      pricing_program_confidence: result.confidence,
      pricing_program_reason: result.reason,
      pricing_program_matching_rows: result.matchedRowIndexes
        .map((matchedIndex) => records[matchedIndex].source_row_number || String(matchedIndex + 2))
        .join('|'),
    };
    return outputHeaders.map((header) => enriched[header] ?? '');
  });

  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, stringifyCsv([outputHeaders, ...outputRows]));

  const counts = results.reduce((acc, result) => {
    const key = result.classification || 'unclassified';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    input: args.input,
    output: args.output,
    discount: args.discount,
    rows: records.length,
    classifications: counts,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

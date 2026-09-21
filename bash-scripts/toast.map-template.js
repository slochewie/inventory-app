#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, stringifyCsv } = require('./lib/csv');
const { mapRecordsToTemplate } = require('./lib/toast-template');

const HELP = `Usage:
  toast.map-template.js intermediate.csv toast-template.csv output.csv [--config mapping.json]

The Toast template CSV supplies the exact output headers and column order.
Only recognized or explicitly configured columns are populated; all other
Toast columns are preserved as blank unless a default is configured.

Example mapping.json:
{
  "columns": {
    "Item Name": "item_name",
    "Price": "price",
    "Sales Category": "category",
    "PLU": "plu"
  },
  "defaults": {
    "Active": "TRUE"
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
  return {
    input: positional[0] || '',
    template: positional[1] || '',
    output: positional[2] || '',
    configPath,
    help,
  };
}

function records(rows) {
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
  if (!args.input || !args.template || !args.output) throw new Error(HELP.trimEnd());

  const inputRows = parseCsv(fs.readFileSync(args.input, 'utf8'));
  const templateRows = parseCsv(fs.readFileSync(args.template, 'utf8'));
  if (inputRows.length < 2) throw new Error('Intermediate CSV has no data rows');
  if (!templateRows.length || !templateRows[0].length) throw new Error('Toast template has no header row');

  const templateHeaders = templateRows[0];
  const config = args.configPath ? JSON.parse(fs.readFileSync(args.configPath, 'utf8')) : {};
  const mapped = mapRecordsToTemplate(records(inputRows), templateHeaders, config);

  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(
    args.output,
    stringifyCsv([
      templateHeaders,
      ...mapped.map((record) => templateHeaders.map((header) => record[header] ?? '')),
    ])
  );

  const populatedColumns = templateHeaders.filter((header) =>
    mapped.some((record) => String(record[header] ?? '').trim())
  );

  console.log(JSON.stringify({
    input: args.input,
    template: args.template,
    output: args.output,
    rows: mapped.length,
    templateColumns: templateHeaders.length,
    populatedColumns,
    blankColumns: templateHeaders.filter((header) => !populatedColumns.includes(header)),
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, stringifyCsv } = require('./lib/csv');
const { toMenuBuildRows } = require('./lib/toast-menu-build');
const { collapseScheduledPrices } = require('./lib/collapse-scheduled-prices');

function records(rows) {
  const headers = rows[0] || [];
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  );
}

function main() {
  const [input, output, configPath = path.join(__dirname, 'config', 'toast-menu-template-2025.json')] =
    process.argv.slice(2);

  if (!input || !output) {
    throw new Error('Usage: toast.menu-build.js intermediate.csv output.csv [template-config.json]');
  }

  const inputRows = parseCsv(fs.readFileSync(input, 'utf8'));
  if (inputRows.length < 2) throw new Error('Intermediate CSV has no data rows');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const source = records(inputRows);

  // Aloha may repeat a PLU for scheduled prices. Toast migration ignores
  // those schedules and imports one base/normal-price menu item per PLU.
  const regular = collapseScheduledPrices(source);
  const scheduledRowsCollapsed = source.length - regular.length;

  const rows = toMenuBuildRows(regular, config);
  const headers = [
    'Item Name',
    'Base Price ($)',
    'Description (Optional; this is visible to guests via Online Ordering)',
    'Menu Group Name',
    ...Array(10).fill('Assign Modifier Groups (Optional)'),
  ];

  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, stringifyCsv([headers, ...rows]));

  console.log(JSON.stringify({
    input,
    output,
    templateVersion: config.templateVersion,
    sheetName: config.menuBuild.sheetName,
    sourceRows: source.length,
    menuBuildRows: rows.length,
    scheduledRowsCollapsed
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

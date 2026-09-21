#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, stringifyCsv } = require('./lib/csv');

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: toast.beer-tab.js toast-beer.csv output.csv');

  const rows = parseCsv(fs.readFileSync(input, 'utf8'));
  const headers = rows[0] || [];
  const ix = (name) => headers.indexOf(name);

  const out = [[
    'Draft Beer', '10oz', 'Happy Hour $', '16oz', 'Happy Hour $',
    '24oz', 'Happy Hour $', 'Pitcher', 'Happy Hour $',
    'Can', 'Price $', 'Happy Hour $',
    'Bottle', 'Price $', 'Happy Hour $',
  ]];

  for (const row of rows.slice(1)) {
    const name = row[ix('Beer Name')] || '';
    const d10 = row[ix('Draft 10 oz Price')] || '';
    const d10h = row[ix('Draft 10 oz Happy Hour')] || '';
    const d16 = row[ix('Draft 16 oz Price')] || '';
    const d16h = row[ix('Draft 16 oz Happy Hour')] || '';
    const c12 = row[ix('Can 12 oz Price')] || '';
    const c12h = row[ix('Can 12 oz Happy Hour')] || '';
    const c24 = row[ix('Can 24 oz Price')] || '';
    const c24h = row[ix('Can 24 oz Happy Hour')] || '';

    if (d10 || d16) out.push([name, d10, d10h, d16, d16h, '', '', '', '', '', '', '', '', '', '']);
    if (c12) out.push(['', '', '', '', '', '', '', '', '', name, c12, c12h, '', '', '']);
    // McCarthy's Aloha "Tall" means a 24 oz can. Toast's Beer template has
    // only Can and Bottle packaged-beer sections, so the second section is
    // used as the 24 oz packaged-beer slot while retaining that fact upstream.
    if (c24) out.push(['', '', '', '', '', '', '', '', '', '', '', '', name, c24, c24h]);
  }

  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, stringifyCsv(out));

  console.log(JSON.stringify({
    input,
    output,
    rows: out.length - 1,
    note: 'Toast Beer tab staging: 10oz custom draft size, 16oz draft, standard cans in Can, 24oz Tall cans in Bottle slot; Happy Hour is $1 off.',
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error('Error: ' + error.message);
  process.exitCode = 1;
}

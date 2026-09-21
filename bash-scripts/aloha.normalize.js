#!/usr/bin/env node
/*
 * Normalize an Aloha CSV export into a stable intermediate CSV.
 *
 * This is deliberately POS-agnostic on the output side. Later stages can
 * classify products, detect pricing programs, and map the normalized records
 * into Toast's import template without reparsing Aloha report noise.
 *
 * Usage:
 *   node bash-scripts/aloha.normalize.js input.csv output.csv
 *   node bash-scripts/aloha.normalize.js input.csv output.csv --skipped skipped.csv
 */

const fs = require('node:fs');
const path = require('node:path');

const HELP = `Usage:
  aloha.normalize.js input.csv output.csv [options]

Options:
  --skipped path.csv   Write removed rows with their skip reason.
  --debug              Print detection details.
  -h, --help           Show this help.
`;

function parseArgs(argv) {
  const positional = [];
  const options = { skipped: '', debug: false, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg === '--debug') options.debug = true;
    else if (arg === '--skipped') {
      if (!argv[i + 1]) throw new Error('--skipped requires a path');
      options.skipped = argv[++i];
    } else if (arg.startsWith('--skipped=')) {
      options.skipped = arg.slice('--skipped='.length);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else positional.push(arg);
  }

  return { ...options, input: positional[0] || '', output: positional[1] || '' };
}

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').trim();
}

function normalizedHeader(value) {
  return clean(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function uniqueHeaders(row) {
  const counts = new Map();
  return row.map((value, index) => {
    const base = normalizedHeader(value) || `column_${index + 1}`;
    const n = counts.get(base) || 0;
    counts.set(base, n + 1);
    return n ? `${base}_${n + 1}` : base;
  });
}

function headerScore(row) {
  const cells = row.map(clean).filter(Boolean);
  if (cells.length < 2) return -100;
  const joined = cells.join(' ').toLowerCase();
  let score = cells.length;
  for (const re of [
    /\bitem\b|\bitem name\b|\bdescription\b/,
    /\bprice\b|\bamount\b|\bcost\b/,
    /\bcategory\b|\bdepartment\b|\bmenu group\b/,
    /\bplu\b|\bsku\b|\bitem id\b|\bnumber\b/,
  ]) if (re.test(joined)) score += 10;
  return score;
}

function detectHeader(rows) {
  let best = { index: 0, score: -Infinity };
  for (let i = 0; i < Math.min(rows.length, 80); i += 1) {
    const score = headerScore(rows[i]);
    if (score > best.score) best = { index: i, score };
  }
  return best;
}

function money(value) {
  const text = clean(value);
  if (!text) return '';
  const negative = /^\(/.test(text) || /^-/.test(text);
  const number = text.replace(/[,$()\s]/g, '').replace(/^\+/, '');
  if (!/^\d+(?:\.\d+)?$/.test(number)) return text;
  const parsed = Number.parseFloat(number);
  return Number.isFinite(parsed) ? `${negative ? '-' : ''}${parsed.toFixed(2)}` : text;
}

function isMoney(value) {
  return /^\(?-?\$?\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?\)?$/.test(clean(value));
}

function findNameIndex(headers) {
  let index = headers.findIndex((h) => /(^|_)(item_name|menu_item|description|button_text|long_name|short_name)(_|$)/.test(h));
  if (index < 0) index = headers.findIndex((h) => h === 'name' || h === 'item');
  return index;
}

function findPriceIndexes(headers, rows) {
  return headers.map((header, index) => ({ header, index })).filter(({ header, index }) => {
    if (/(^|_)(price|amount|cost|regular_price|base_price)(_|$)/.test(header)) return true;
    if (/(id|number|num|plu|sku|qty|quantity|count)/.test(header)) return false;
    const values = rows.map((row) => clean(row[index])).filter(Boolean);
    return values.length >= 3 && values.filter(isMoney).length / values.length >= 0.65;
  }).map(({ index }) => index);
}

function skipReason(row, headerRow) {
  const values = row.map(clean);
  const nonempty = values.filter(Boolean);
  if (!nonempty.length) return 'blank row';

  const normalized = values.map(normalizedHeader);
  const headerNormalized = headerRow.map(normalizedHeader);
  const same = normalized.filter((v, i) => v && v === headerNormalized[i]).length;
  if (same >= 2 && same >= Math.min(nonempty.length, headerNormalized.filter(Boolean).length) * 0.7) return 'repeated header row';

  if (nonempty.every((v) => /^[\-=*_ ]+$/.test(v))) return 'divider row';

  const first = clean(nonempty[0]).toLowerCase();
  if (/^(total|subtotal|grand total|record count|number of records)\b/.test(first)) return 'total/subtotal row';

  if (nonempty.length <= 3) {
    const text = nonempty.join(' ').toLowerCase();
    if (/\b(report|generated|printed|page|aloha|export)\b/.test(text) && !/\b(price|item name|description)\b/.test(text)) {
      return 'report metadata row';
    }
  }
  return '';
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filename, rows) {
  fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  fs.writeFileSync(filename, rows.map((row) => row.map(csvEscape).join(',')).join('\n') + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP.trimEnd());
    return;
  }
  if (!args.input || !args.output) throw new Error(HELP.trimEnd());

  const rows = parseCsv(fs.readFileSync(args.input, 'utf8')).map((row) => row.map(clean));
  if (!rows.length) throw new Error('Input CSV is empty');

  const detected = detectHeader(rows);
  const rawHeader = rows[detected.index];
  const headers = uniqueHeaders(rawHeader);
  const sourceRows = rows.slice(detected.index + 1);
  const nameIndex = findNameIndex(headers);
  const priceIndexes = findPriceIndexes(headers, sourceRows);

  const outputHeader = ['source_row_number', ...headers];
  const output = [outputHeader];
  const skipped = [['source_row_number', 'reason', ...headers]];

  sourceRows.forEach((source, offset) => {
    const sourceRowNumber = detected.index + offset + 2;
    const row = source.slice(0, headers.length);
    while (row.length < headers.length) row.push('');

    const reason = skipReason(row, rawHeader);
    if (reason) {
      skipped.push([String(sourceRowNumber), reason, ...row]);
      return;
    }

    for (const index of priceIndexes) row[index] = money(row[index]);
    output.push([String(sourceRowNumber), ...row]);
  });

  writeCsv(args.output, output);
  if (args.skipped) writeCsv(args.skipped, skipped);

  const report = {
    input: args.input,
    output: args.output,
    skipped: args.skipped || null,
    sourceRows: rows.length,
    detectedHeaderRow: detected.index + 1,
    writtenRows: output.length - 1,
    skippedRows: skipped.length - 1,
    itemNameColumn: nameIndex >= 0 ? headers[nameIndex] : null,
    priceColumns: priceIndexes.map((index) => headers[index]),
  };
  if (args.debug) report.headerScore = detected.score;
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

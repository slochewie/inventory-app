#!/usr/bin/env node
/*
 * Clean an Aloha menu item CSV export into a reviewable Toast import-prep CSV.
 *
 * Usage:
 *   ./bash-scripts/aloha.to.toast.menu.js input.csv output.csv
 *   node bash-scripts/aloha.to.toast.menu.js input.csv output.csv
 *
 * This intentionally does not try to be the final Toast importer. It removes
 * Aloha report noise, keeps useful source columns, and adds a few candidate
 * fields that make the next mapping/reconciliation step easier.
 */

const fs = require('node:fs');
const path = require('node:path');

const HELP = `Usage:
  aloha.to.toast.menu.js input.csv output.csv [options]

Options:
  --skipped path.csv        Write skipped rows and skip reasons for inspection.
  --keep-section-rows       Keep single-cell section/category rows instead of dropping them.
  --debug                   Print extra detection details.
  -h, --help                Show this help.

Examples:
  chmod +x bash-scripts/aloha.to.toast.menu.js
  ./bash-scripts/aloha.to.toast.menu.js "McCarthy's Pub Menu Items.csv" cleaned.csv
  ./bash-scripts/aloha.to.toast.menu.js input.csv output.csv --skipped skipped.csv
`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP.trimEnd());
    return 0;
  }

  if (!args.input || !args.output) {
    console.error(HELP.trimEnd());
    return 1;
  }

  const sourceText = fs.readFileSync(args.input, 'utf8');
  const rows = parseCsv(sourceText).map((row) => row.map(cleanCell));

  if (rows.length === 0) {
    throw new Error(`Input CSV is empty: ${args.input}`);
  }

  const headerInfo = detectHeader(rows);
  const rawHeaders = headerInfo.header;
  const headers = makeUniqueHeaders(rawHeaders);
  const dataRows = rows.slice(headerInfo.index + 1);

  const analysis = analyzeColumns(headers, dataRows);
  const outputHeaders = buildOutputHeaders(headers);
  const outputRows = [];
  const skippedRows = [];

  for (let i = 0; i < dataRows.length; i += 1) {
    const sourceRowNumber = headerInfo.index + 2 + i;
    const row = normalizeRowLength(dataRows[i], headers.length);
    const skipReason = getSkipReason(row, headers, rawHeaders, analysis, args);

    if (skipReason) {
      skippedRows.push({ sourceRowNumber, reason: skipReason, row });
      continue;
    }

    const record = rowToRecord(headers, row);
    normalizePriceColumns(record, analysis.priceColumns);

    const candidateName = valueAt(row, analysis.itemNameIndex);
    const candidatePrice = firstNonEmpty(analysis.priceColumns.map((columnName) => record[columnName]));
    const candidateCategory = firstNonEmpty([
      valueAt(row, analysis.menuGroupIndex),
      valueAt(row, analysis.categoryIndex),
      valueAt(row, analysis.departmentIndex),
    ]);

    record.toast_candidate_name = normalizeItemName(candidateName);
    record.toast_candidate_price = candidatePrice;
    record.toast_candidate_category = normalizeWhitespace(candidateCategory);
    record.likely_happy_hour_variant = isLikelyHappyHourRow(record, row) ? 'yes' : '';
    record.cleanup_notes = '';
    record.source_row_number = String(sourceRowNumber);

    outputRows.push(record);
  }

  annotateLikelyHappyHourPricePairs(outputRows);

  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, stringifyCsv([outputHeaders, ...recordsToRows(outputRows, outputHeaders)]));

  if (args.skippedPath) {
    fs.mkdirSync(path.dirname(path.resolve(args.skippedPath)), { recursive: true });
    const skippedHeaders = ['source_row_number', 'reason', ...headers];
    const skippedCsvRows = skippedRows.map((entry) => [
      String(entry.sourceRowNumber),
      entry.reason,
      ...normalizeRowLength(entry.row, headers.length),
    ]);
    fs.writeFileSync(args.skippedPath, stringifyCsv([skippedHeaders, ...skippedCsvRows]));
  }

  const report = {
    input: args.input,
    output: args.output,
    skipped: args.skippedPath || null,
    sourceRows: rows.length,
    detectedHeaderRow: headerInfo.index + 1,
    detectedHeaders: headers,
    writtenRows: outputRows.length,
    skippedRows: skippedRows.length,
    itemNameColumn: headers[analysis.itemNameIndex] || null,
    priceColumns: analysis.priceColumns,
  };

  if (args.debug) {
    report.headerScore = headerInfo.score;
    report.columnAnalysis = analysis;
    report.skipReasonCounts = skippedRows.reduce((acc, entry) => {
      acc[entry.reason] = (acc[entry.reason] || 0) + 1;
      return acc;
    }, {});
  }

  console.log(JSON.stringify(report, null, 2));
  return 0;
}

function parseArgs(argv) {
  const positional = [];
  const args = {
    input: '',
    output: '',
    skippedPath: '',
    keepSectionRows: false,
    debug: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      args.help = true;
    } else if (arg === '--debug') {
      args.debug = true;
    } else if (arg === '--keep-section-rows') {
      args.keepSectionRows = true;
    } else if (arg === '--skipped') {
      const next = argv[i + 1];
      if (!next) throw new Error('--skipped requires a path');
      args.skippedPath = next;
      i += 1;
    } else if (arg.startsWith('--skipped=')) {
      args.skippedPath = arg.slice('--skipped='.length);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  args.input = positional[0] || '';
  args.output = positional[1] || '';
  return args;
}

function parseCsv(text) {
  let input = text;
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      if (next === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function stringifyCsv(rows) {
  return `${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`;
}

function csvEscape(value) {
  const stringValue = value == null ? '' : String(value);
  if (/^[\s]|[\s]$|[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function cleanCell(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .trim();
}

function detectHeader(rows) {
  let best = { index: 0, header: rows[0] || [], score: Number.NEGATIVE_INFINITY };
  const searchLimit = Math.min(rows.length, 80);

  for (let i = 0; i < searchLimit; i += 1) {
    const row = rows[i];
    const score = scoreHeaderCandidate(row, i);
    if (score > best.score) {
      best = { index: i, header: row, score };
    }
  }

  if (best.score < 8) {
    const widest = rows
      .slice(0, searchLimit)
      .map((row, index) => ({ row, index, width: nonEmptyCells(row).length }))
      .sort((a, b) => b.width - a.width)[0];

    if (widest && widest.width > nonEmptyCells(best.header).length) {
      best = { index: widest.index, header: widest.row, score: best.score };
    }
  }

  return best;
}

function scoreHeaderCandidate(row, rowIndex) {
  const cells = row.map((cell) => normalizeHeaderText(cell)).filter(Boolean);
  const nonEmpty = cells.length;
  if (nonEmpty < 2) return -50 + nonEmpty;

  let score = Math.min(nonEmpty, 12);
  const joined = ` ${cells.join(' ')} `;

  const headerTerms = [
    /\b(item|menu item|item name|name|description|button text|short name|long name)\b/,
    /\b(price|amount|cost|regular price|base price)\b/,
    /\b(category|menu group|group|department|sales category|revenue center)\b/,
    /\b(id|number|num|plu|sku|pos id|item id)\b/,
    /\b(tax|taxable|tax group)\b/,
    /\b(modifier|mod group|prep|printer|kitchen)\b/,
  ];

  for (const term of headerTerms) {
    if (term.test(joined)) score += 8;
  }

  const uniqueCount = new Set(cells).size;
  if (uniqueCount >= Math.max(2, nonEmpty - 1)) score += 5;
  if (row.some((cell) => looksLikeMoney(cell))) score -= 10;
  if (row.some((cell) => looksLikeDate(cell))) score -= 5;
  if (rowIndex > 25) score -= Math.floor((rowIndex - 25) / 5);

  return score;
}

function makeUniqueHeaders(rawHeaders) {
  const counts = new Map();
  return rawHeaders.map((header, index) => {
    const base = toSnakeCase(header) || `column_${index + 1}`;
    const count = counts.get(base) || 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function toSnakeCase(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[$%#]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function normalizeHeaderText(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9$%# ]+/g, '')
    .trim();
}

function analyzeColumns(headers, dataRows) {
  const itemNameIndex = findColumnIndex(headers, [
    /(^|_)(item_name|menu_item|name|description|button_text|long_name|short_name)(_|$)/,
    /(^|_)item(?!_(id|num|number|plu|sku))(_|$)/,
  ], dataRows, 'text');

  const priceColumns = headers.filter((header, index) => {
    if (/(^|_)(price|amount|cost|base_price|regular_price)(_|$)/.test(header)) return true;
    if (/(^|_)(id|num|number|plu|sku|qty|quantity|count)(_|$)/.test(header)) return false;
    const values = dataRows.map((row) => valueAt(row, index)).filter(Boolean);
    if (values.length < 3) return false;
    const moneyLike = values.filter(looksLikeMoney).length;
    return moneyLike / values.length >= 0.65;
  });

  return {
    itemNameIndex,
    priceColumns,
    menuGroupIndex: findColumnIndex(headers, [/(^|_)(menu_group|menu|group)(_|$)/], dataRows, 'none'),
    categoryIndex: findColumnIndex(headers, [/(^|_)(category|sales_category)(_|$)/], dataRows, 'none'),
    departmentIndex: findColumnIndex(headers, [/(^|_)(department|dept|revenue_center)(_|$)/], dataRows, 'none'),
  };
}

function findColumnIndex(headers, headerRegexes, dataRows, fallbackType) {
  const headerMatchIndex = headers.findIndex((header) => headerRegexes.some((regex) => regex.test(header)));
  if (headerMatchIndex !== -1) return headerMatchIndex;

  if (fallbackType !== 'text') return -1;

  const scores = headers.map((header, index) => {
    if (/(^|_)(id|num|number|plu|sku|price|cost|amount|qty|quantity|tax)(_|$)/.test(header)) return -1;
    const values = dataRows.map((row) => valueAt(row, index)).filter(Boolean);
    if (values.length === 0) return -1;
    const textValues = values.filter((value) => /[a-zA-Z]/.test(value) && !looksLikeMoney(value));
    return textValues.length / values.length;
  });

  const bestScore = Math.max(...scores);
  return bestScore > 0.4 ? scores.indexOf(bestScore) : -1;
}

function buildOutputHeaders(sourceHeaders) {
  const candidateHeaders = [
    'source_row_number',
    'toast_candidate_name',
    'toast_candidate_price',
    'toast_candidate_category',
    'likely_happy_hour_variant',
    'cleanup_notes',
  ];
  return [...candidateHeaders, ...sourceHeaders.filter((header) => !candidateHeaders.includes(header))];
}

function getSkipReason(row, headers, rawHeaders, analysis, args) {
  const nonEmpty = nonEmptyCells(row);
  if (nonEmpty.length === 0) return 'blank row';

  if (isRepeatedHeader(row, rawHeaders)) return 'repeated header row';
  if (isDividerRow(row)) return 'divider row';
  if (isReportMetadataRow(row)) return 'report metadata row';
  if (isTotalRow(row)) return 'total/subtotal row';

  const itemName = valueAt(row, analysis.itemNameIndex);
  const hasPrice = analysis.priceColumns.some((columnName) => {
    const columnIndex = headers.indexOf(columnName);
    return looksLikeMoney(valueAt(row, columnIndex));
  });

  if (!itemName && !hasPrice) return 'no item name or price';

  if (!args.keepSectionRows && nonEmpty.length === 1 && !hasPrice) {
    return 'single-cell section row';
  }

  if (!args.keepSectionRows && itemName && !hasPrice && nonEmpty.length <= 2 && looksLikeSectionLabel(itemName)) {
    return 'section/category label row';
  }

  return '';
}

function isRepeatedHeader(row, rawHeaders) {
  const normalizedRow = row.map(normalizeHeaderText).filter(Boolean);
  const normalizedHeader = rawHeaders.map(normalizeHeaderText).filter(Boolean);
  if (normalizedRow.length < 2 || normalizedHeader.length < 2) return false;
  const overlap = normalizedRow.filter((cell, index) => cell === normalizedHeader[index]).length;
  return overlap >= Math.min(normalizedHeader.length, normalizedRow.length) * 0.7;
}

function isDividerRow(row) {
  return nonEmptyCells(row).every((cell) => /^[\-=*_ ]+$/.test(cell));
}

function isReportMetadataRow(row) {
  const nonEmpty = nonEmptyCells(row);
  if (nonEmpty.length > 3) return false;
  const text = normalizeHeaderText(nonEmpty.join(' '));
  return /\b(report|generated|printed|page|date|time|aloha|menu items?|export|store|location)\b/.test(text) && !/\b(price|item name|description)\b/.test(text);
}

function isTotalRow(row) {
  const first = normalizeHeaderText(nonEmptyCells(row)[0] || '');
  return /^(total|subtotal|grand total|record count|count|number of records)\b/.test(first);
}

function looksLikeSectionLabel(value) {
  const text = normalizeHeaderText(value);
  if (!text) return false;
  if (/\b(category|department|group|menu|beer|wine|liquor|cocktail|food|happy hour|hh)\b/.test(text)) return true;
  return text.length <= 40 && !looksLikeMoney(text) && !/\d{2,}/.test(text);
}

function rowToRecord(headers, row) {
  const record = {};
  headers.forEach((header, index) => {
    record[header] = valueAt(row, index);
  });
  return record;
}

function normalizePriceColumns(record, priceColumns) {
  for (const columnName of priceColumns) {
    record[columnName] = normalizePrice(record[columnName]);
  }
}

function normalizePrice(value) {
  const raw = normalizeWhitespace(value);
  if (!raw) return '';
  const negative = /^\(/.test(raw) || /^-/.test(raw);
  const numeric = raw.replace(/[,$()\s]/g, '').replace(/^\$/, '').replace(/^\+/, '');
  if (!/^\d+(?:\.\d+)?$/.test(numeric)) return raw;
  const amount = Number.parseFloat(numeric);
  if (!Number.isFinite(amount)) return raw;
  return `${negative ? '-' : ''}${amount.toFixed(2)}`;
}

function isLikelyHappyHourRow(record, row) {
  const haystack = Object.values(record).concat(row).join(' ').toLowerCase();
  return /\b(happy\s*hour|happy hr|\bhh\b|\$1\s*off|dollar\s*off)\b/.test(haystack);
}

function annotateLikelyHappyHourPricePairs(records) {
  const groups = new Map();

  for (const record of records) {
    const nameKey = comparableItemName(record.toast_candidate_name);
    const price = Number.parseFloat(record.toast_candidate_price);
    if (!nameKey || !Number.isFinite(price)) continue;

    if (!groups.has(nameKey)) groups.set(nameKey, []);
    groups.get(nameKey).push({ record, price });
  }

  for (const group of groups.values()) {
    const uniquePrices = [...new Set(group.map((entry) => entry.price).sort((a, b) => a - b))];
    if (uniquePrices.length < 2) continue;

    for (let i = 0; i < uniquePrices.length; i += 1) {
      for (let j = i + 1; j < uniquePrices.length; j += 1) {
        if (Math.abs(uniquePrices[j] - uniquePrices[i] - 1) < 0.001) {
          const lowPrice = uniquePrices[i];
          for (const entry of group) {
            if (Math.abs(entry.price - lowPrice) < 0.001) {
              entry.record.likely_happy_hour_variant = 'yes';
              appendNote(entry.record, 'price_is_$1_below_matching_item');
            }
          }
        }
      }
    }
  }
}

function appendNote(record, note) {
  const notes = record.cleanup_notes ? record.cleanup_notes.split('|') : [];
  if (!notes.includes(note)) notes.push(note);
  record.cleanup_notes = notes.filter(Boolean).join('|');
}

function comparableItemName(value) {
  return normalizeItemName(value)
    .toLowerCase()
    .replace(/\b(happy\s*hour|happy hr|hh|\$1\s*off|dollar\s*off)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeItemName(value) {
  return normalizeWhitespace(value)
    .replace(/\s+-\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

function recordsToRows(records, headers) {
  return records.map((record) => headers.map((header) => record[header] ?? ''));
}

function normalizeRowLength(row, length) {
  const output = row.slice(0, length);
  while (output.length < length) output.push('');
  return output;
}

function valueAt(row, index) {
  return index >= 0 ? cleanCell(row[index] || '') : '';
}

function firstNonEmpty(values) {
  return values.find((value) => normalizeWhitespace(value)) || '';
}

function nonEmptyCells(row) {
  return row.map(cleanCell).filter(Boolean);
}

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function looksLikeMoney(value) {
  const text = normalizeWhitespace(value);
  return /^\(?-?\$?\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?\)?$/.test(text);
}

function looksLikeDate(value) {
  const text = normalizeWhitespace(value);
  return /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(text) || /\b\d{4}-\d{2}-\d{2}\b/.test(text);
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

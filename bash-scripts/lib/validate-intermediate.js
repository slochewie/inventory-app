'use strict';

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function numericPrice(value) {
  const text = clean(value).replace(/[,$]/g, '');
  if (!text) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : null;
}

function validateRecord(record, index) {
  const issues = [];
  const row = clean(record.source_row_number) || String(index + 2);
  const name = clean(record.item_name);
  const priceText = clean(record.price);
  const price = numericPrice(priceText);

  if (!name) {
    issues.push({ source_row_number: row, severity: 'error', field: 'item_name', code: 'missing_item_name', message: 'Item name is required.' });
  }

  if (!priceText) {
    issues.push({ source_row_number: row, severity: 'warning', field: 'price', code: 'missing_price', message: 'Price is blank.' });
  } else if (price === null) {
    issues.push({ source_row_number: row, severity: 'error', field: 'price', code: 'invalid_price', message: `Price is not numeric: ${priceText}` });
  } else if (price < 0) {
    issues.push({ source_row_number: row, severity: 'error', field: 'price', code: 'negative_price', message: 'Price cannot be negative.' });
  }

  if (!clean(record.category)) {
    issues.push({ source_row_number: row, severity: 'warning', field: 'category', code: 'missing_category', message: 'Category/Menu Group is blank.' });
  }

  const classification = clean(record.pricing_program_classification);
  if (classification && !['possible_happy_hour', 'explicit_happy_hour'].includes(classification)) {
    issues.push({
      row,
      severity: 'warning',
      field: 'pricing_program_classification',
      code: 'unknown_pricing_classification',
      message: `Unknown pricing classification: ${classification}`,
    });
  }

  return issues;
}

function duplicateIssues(records) {
  const issues = [];
  const seenPlu = new Map();

  records.forEach((record, index) => {
    const plu = clean(record.plu);
    if (!plu) return;
    const row = clean(record.source_row_number) || String(index + 2);
    if (seenPlu.has(plu)) {
      issues.push({
        source_row_number: row,
        severity: 'warning',
        field: 'plu',
        code: 'duplicate_plu',
        message: `PLU ${plu} is also used by source row ${seenPlu.get(plu)}.`,
      });
    } else {
      seenPlu.set(plu, row);
    }
  });

  return issues;
}

function validateRecords(records) {
  const issues = records.flatMap(validateRecord);
  issues.push(...duplicateIssues(records));

  const counts = issues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, { error: 0, warning: 0 });

  return { issues, counts, valid: counts.error === 0 };
}

module.exports = { numericPrice, validateRecord, validateRecords };

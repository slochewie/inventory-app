'use strict';

/*
 * Pricing-program helpers.
 *
 * Aloha exports can contain the same item at multiple prices. Do not assume
 * every lower price is Happy Hour: the $1 relationship is evidence that must
 * be reviewed and can later be combined with organization-specific schedules.
 */

function normalizeName(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function comparableName(value) {
  return normalizeName(value)
    .toLowerCase()
    .replace(/\b(happy\s*hour|happy hr|hh|\$1\s*off|dollar\s*off)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numericPrice(value) {
  const text = String(value ?? '').trim().replace(/[,$]/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : null;
}

function explicitHappyHourText(record) {
  const text = Object.values(record).join(' ').toLowerCase();
  return /\b(happy\s*hour|happy hr|hh|\$1\s*off|dollar\s*off)\b/.test(text);
}

function classifyPriceVariants(records, options = {}) {
  const {
    nameField = 'toast_candidate_name',
    priceField = 'toast_candidate_price',
    discount = 1,
  } = options;

  const groups = new Map();

  records.forEach((record, index) => {
    const key = comparableName(record[nameField]);
    const price = numericPrice(record[priceField]);
    if (!key || price === null) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ index, record, price });
  });

  const classifications = records.map((record) => ({
    classification: explicitHappyHourText(record) ? 'explicit_happy_hour' : '',
    confidence: explicitHappyHourText(record) ? 'high' : '',
    matchedRowIndexes: [],
    reason: explicitHappyHourText(record) ? 'row_contains_happy_hour_marker' : '',
  }));

  for (const group of groups.values()) {
    for (const lower of group) {
      for (const higher of group) {
        if (lower.index === higher.index) continue;
        if (Math.abs((higher.price - lower.price) - discount) > 0.001) continue;

        const current = classifications[lower.index];
        if (current.classification === 'explicit_happy_hour') {
          current.matchedRowIndexes.push(higher.index);
          continue;
        }

        current.classification = 'possible_happy_hour';
        current.confidence = 'medium';
        current.reason = `price_is_${discount.toFixed(2)}_below_matching_item`;
        current.matchedRowIndexes.push(higher.index);
      }
    }
  }

  for (const result of classifications) {
    result.matchedRowIndexes = [...new Set(result.matchedRowIndexes)];
  }

  return classifications;
}

module.exports = {
  classifyPriceVariants,
  comparableName,
  explicitHappyHourText,
  numericPrice,
  normalizeName,
};

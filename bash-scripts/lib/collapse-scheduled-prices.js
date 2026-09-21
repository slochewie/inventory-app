'use strict';

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function numericPrice(value) {
  const text = clean(value).replace(/[,$]/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : null;
}

function timeMinutes(value) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function pickBaseRecord(group) {
  const numeric = group.filter((record) => numericPrice(record.price) !== null);
  if (!numeric.length) return group[0];

  const prices = new Map();
  for (const record of numeric) {
    const price = numericPrice(record.price);
    const key = price.toFixed(2);
    if (!prices.has(key)) prices.set(key, { price, count: 0, records: [] });
    const entry = prices.get(key);
    entry.count += 1;
    entry.records.push(record);
  }

  const selectedPrice = [...prices.values()].sort((a, b) =>
    b.count - a.count || b.price - a.price
  )[0];

  return selectedPrice.records.slice().sort((a, b) => {
    const at = timeMinutes(a.effective_time);
    const bt = timeMinutes(b.effective_time);
    return (at ?? Number.MAX_SAFE_INTEGER) - (bt ?? Number.MAX_SAFE_INTEGER);
  })[0];
}

function collapseScheduledPrices(records) {
  const groups = new Map();
  const order = [];

  records.forEach((record, index) => {
    const plu = clean(record.plu);
    const key = plu ? `plu:${plu}` : `row:${index}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(record);
  });

  return order.map((key) => pickBaseRecord(groups.get(key)));
}

module.exports = { collapseScheduledPrices, pickBaseRecord };

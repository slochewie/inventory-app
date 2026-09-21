'use strict';

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function keyName(value) {
  return clean(value)
    .replace(/\b(10\s*oz|10oz|16\s*oz|16oz|regular\s+pint|reg\s+pint|pint|imperial)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function price(value) {
  const text = clean(value);
  return /^ask$/i.test(text) ? '' : text;
}

function buildBeverageRows(records) {
  const beer = new Map();
  const liquor = [];

  for (const record of records) {
    const category = clean(record.category).toUpperCase();

    if (category === 'BEER CAN' || category === 'DRAFT 10OZ' || category === 'DRAFT REG PINT' || category === 'DRAFT IMP PINT') {
      const name = keyName(record.item_name) || clean(record.item_name).toLowerCase();
      if (!beer.has(name)) {
        beer.set(name, {
          item_name: clean(record.item_name),
          draft_10oz_price: '',
          draft_16oz_price: '',
          can_price: '',
          obsolete_20oz_price: '',
        });
      }
      const row = beer.get(name);
      if (category === 'BEER CAN') row.can_price = price(record.price);
      else if (category === 'DRAFT 10OZ') row.draft_10oz_price = price(record.price);
      else if (category === 'DRAFT REG PINT') row.draft_16oz_price = price(record.price);
      else row.obsolete_20oz_price = price(record.price);
      continue;
    }

    liquor.push({
      item_name: clean(record.item_name),
      base_price: price(record.price),
      liquor_type: category,
    });
  }

  return { beer: [...beer.values()], liquor };
}

module.exports = { buildBeverageRows, keyName };

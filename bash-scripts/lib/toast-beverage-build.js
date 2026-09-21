'use strict';

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

const OMIT_BEERS = new Set([
  'domestic can', 'import can', 'tall', '$5 can', 'malibu boo', 'pb & j',
  'the setup', 'cc 1.00', 'sierra pale', 'stiegl radler', 'fig. mtn. agua santa',
  'sierra torpedo', 'blue moon', 'c-', 'banquet', 'bd', 'bd lite', 'm lite',
  'h life', 'tec', 'bavic pilsner', 'ashland seltzer', 'ashland 16',
  'jameson can', 'draft', 'dba', 'weinstephan', 'stone', 'rogue',
  'liquid gravity', 'fig mtn davy brown', 'pizza port', 'alesmith',
  'maui brewing', 'voodoo ranger', 'lg dope melody', 'wandering don',
  'weihenstephan', "killian's", 'tap it', 'weihensteph', 'new beer', 'tdne', 'silva',
]);

const BEER_ALIASES = new Map(Object.entries({
  'russ rv happy hops': 'russ rvr happy hops',
  'russ rvr happy hops': 'russ rvr happy hops',
  'russ rvr blind pig': 'russ rvr blind pig',
  'rr pliny the elder': 'pliny the elder',
  'r r pliny the elder': 'pliny the elder',
  'rr pliney the elder': 'pliny the elder',
  'r r pliney the elder': 'pliny the elder',
  'pliny the elder': 'pliny the elder',
  'fig mtn davy brown': 'davy brown',
  'fig mtn davy brwn': 'davy brown',
  'fig mtn davy brown': 'davy brown',
  'davy brown': 'davy brown',
  'davy brwn': 'davy brown',
  'liquid gravity': 'liquid gravity',
  'liquid gravity ipa': 'liquid gravity',
  'cali squeze': 'cali squeeze',
  'cali squeeze': 'cali squeeze',
  'coors original': 'coors original',
  'coors og': 'coors original',
  'sierra': 'sierra nevada hazy ipa',
  'weinstephan': 'weihenstephan',
  'weihensteph': 'weihenstephan',
}));

function strippedName(value) {
  return clean(value)
    .replace(/\btall\b/gi, '')
    .replace(/\b10\s*oz\.?\b/gi, '')
    .replace(/\b16\s*oz\.?\b/gi, '')
    .replace(/\bregular\s+pint\b/gi, '')
    .replace(/\breg\s+pint\b/gi, '')
    .replace(/\bpintr?\s+pint\b/gi, '')
    .replace(/\bpint\b/gi, '')
    .replace(/\bimperial\b/gi, '')
    .replace(/\bimp\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function keyName(value) {
  const normalized = strippedName(value)
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return BEER_ALIASES.get(normalized) || normalized;
}

function titleBeerName(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bIpa\b/g, 'IPA')
    .replace(/\bNa\b/g, 'NA');
}

function displayName(value) {
  const name = strippedName(value);
  const rawKey = name.toLowerCase().replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim();
  if (BEER_ALIASES.has(rawKey)) return titleBeerName(keyName(value));
  return name || clean(value);
}

function happyHourPrice(value) {
  const amount = Number.parseFloat(clean(value));
  if (!Number.isFinite(amount)) return '';
  return Math.max(0, amount - 1).toFixed(2);
}

function price(value) {
  const text = clean(value);
  return /^ask$/i.test(text) ? '' : text;
}

const LIQUOR_TYPE_OVERRIDES = new Map([
  ['titos', 'VODKA'],
  ["tito's", 'VODKA'],
  ['flor de cana', 'RUM'],
  ['bombay east', 'GIN'],
  ['tangueray', 'GIN'],
]);

const WELL_LIQUOR_NAMES = new Set([
  'bourbon well', 'gin well', 'rum well', 'scotch well', 'tequila well', 'vodka well',
]);

function buildBeverageRows(records) {
  const beer = new Map();
  const liquor = new Map();

  for (const record of records) {
    const category = clean(record.category).toUpperCase();

    if (category === 'BEER CAN' || category === 'DRAFT 10OZ' || category === 'DRAFT REG PINT' || category === 'DRAFT IMP PINT') {
      const name = keyName(record.item_name) || clean(record.item_name).toLowerCase();
      if (!beer.has(name)) {
        beer.set(name, {
          item_name: displayName(record.item_name),
          draft_10oz_price: '',
          draft_16oz_price: '',
          can_12oz_price: '',
          can_24oz_price: '',
          obsolete_20oz_price: '',
          draft_10oz_happy_hour: '',
          draft_16oz_happy_hour: '',
          can_12oz_happy_hour: '',
          can_24oz_happy_hour: '',
        });
      }
      const row = beer.get(name);
      // Prefer the current 16 oz name as the canonical display name, then 10 oz.
      if (category === 'DRAFT REG PINT') row.item_name = displayName(record.item_name);
      else if (category === 'DRAFT 10OZ' && !row.draft_16oz_price) row.item_name = displayName(record.item_name);

      // Canonicalize display names for known cross-size aliases too.
      const rawKey = strippedName(record.item_name).toLowerCase().replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim();
      if (BEER_ALIASES.has(rawKey)) row.item_name = titleBeerName(keyName(record.item_name));

      if (category === 'BEER CAN') {
        if (/\btall\b/i.test(clean(record.item_name))) {
          row.can_24oz_price = price(record.price);
          row.can_24oz_happy_hour = happyHourPrice(record.price);
        } else {
          row.can_12oz_price = price(record.price);
          row.can_12oz_happy_hour = happyHourPrice(record.price);
        }
      }
      else if (category === 'DRAFT 10OZ') {
        row.draft_10oz_price = price(record.price);
        row.draft_10oz_happy_hour = happyHourPrice(record.price);
      }
      else if (category === 'DRAFT REG PINT') {
        row.draft_16oz_price = price(record.price);
        row.draft_16oz_happy_hour = happyHourPrice(record.price);
      }
      else row.obsolete_20oz_price = price(record.price);
      continue;
    }

    const liquorName = clean(record.item_name);
    const sourceLiquorType = category === 'BOURB WHISK' ? 'WHISKEY/BOURBON' : category;
    const liquorType = LIQUOR_TYPE_OVERRIDES.get(liquorName.toLowerCase()) || sourceLiquorType;
    const liquorKey = `${liquorType}\u0000${liquorName.toLowerCase()}`;
    const candidate = {
      item_name: liquorName,
      base_price: price(record.price),
      happy_hour_price: WELL_LIQUOR_NAMES.has(liquorName.toLowerCase()) ? happyHourPrice(record.price) : '',
      liquor_type: liquorType,
    };
    const existing = liquor.get(liquorKey);
    // When the same reconciled liquor appears more than once, retain one Toast
    // item. Prefer the higher regular price so an old discounted/source variant
    // cannot become the imported base price.
    if (!existing || Number.parseFloat(candidate.base_price) > Number.parseFloat(existing.base_price)) {
      liquor.set(liquorKey, candidate);
    }
  }

  const keptBeer = [...beer.values()].filter((row) => {
    const raw = clean(row.item_name).toLowerCase();
    const key = keyName(row.item_name);
    return !OMIT_BEERS.has(raw) && !OMIT_BEERS.has(key);
  });

  return { beer: keptBeer, liquor: [...liquor.values()] };
}

module.exports = { buildBeverageRows, displayName, happyHourPrice, keyName, titleBeerName, WELL_LIQUOR_NAMES, LIQUOR_TYPE_OVERRIDES };

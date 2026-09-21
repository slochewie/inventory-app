'use strict';

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonical(value) {
  return clean(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const aliases = {
  item_name: ['item_name', 'name', 'menu_item_name', 'item', 'display_name'],
  price: ['price', 'base_price', 'menu_price', 'item_price'],
  category: ['category', 'sales_category', 'menu_group', 'group'],
  plu: ['plu', 'sku', 'item_id', 'item_number', 'external_id'],
};

function sourceFieldForTemplateHeader(header, config = {}) {
  const explicit = config.columns || {};
  if (explicit[header]) return explicit[header];

  const key = canonical(header);
  for (const [sourceField, candidates] of Object.entries(aliases)) {
    if (candidates.includes(key)) return sourceField;
  }
  return '';
}

function mapToTemplate(record, templateHeaders, config = {}) {
  const defaults = config.defaults || {};
  const output = {};

  for (const header of templateHeaders) {
    const sourceField = sourceFieldForTemplateHeader(header, config);
    if (sourceField) output[header] = clean(record[sourceField]);
    else if (Object.prototype.hasOwnProperty.call(defaults, header)) output[header] = clean(defaults[header]);
    else output[header] = '';
  }

  return output;
}

function mapRecordsToTemplate(records, templateHeaders, config = {}) {
  return records.map((record) => mapToTemplate(record, templateHeaders, config));
}

module.exports = {
  canonical,
  mapRecordsToTemplate,
  mapToTemplate,
  sourceFieldForTemplateHeader,
};

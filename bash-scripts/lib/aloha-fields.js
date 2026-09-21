'use strict';

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function first(record, fields) {
  for (const field of fields) {
    const value = clean(record[field]);
    if (value) return value;
  }
  return '';
}

function resolveField(record, configured, fallbacks = []) {
  if (configured) return clean(record[configured]);
  return first(record, fallbacks);
}

function mapRecord(record, config = {}) {
  const fields = config.fields || {};

  return {
    source_row_number: clean(record.source_row_number),
    item_name: resolveField(record, fields.itemName, [
      'toast_candidate_name',
      'item_name',
      'menu_item',
      'description',
      'name',
      'button_text',
      'long_name',
      'short_name',
    ]),
    price: resolveField(record, fields.price, [
      'toast_candidate_price',
      'price',
      'regular_price',
      'base_price',
      'amount',
    ]),
    category: resolveField(record, fields.category, [
      'toast_candidate_category',
      'sales_category',
      'category',
      'menu_group',
      'department',
    ]),
    plu: resolveField(record, fields.plu, [
      'plu',
      'item_id',
      'item_number',
      'number',
      'sku',
    ]),
    effective_time: clean(record.effective_time),
    pricing_program_classification: clean(record.pricing_program_classification),
    pricing_program_confidence: clean(record.pricing_program_confidence),
    pricing_program_reason: clean(record.pricing_program_reason),
    pricing_program_matching_rows: clean(record.pricing_program_matching_rows),
  };
}

function mapRecords(records, config = {}) {
  return records.map((record) => mapRecord(record, config));
}

module.exports = {
  mapRecord,
  mapRecords,
};

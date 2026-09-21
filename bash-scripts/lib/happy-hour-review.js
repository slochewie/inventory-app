'use strict';

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function reviewRows(records) {
  return records
    .map((record) => {
      const classification = clean(record.pricing_program_classification);
      if (!['possible_happy_hour', 'explicit_happy_hour'].includes(classification)) return null;

      return {
        source_row_number: clean(record.source_row_number),
        item_name: clean(record.item_name),
        alternate_price: clean(record.price),
        classification,
        confidence: clean(record.pricing_program_confidence),
        reason: clean(record.pricing_program_reason),
        matching_regular_source_rows: clean(record.pricing_program_matching_rows),
        review_status: '',
        confirmed_program_name: '',
        confirmed_start_time: '',
        confirmed_end_time: '',
        reviewer_notes: '',
      };
    })
    .filter(Boolean);
}

module.exports = { reviewRows };

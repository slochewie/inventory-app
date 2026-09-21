'use strict';

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function toMenuBuildRow(record, config) {
  const columns = config.menuBuild.columns;
  const width = Math.max(
    columns.itemName,
    columns.basePrice,
    columns.description,
    columns.menuGroupName,
    ...(columns.modifierGroups || [])
  );
  const row = Array(width).fill('');

  row[columns.itemName - 1] = clean(record.item_name);
  row[columns.basePrice - 1] = clean(record.price);
  row[columns.description - 1] = clean(record.description);
  row[columns.menuGroupName - 1] = clean(record.category);

  const modifiers = Array.isArray(record.modifier_groups)
    ? record.modifier_groups
    : clean(record.modifier_groups).split('|').map(clean).filter(Boolean);

  (columns.modifierGroups || []).forEach((column, index) => {
    row[column - 1] = modifiers[index] || '';
  });

  return row;
}

function toMenuBuildRows(records, config) {
  return records.map((record) => toMenuBuildRow(record, config));
}

module.exports = { toMenuBuildRow, toMenuBuildRows };

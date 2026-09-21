'use strict';

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

const DEFAULT_RULES = {
  // Only these Aloha sections contain menu data needed for this migration.
  includedGroups: [
    'BOURB WHISK',
    'BEER CAN',
    'DRAFT REG PINT',
    'DRAFT 10OZ',
    'DRAFT IMP PINT',
    'LIQUEURS',
    'TEQUILA',
    'SCOTCH',
    'VODKA',
    'RUM',
    'GIN',
    'WINE GLASS',
  ],
  renamedGroups: {
    'BOURB WHISK': 'WHISKEY/BOURBON',
  },
  // Keep Imperial Pint rows in the source scope for beer reconciliation, but
  // do not emit the obsolete 20 oz serving format into Toast Menu Build.
  obsoleteGroups: ['DRAFT IMP PINT'],
};

function normalizeGroup(value) {
  return clean(value).toUpperCase();
}

function applyMigrationRules(records, rules = DEFAULT_RULES) {
  const included = new Set((rules.includedGroups || []).map(normalizeGroup));
  const obsolete = new Set((rules.obsoleteGroups || []).map(normalizeGroup));
  const renamed = new Map(
    Object.entries(rules.renamedGroups || {}).map(([from, to]) => [normalizeGroup(from), clean(to)])
  );

  const kept = [];
  const held = [];
  let renamedCount = 0;

  for (const record of records) {
    const group = normalizeGroup(record.category);

    if (included.size && !included.has(group)) {
      held.push({ ...record, migration_action: 'out_of_scope', migration_reason: 'group is outside the selected Aloha migration scope' });
      continue;
    }

    if (obsolete.has(group)) {
      held.push({ ...record, migration_action: 'obsolete', migration_reason: 'obsolete serving format; do not migrate as a separate Toast item' });
      continue;
    }

    const target = renamed.get(group);
    if (target) {
      kept.push({ ...record, category: target });
      renamedCount += 1;
    } else {
      kept.push(record);
    }
  }

  return { kept, held, renamedCount };
}

module.exports = { DEFAULT_RULES, applyMigrationRules };

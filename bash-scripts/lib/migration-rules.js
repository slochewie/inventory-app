'use strict';

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

const DEFAULT_RULES = {
  excludedGroups: ['COCKTAILS'],
  renamedGroups: {
    'BOURBON/WHISKEY': 'WHISKEY/BOURBON',
  },
  obsoleteGroups: ['DRAFT IMPERIAL PINT'],
};

function normalizeGroup(value) {
  return clean(value).toUpperCase();
}

function applyMigrationRules(records, rules = DEFAULT_RULES) {
  const excluded = new Set((rules.excludedGroups || []).map(normalizeGroup));
  const obsolete = new Set((rules.obsoleteGroups || []).map(normalizeGroup));
  const renamed = new Map(
    Object.entries(rules.renamedGroups || {}).map(([from, to]) => [normalizeGroup(from), clean(to)])
  );

  const kept = [];
  const held = [];
  let renamedCount = 0;

  for (const record of records) {
    const group = normalizeGroup(record.category);

    if (excluded.has(group)) {
      held.push({ ...record, migration_action: 'excluded', migration_reason: 'group excluded from Toast migration' });
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

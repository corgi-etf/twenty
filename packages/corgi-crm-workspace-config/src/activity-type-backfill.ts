import { QUICK_LOG_ACTIVITY_TYPE_SELECT_FIELD_DEFINITION } from './planner.ts';

export type OutreachActivityRow = {
  id: string;
  activityType?: string | null;
  activityTypeOption?: string | null;
  updatedAt: string;
  occurredAt?: string | null;
  wholesalerId?: string | null;
  createdBy?: { source?: string | null } | null;
};

export type ActivityTypeBackfillMutation = {
  id: string;
  expectedUpdatedAt: string;
  data: { activityTypeOption: string };
};

export type ActivityTypeInventoryEntry = {
  normalizedValue: string;
  count: number;
  disposition: 'canonical' | 'approved' | 'unresolved';
};

export type ActivityTypeBackfillPlan = {
  mutations: ActivityTypeBackfillMutation[];
  inventory: ActivityTypeInventoryEntry[];
  unresolved: Array<{ code: string; rowKey: string }>;
  summary: {
    rows: number;
    emptyRows: number;
    alreadyBackfilledRows: number;
    mutations: number;
    distinctValues: number;
  };
};

const OPTION_VALUE_BY_SLUG = new Map(
  QUICK_LOG_ACTIVITY_TYPE_SELECT_FIELD_DEFINITION.options.map(({ value }) => [
    value.toLowerCase(),
    value,
  ]),
);

export const normalizeActivityTypeValue = (
  value: string | null | undefined,
): string => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// The approved mapping is a human decision from a dry-run inventory, not a
// guess made here. An unlisted value blocks the apply rather than collapsing
// into 'other', which would destroy what the row actually said.
export const buildActivityTypeBackfillPlan = ({
  rows,
  approvedMapping = {},
}: {
  rows: readonly OutreachActivityRow[];
  approvedMapping?: Readonly<Record<string, string>>;
}): ActivityTypeBackfillPlan => {
  const seenRowIds = new Set<string>();
  const counts = new Map<string, ActivityTypeInventoryEntry>();
  const mutations: ActivityTypeBackfillMutation[] = [];
  const unresolved: Array<{ code: string; rowKey: string }> = [];
  let emptyRows = 0;
  let alreadyBackfilledRows = 0;

  for (const [normalizedKey, target] of Object.entries(approvedMapping)) {
    if (normalizedKey !== normalizeActivityTypeValue(normalizedKey)) {
      throw new Error(
        `Approved activity type mapping key ${normalizedKey} is not normalized`,
      );
    }
    if (!OPTION_VALUE_BY_SLUG.has(target.toLowerCase())) {
      throw new Error(
        `Approved activity type mapping targets ${target}, which is not a dropdown option`,
      );
    }
  }

  for (const row of rows) {
    if (seenRowIds.has(row.id)) {
      throw new Error(`Outreach activity ${row.id} appears twice in the plan`);
    }
    seenRowIds.add(row.id);

    // Never overwrite a dropdown value that is already set; a differing text
    // value beside it is a conflict for a human, not something to silently win.
    if (normalizeActivityTypeValue(row.activityTypeOption)) {
      alreadyBackfilledRows += 1;
      continue;
    }

    const normalized = normalizeActivityTypeValue(row.activityType);
    if (!normalized) {
      emptyRows += 1;
      continue;
    }

    const canonical = OPTION_VALUE_BY_SLUG.get(normalized);
    const approved = canonical
      ? undefined
      : OPTION_VALUE_BY_SLUG.get(
          (approvedMapping[normalized] ?? '').toLowerCase(),
        );
    const optionValue = canonical ?? approved;

    const entry = counts.get(normalized) ?? {
      normalizedValue: normalized,
      count: 0,
      disposition: canonical
        ? ('canonical' as const)
        : approved
          ? ('approved' as const)
          : ('unresolved' as const),
    };
    entry.count += 1;
    counts.set(normalized, entry);

    if (!optionValue) {
      unresolved.push({ code: 'ACTIVITY_TYPE_UNMAPPED', rowKey: row.id });
      continue;
    }

    mutations.push({
      id: row.id,
      expectedUpdatedAt: row.updatedAt,
      data: { activityTypeOption: optionValue },
    });
  }

  mutations.sort((left, right) => left.id.localeCompare(right.id));
  unresolved.sort((left, right) => left.rowKey.localeCompare(right.rowKey));

  return {
    mutations,
    inventory: [...counts.values()].sort(
      (left, right) =>
        right.count - left.count ||
        left.normalizedValue.localeCompare(right.normalizedValue),
    ),
    unresolved,
    summary: {
      rows: rows.length,
      emptyRows,
      alreadyBackfilledRows,
      mutations: mutations.length,
      distinctValues: counts.size,
    },
  };
};

export const assertActivityTypeBackfillCanApply = (
  plan: ActivityTypeBackfillPlan,
): void => {
  if (plan.unresolved.length > 0) {
    const unmappedValues = plan.inventory
      .filter(({ disposition }) => disposition === 'unresolved')
      .map(({ count }) => count)
      .reduce((total, count) => total + count, 0);

    throw new Error(
      `Activity type backfill has ${plan.unresolved.length} unresolved rows across ${unmappedValues} unmapped values`,
    );
  }
};

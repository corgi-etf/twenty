import { createHash } from 'node:crypto';

import {
  assertActivityTypeBackfillCanApply,
  buildActivityTypeBackfillPlan,
  type ActivityTypeBackfillPlan,
  type OutreachActivityRow,
} from './activity-type-backfill.ts';
import {
  summarizeOutreachRowShape,
  type OutreachRowShape,
} from './outreach-row-shape.ts';

export const APPLY_ACTIVITY_TYPE_BACKFILL_CONFIRMATION =
  'BACKFILL_CRM_ACTIVITY_TYPE';

const APPROVED_ORIGIN = 'https://crm.corgiinvest.com';

// A dry run is handed an api with no write method at all, so it cannot write
// even if a future edit forgets a guard. Only the execute path asks for the
// wider type, and only the write adapter can satisfy it.
export type ActivityTypeBackfillReadApi = {
  listOutreachActivities(): Promise<OutreachActivityRow[]>;
  readCheckpoint(): Promise<unknown>;
  writeCheckpoint(value: ActivityTypeBackfillCheckpoint): Promise<void>;
};

export type ActivityTypeBackfillApi = ActivityTypeBackfillReadApi & {
  conditionalPatchOutreachActivity(
    id: string,
    expectedUpdatedAt: string,
    data: { activityTypeOption: string },
  ): Promise<void>;
};

export type ActivityTypeBackfillCheckpoint = {
  schemaVersion: 1;
  origin: string;
  planHash: string;
  appliedIds: string[];
};

export type ActivityTypeBackfillOptions = {
  origin: string;
  expectedOrigin: string;
  approvedMapping?: Readonly<Record<string, string>>;
  execute?: boolean;
  confirmation?: string;
  expectedPlanHash?: string;
};

export type ActivityTypeBackfillResult = {
  mode: 'dry-run' | 'execute';
  planHash: string;
  inventory: ActivityTypeBackfillPlan['inventory'];
  unresolved: ActivityTypeBackfillPlan['unresolved'];
  summary: ActivityTypeBackfillPlan['summary'];
  rowShape: OutreachRowShape;
  appliedMutations: number;
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

export const activityTypeBackfillPlanHash = (
  plan: ActivityTypeBackfillPlan,
): string =>
  createHash('sha256')
    .update(
      stableStringify({
        schemaVersion: 1,
        mutations: plan.mutations,
        inventory: plan.inventory,
      }),
      'utf8',
    )
    .digest('hex');

const assertOrigin = (options: ActivityTypeBackfillOptions): void => {
  let origin = '';
  let expectedOrigin = '';
  try {
    origin = new URL(options.origin).origin;
    expectedOrigin = new URL(options.expectedOrigin).origin;
  } catch {
    throw new Error('Activity type backfill origin is invalid');
  }
  if (
    options.origin !== origin ||
    options.expectedOrigin !== expectedOrigin ||
    origin !== expectedOrigin ||
    origin !== APPROVED_ORIGIN
  ) {
    throw new Error('Activity type backfill origin is not approved');
  }
};

// A checkpoint only exists because a previous execute run stopped partway. It
// records ids already written, which this run cannot re-derive safely, so the
// run aborts for a human rather than guessing where it left off.
const assertNoPriorCheckpoint = async (
  api: ActivityTypeBackfillReadApi,
): Promise<void> => {
  const existing = await api.readCheckpoint();
  if (existing !== undefined && existing !== null) {
    throw new Error(
      'Activity type backfill found a prior checkpoint; resolve it before running again',
    );
  }
};

export const runActivityTypeBackfillDryRun = async (
  api: ActivityTypeBackfillReadApi,
  options: Omit<
    ActivityTypeBackfillOptions,
    'execute' | 'confirmation' | 'expectedPlanHash'
  >,
): Promise<ActivityTypeBackfillResult> => {
  assertOrigin(options);

  const rows = await api.listOutreachActivities();
  const plan = buildActivityTypeBackfillPlan({
    rows,
    approvedMapping: options.approvedMapping,
  });

  return {
    mode: 'dry-run',
    planHash: activityTypeBackfillPlanHash(plan),
    inventory: plan.inventory,
    unresolved: plan.unresolved,
    summary: plan.summary,
    rowShape: summarizeOutreachRowShape(rows),
    appliedMutations: 0,
  };
};

export const runActivityTypeBackfill = async (
  api: ActivityTypeBackfillApi,
  options: ActivityTypeBackfillOptions,
): Promise<ActivityTypeBackfillResult> => {
  assertOrigin(options);

  if (options.execute !== true) return runActivityTypeBackfillDryRun(api, options);
  if (options.confirmation !== APPLY_ACTIVITY_TYPE_BACKFILL_CONFIRMATION) {
    throw new Error(
      'Activity type backfill apply requires the exact confirmation',
    );
  }
  if (!options.expectedPlanHash) {
    throw new Error(
      'Activity type backfill apply requires the trusted dry-run plan hash',
    );
  }
  await assertNoPriorCheckpoint(api);

  const rows = await api.listOutreachActivities();
  const plan = buildActivityTypeBackfillPlan({
    rows,
    approvedMapping: options.approvedMapping,
  });
  const planHash = activityTypeBackfillPlanHash(plan);

  if (planHash !== options.expectedPlanHash) {
    throw new Error(
      'Activity type backfill plan changed since the approved dry run',
    );
  }
  assertActivityTypeBackfillCanApply(plan);

  const appliedIds: string[] = [];
  for (const mutation of plan.mutations) {
    await api.conditionalPatchOutreachActivity(
      mutation.id,
      mutation.expectedUpdatedAt,
      mutation.data,
    );
    appliedIds.push(mutation.id);
    await api.writeCheckpoint({
      schemaVersion: 1,
      origin: options.origin,
      planHash,
      appliedIds: [...appliedIds],
    });
  }

  return {
    mode: 'execute',
    planHash,
    inventory: plan.inventory,
    unresolved: plan.unresolved,
    summary: plan.summary,
    rowShape: summarizeOutreachRowShape(rows),
    appliedMutations: appliedIds.length,
  };
};

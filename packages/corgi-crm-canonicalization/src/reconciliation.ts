import { createHash } from 'node:crypto';

import {
  buildCanonicalizationPlan,
  type CanonicalizationSnapshot,
} from './planner.ts';
import {
  canonicalContentKey,
  canonicalRowKey,
  stableStringify,
} from './normalization.ts';

export type ReconciliationReport = {
  stagingRows: number;
  distinctBusinessRows: number;
  duplicateRows: number;
  coveredRows: number;
  holdingRecords: number;
  personTaskTargets: number;
  wholesalerTasks: number;
  linkedOutreachActivities: number;
  verifiedArchivedActivities: number;
  remainingMutations: number;
  remainingMutationsByObject: Record<string, number>;
  unresolvedByCode: Record<string, number>;
  rowCoverageHash: string;
  businessContentHash: string;
};

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const countBy = (values: readonly string[]): Record<string, number> =>
  Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [
        value,
        values.filter((candidate) => candidate === value).length,
      ]),
  );

export const buildReconciliationReport = (
  snapshot: CanonicalizationSnapshot,
): ReconciliationReport => {
  const plan = buildCanonicalizationPlan(snapshot);
  const staging = [...snapshot.sourceRecords, ...snapshot.importReviewItems];
  const rowKeys = staging
    .map((record) =>
      canonicalRowKey({
        sourceFile: record.sourceFile,
        sourceSheet: record.sourceSheet,
        sourceRow: record.sourceRow,
        rawData: record.rawData,
      }),
    )
    .sort();
  const contentKeys = staging
    .map((record) => canonicalContentKey(record.rawData))
    .sort();
  const unresolvedByCode = countBy(plan.unresolved.map(({ code }) => code));
  const remainingMutationsByObject = countBy(
    plan.mutations.map(({ objectPlural }) => objectPlural),
  );
  const unresolvedRows = new Set(plan.unresolved.map(({ rowKey }) => rowKey));
  const archivedFailures = plan.unresolved.filter(
    ({ code }) => code === 'ARCHIVED_ACTIVITY_NOT_CLONE',
  ).length;

  return {
    stagingRows: staging.length,
    distinctBusinessRows: new Set(contentKeys).size,
    duplicateRows: staging.length - new Set(contentKeys).size,
    coveredRows: rowKeys.filter((rowKey) => !unresolvedRows.has(rowKey)).length,
    holdingRecords: snapshot.holdingObservations.length,
    personTaskTargets: snapshot.taskTargets.filter(
      ({ targetPersonId }) =>
        typeof targetPersonId === 'string' && !!targetPersonId,
    ).length,
    wholesalerTasks: snapshot.tasks.filter(
      ({ wholesalerId }) => typeof wholesalerId === 'string' && !!wholesalerId,
    ).length,
    linkedOutreachActivities: snapshot.outreachActivities.filter(
      ({ followUpTaskId }) =>
        typeof followUpTaskId === 'string' && !!followUpTaskId,
    ).length,
    verifiedArchivedActivities:
      snapshot.archivedOutreachActivities.length - archivedFailures,
    remainingMutations: plan.mutations.length,
    remainingMutationsByObject,
    unresolvedByCode,
    rowCoverageHash: sha256(stableStringify(rowKeys)),
    businessContentHash: sha256(stableStringify(contentKeys)),
  };
};

export const assertCanonicalizationComplete = (
  snapshot: CanonicalizationSnapshot,
): ReconciliationReport => {
  const report = buildReconciliationReport(snapshot);
  const unresolvedCount = Object.values(report.unresolvedByCode).reduce(
    (total, count) => total + count,
    0,
  );

  if (
    unresolvedCount > 0 ||
    report.remainingMutations > 0 ||
    report.coveredRows !== report.stagingRows ||
    report.verifiedArchivedActivities !==
      snapshot.archivedOutreachActivities.length
  ) {
    throw new Error(
      `CRM canonicalization is incomplete: staging=${report.stagingRows}, covered=${report.coveredRows}, remainingMutations=${report.remainingMutations}, unresolved=${unresolvedCount}, archivedVerified=${report.verifiedArchivedActivities}`,
    );
  }

  return report;
};

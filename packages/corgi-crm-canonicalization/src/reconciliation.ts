import { createHash } from 'node:crypto';

import {
  buildCanonicalizationPlan,
  type CanonicalizationSnapshot,
} from './planner.ts';
import {
  canonicalContentKey,
  canonicalRowKey,
  normalizeKey,
  parseRawData,
  stableStringify,
  textValue,
} from './normalization.ts';

export type ReconciliationReport = {
  sourceRecordRows: number;
  reviewItemRows: number;
  holdingRawRows: number;
  stagingRows: number;
  distinctBusinessRows: number;
  duplicateRows: number;
  coveredRows: number;
  holdingRecords: number;
  personTaskTargets: number;
  wholesalerTasks: number;
  linkedOutreachActivities: number;
  verifiedArchivedActivities: number;
  nonemptyRawValues: number;
  disposedRawValues: number;
  dispositionsByKind: Record<string, number>;
  dispositionHash: string;
  expectedTaskCompanies: number;
  matchedTaskCompanies: number;
  expectedTaskPeople: number;
  matchedTaskPeople: number;
  expectedTaskWholesalers: number;
  matchedTaskWholesalers: number;
  expectedOutreachTasks: number;
  matchedOutreachTasks: number;
  expectedOutreachDates: number;
  matchedOutreachDates: number;
  remainingMutations: number;
  remainingMutationsByObject: Record<string, number>;
  unresolvedByCode: Record<string, number>;
  rowCoverageHash: string;
  businessContentHash: string;
};

export type ReconciliationManifest = Pick<
  ReconciliationReport,
  | 'stagingRows'
  | 'sourceRecordRows'
  | 'reviewItemRows'
  | 'holdingRawRows'
  | 'distinctBusinessRows'
  | 'duplicateRows'
  | 'nonemptyRawValues'
  | 'disposedRawValues'
  | 'dispositionsByKind'
  | 'rowCoverageHash'
  | 'businessContentHash'
  | 'dispositionHash'
>;

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

const uniqueIdByPreviousId = (records: readonly Record<string, unknown>[]) => {
  const grouped = new Map<string, Set<string>>();
  for (const record of records) {
    if (
      typeof record.id !== 'string' ||
      typeof record.legacyFetchId !== 'string'
    ) {
      continue;
    }
    grouped.set(
      record.legacyFetchId,
      new Set([...(grouped.get(record.legacyFetchId) ?? []), record.id]),
    );
  }

  return new Map(
    [...grouped]
      .filter(([, ids]) => ids.size === 1)
      .map(([previousId, ids]) => [previousId, [...ids][0]!]),
  );
};

const normalizedNonemptyValueCount = (
  records: readonly Record<string, unknown>[],
): number =>
  records.reduce((total, record) => {
    const normalized = new Map<string, unknown>();
    for (const [key, value] of Object.entries(parseRawData(record.rawData))) {
      if (textValue(value)) normalized.set(normalizeKey(key), value);
    }

    return total + normalized.size;
  }, 0);

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
  const holdingRawRecords = snapshot.holdingObservations.filter((record) =>
    Boolean(textValue(record.rawData)),
  );
  const holdingContentKeys = holdingRawRecords
    .map((record) =>
      stableStringify({
        companyId: record.companyId ?? null,
        productName: record.productName ?? null,
        contentKey: canonicalContentKey(record.rawData),
      }),
    )
    .sort();
  const unresolvedByCode = countBy(plan.unresolved.map(({ code }) => code));
  const remainingMutationsByObject = countBy(
    plan.mutations.map(({ objectPlural }) => objectPlural),
  );
  const unresolvedRows = new Set(plan.unresolved.map(({ rowKey }) => rowKey));
  const archivedFailures = plan.unresolved.filter(
    ({ code }) => code === 'ARCHIVED_ACTIVITY_NOT_CLONE',
  ).length;
  const nonemptyRawValues =
    normalizedNonemptyValueCount(staging) +
    normalizedNonemptyValueCount(holdingRawRecords);
  const dispositionsByKind = countBy(plan.dispositions.map(({ kind }) => kind));
  const personIdByPreviousId = uniqueIdByPreviousId(snapshot.people);
  const companyIdByPreviousId = uniqueIdByPreviousId(snapshot.companies);
  const wholesalerIdByPreviousId = uniqueIdByPreviousId(snapshot.wholesalers);
  const taskIdByPreviousId = uniqueIdByPreviousId(snapshot.tasks);
  const taskTargetKeys = new Set(
    snapshot.taskTargets.flatMap((target) => [
      typeof target.targetCompanyId === 'string'
        ? `${target.taskId}\0company\0${target.targetCompanyId}`
        : '',
      typeof target.targetPersonId === 'string'
        ? `${target.taskId}\0person\0${target.targetPersonId}`
        : '',
    ]),
  );
  let expectedTaskCompanies = 0;
  let matchedTaskCompanies = 0;
  let expectedTaskPeople = 0;
  let matchedTaskPeople = 0;
  let expectedTaskWholesalers = 0;
  let matchedTaskWholesalers = 0;
  for (const task of snapshot.tasks) {
    if (typeof task.legacyCompanyId === 'string' && task.legacyCompanyId) {
      expectedTaskCompanies += 1;
      const companyId = companyIdByPreviousId.get(task.legacyCompanyId);
      if (
        companyId &&
        taskTargetKeys.has(`${task.id}\0company\0${companyId}`)
      ) {
        matchedTaskCompanies += 1;
      }
    }
    if (typeof task.legacyContactId === 'string' && task.legacyContactId) {
      expectedTaskPeople += 1;
      const personId = personIdByPreviousId.get(task.legacyContactId);
      if (personId && taskTargetKeys.has(`${task.id}\0person\0${personId}`)) {
        matchedTaskPeople += 1;
      }
    }
    if (
      typeof task.legacyWholesalerId === 'string' &&
      task.legacyWholesalerId
    ) {
      expectedTaskWholesalers += 1;
      if (
        task.wholesalerId ===
        wholesalerIdByPreviousId.get(task.legacyWholesalerId)
      ) {
        matchedTaskWholesalers += 1;
      }
    }
  }
  let expectedOutreachTasks = 0;
  let matchedOutreachTasks = 0;
  let expectedOutreachDates = 0;
  let matchedOutreachDates = 0;
  for (const activity of snapshot.outreachActivities) {
    if (!activity.fetchMetadata) continue;
    const metadata = parseRawData(activity.fetchMetadata);
    if (typeof metadata.followUpId === 'string' && metadata.followUpId) {
      expectedOutreachTasks += 1;
      if (
        activity.followUpTaskId === taskIdByPreviousId.get(metadata.followUpId)
      ) {
        matchedOutreachTasks += 1;
      }
    }
    if (typeof metadata.followUpDate === 'string' && metadata.followUpDate) {
      expectedOutreachDates += 1;
      if (activity.followUpDate === metadata.followUpDate.slice(0, 10)) {
        matchedOutreachDates += 1;
      }
    }
  }

  return {
    sourceRecordRows: snapshot.sourceRecords.length,
    reviewItemRows: snapshot.importReviewItems.length,
    holdingRawRows: holdingRawRecords.length,
    stagingRows: staging.length,
    distinctBusinessRows: plan.summary.semanticRows,
    duplicateRows: plan.summary.duplicateRows,
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
    nonemptyRawValues,
    disposedRawValues: plan.dispositions.length,
    dispositionsByKind,
    dispositionHash: sha256(stableStringify(plan.dispositions)),
    expectedTaskCompanies,
    matchedTaskCompanies,
    expectedTaskPeople,
    matchedTaskPeople,
    expectedTaskWholesalers,
    matchedTaskWholesalers,
    expectedOutreachTasks,
    matchedOutreachTasks,
    expectedOutreachDates,
    matchedOutreachDates,
    remainingMutations: plan.mutations.length,
    remainingMutationsByObject,
    unresolvedByCode,
    rowCoverageHash: sha256(stableStringify(rowKeys)),
    businessContentHash: sha256(
      stableStringify({ staging: contentKeys, holdings: holdingContentKeys }),
    ),
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
    report.disposedRawValues !== report.nonemptyRawValues ||
    report.matchedTaskCompanies !== report.expectedTaskCompanies ||
    report.matchedTaskPeople !== report.expectedTaskPeople ||
    report.matchedTaskWholesalers !== report.expectedTaskWholesalers ||
    report.matchedOutreachTasks !== report.expectedOutreachTasks ||
    report.matchedOutreachDates !== report.expectedOutreachDates ||
    report.verifiedArchivedActivities !==
      snapshot.archivedOutreachActivities.length
  ) {
    throw new Error(
      `CRM canonicalization is incomplete: staging=${report.stagingRows}, covered=${report.coveredRows}, remainingMutations=${report.remainingMutations}, unresolved=${unresolvedCount}, archivedVerified=${report.verifiedArchivedActivities}`,
    );
  }

  return report;
};

export const createReconciliationManifest = (
  report: ReconciliationReport,
): ReconciliationManifest => ({
  sourceRecordRows: report.sourceRecordRows,
  reviewItemRows: report.reviewItemRows,
  holdingRawRows: report.holdingRawRows,
  stagingRows: report.stagingRows,
  distinctBusinessRows: report.distinctBusinessRows,
  duplicateRows: report.duplicateRows,
  nonemptyRawValues: report.nonemptyRawValues,
  disposedRawValues: report.disposedRawValues,
  dispositionsByKind: report.dispositionsByKind,
  rowCoverageHash: report.rowCoverageHash,
  businessContentHash: report.businessContentHash,
  dispositionHash: report.dispositionHash,
});

export const assertReconciliationManifest = (
  report: ReconciliationReport,
  expected: ReconciliationManifest,
): void => {
  if (!valuesEqual(createReconciliationManifest(report), expected)) {
    throw new Error(
      'Fresh CRM snapshot does not match the trusted dry-run manifest',
    );
  }
};

const valuesEqual = (left: unknown, right: unknown): boolean =>
  stableStringify(left) === stableStringify(right);

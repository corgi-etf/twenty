import {
  type MetadataCleanupPlan,
  type WorkspaceRecord,
} from './fetchMetadataCleanup';

export type CanonicalizationSnapshot = {
  companies: WorkspaceRecord[];
  people: WorkspaceRecord[];
  sourceRecords: WorkspaceRecord[];
  importReviewItems: WorkspaceRecord[];
  holdingObservations: WorkspaceRecord[];
  tasks: WorkspaceRecord[];
  taskTargets: WorkspaceRecord[];
  wholesalers: WorkspaceRecord[];
  leadAssignments: WorkspaceRecord[];
  outreachActivities: WorkspaceRecord[];
  archivedOutreachActivities: WorkspaceRecord[];
};

export type CanonicalizationReport = {
  rowCoverageHash: string;
  businessContentHash: string;
};

export type ExpectedCanonicalizationManifest = {
  companyCount: number;
  peopleCount: number;
  holdingCount: number;
  rowCoverageHash: string;
  businessContentHash: string;
};

const EXACT_COUNTS = {
  sourceRecords: 2603,
  importReviewItems: 212,
  pendingReviewItems: 140,
  acceptedReviewItems: 72,
  tasks: 159,
  taskTargets: 309,
  wholesalers: 10,
  leadAssignments: 4046,
  outreachActivities: 986,
  archivedOutreachActivities: 5,
  sourceCountries: 305,
  addressCountries: 310,
  matchingSourceCountries: 305,
  manualLocations: 0,
  nonManualLocations: 2185,
  unsetManualLocations: 6,
  companyTaskTargets: 159,
  personTaskTargets: 150,
  wholesalerTasks: 159,
  outreachFollowUpTasks: 113,
  outreachFollowUpDates: 58,
} as const;

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const assertCount = (label: string, actual: number, expected: number): void => {
  if (actual !== expected) {
    throw new Error(
      `CRM cleanup baseline mismatch for ${label}: expected ${expected}, received ${actual}`,
    );
  }
};

const uniqueLegacyIdMap = (
  objectName: string,
  records: WorkspaceRecord[],
): Map<string, string> => {
  const result = new Map<string, string>();

  for (const record of records) {
    const legacyId = stringValue(record.legacyFetchId);
    if (!legacyId) continue;
    if (result.has(legacyId)) {
      throw new Error(
        `CRM cleanup blocked: duplicate ${objectName}.legacyFetchId ${legacyId}`,
      );
    }
    result.set(legacyId, record.id);
  }

  return result;
};

const requireMappedId = (
  map: ReadonlyMap<string, string>,
  legacyId: unknown,
  context: string,
): string => {
  const key = stringValue(legacyId);
  const id = key ? map.get(key) : undefined;
  if (!key || !id) {
    throw new Error(`CRM cleanup blocked: ${context} is unresolved`);
  }

  return id;
};

const normalizedRawKey = (value: string): string =>
  value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '');

const parseMetadata = (
  value: unknown,
  context: string,
): Map<string, unknown> => {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      throw new Error(`CRM cleanup blocked: ${context} is invalid JSON`);
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`CRM cleanup blocked: ${context} is not an object`);
  }

  return new Map(
    Object.entries(parsed).map(([key, item]) => [normalizedRawKey(key), item]),
  );
};

export const assertAuditedCanonicalizationSnapshot = (
  snapshot: CanonicalizationSnapshot,
  report: CanonicalizationReport,
  expected: ExpectedCanonicalizationManifest,
): void => {
  assertCount(
    'source records',
    snapshot.sourceRecords.length,
    EXACT_COUNTS.sourceRecords,
  );
  assertCount(
    'import review items',
    snapshot.importReviewItems.length,
    EXACT_COUNTS.importReviewItems,
  );
  assertCount('companies', snapshot.companies.length, expected.companyCount);
  assertCount('people', snapshot.people.length, expected.peopleCount);
  assertCount('tasks', snapshot.tasks.length, EXACT_COUNTS.tasks);
  assertCount(
    'task targets',
    snapshot.taskTargets.length,
    EXACT_COUNTS.taskTargets,
  );
  assertCount(
    'wholesalers',
    snapshot.wholesalers.length,
    EXACT_COUNTS.wholesalers,
  );
  assertCount(
    'lead assignments',
    snapshot.leadAssignments.length,
    EXACT_COUNTS.leadAssignments,
  );
  assertCount(
    'outreach activities',
    snapshot.outreachActivities.length,
    EXACT_COUNTS.outreachActivities,
  );
  assertCount(
    'holding observations',
    snapshot.holdingObservations.length,
    expected.holdingCount,
  );
  assertCount(
    'archived outreach activities',
    snapshot.archivedOutreachActivities.length,
    EXACT_COUNTS.archivedOutreachActivities,
  );

  const sourceCountries = snapshot.companies.filter((company) =>
    stringValue(company.country),
  );
  const addressCountries = snapshot.companies.filter((company) =>
    stringValue(
      (company.address as Record<string, unknown> | undefined)?.addressCountry,
    ),
  );
  const matchingSourceCountries = sourceCountries.filter((company) => {
    const sourceCountry = stringValue(company.country)?.toLocaleLowerCase();
    const addressCountry = stringValue(
      (company.address as Record<string, unknown> | undefined)?.addressCountry,
    )?.toLocaleLowerCase();

    return sourceCountry === addressCountry;
  });
  assertCount(
    'source countries',
    sourceCountries.length,
    EXACT_COUNTS.sourceCountries,
  );
  assertCount(
    'address countries',
    addressCountries.length,
    EXACT_COUNTS.addressCountries,
  );
  assertCount(
    'matching source countries',
    matchingSourceCountries.length,
    EXACT_COUNTS.matchingSourceCountries,
  );
  assertCount(
    'manual locations',
    snapshot.companies.filter(
      ({ locationIsManual }) => locationIsManual === true,
    ).length,
    EXACT_COUNTS.manualLocations,
  );
  assertCount(
    'non-manual locations',
    snapshot.companies.filter(
      ({ locationIsManual }) => locationIsManual === false,
    ).length,
    EXACT_COUNTS.nonManualLocations,
  );
  assertCount(
    'unset manual locations',
    snapshot.companies.filter(
      ({ locationIsManual }) => locationIsManual == null,
    ).length,
    EXACT_COUNTS.unsetManualLocations,
  );

  const reviewStatuses = snapshot.importReviewItems.map((record) =>
    stringValue(record.reviewStatus)?.toLocaleLowerCase(),
  );
  assertCount(
    'pending review items',
    reviewStatuses.filter((status) => status === 'pending').length,
    EXACT_COUNTS.pendingReviewItems,
  );
  assertCount(
    'accepted review items',
    reviewStatuses.filter((status) => status === 'accepted').length,
    EXACT_COUNTS.acceptedReviewItems,
  );

  if (report.rowCoverageHash !== expected.rowCoverageHash) {
    throw new Error('CRM cleanup row-coverage hash does not match dry-run');
  }
  if (report.businessContentHash !== expected.businessContentHash) {
    throw new Error('CRM cleanup business-content hash does not match dry-run');
  }

  const companyByLegacyId = uniqueLegacyIdMap('company', snapshot.companies);
  const personByLegacyId = uniqueLegacyIdMap('person', snapshot.people);
  const wholesalerByLegacyId = uniqueLegacyIdMap(
    'wholesaler',
    snapshot.wholesalers,
  );
  const taskByLegacyId = uniqueLegacyIdMap('task', snapshot.tasks);

  for (const company of snapshot.companies) {
    const legacyOwnerId = stringValue(company.legacyOwnerId);
    if (!legacyOwnerId) continue;
    const expectedOwnerId = requireMappedId(
      wholesalerByLegacyId,
      legacyOwnerId,
      `company ${company.id} historical owner`,
    );
    if (company.historicalOwnerId !== expectedOwnerId) {
      throw new Error(
        `CRM cleanup blocked: company ${company.id} historical owner mapping is incorrect`,
      );
    }
  }

  let companyTaskTargets = 0;
  let personTaskTargets = 0;
  let wholesalerTasks = 0;
  for (const task of snapshot.tasks) {
    const companyId = requireMappedId(
      companyByLegacyId,
      task.legacyCompanyId,
      `task ${task.id} company`,
    );
    if (
      !snapshot.taskTargets.some(
        (target) =>
          target.taskId === task.id && target.targetCompanyId === companyId,
      )
    ) {
      throw new Error(
        `CRM cleanup blocked: task ${task.id} company target is missing`,
      );
    }
    companyTaskTargets += 1;

    const legacyContactId = stringValue(task.legacyContactId);
    if (legacyContactId) {
      const personId = requireMappedId(
        personByLegacyId,
        legacyContactId,
        `task ${task.id} contact`,
      );
      if (
        !snapshot.taskTargets.some(
          (target) =>
            target.taskId === task.id && target.targetPersonId === personId,
        )
      ) {
        throw new Error(
          `CRM cleanup blocked: task ${task.id} person target is missing`,
        );
      }
      personTaskTargets += 1;
    }

    const wholesalerId = requireMappedId(
      wholesalerByLegacyId,
      task.legacyWholesalerId,
      `task ${task.id} wholesaler`,
    );
    if (task.wholesalerId !== wholesalerId) {
      throw new Error(
        `CRM cleanup blocked: task ${task.id} wholesaler mapping is incorrect`,
      );
    }
    wholesalerTasks += 1;
  }
  assertCount(
    'company task targets',
    companyTaskTargets,
    EXACT_COUNTS.companyTaskTargets,
  );
  assertCount(
    'person task targets',
    personTaskTargets,
    EXACT_COUNTS.personTaskTargets,
  );
  assertCount(
    'wholesaler tasks',
    wholesalerTasks,
    EXACT_COUNTS.wholesalerTasks,
  );

  let outreachFollowUpTasks = 0;
  let outreachFollowUpDates = 0;
  for (const activity of snapshot.outreachActivities) {
    if (!stringValue(activity.fetchMetadata)) continue;
    const metadata = parseMetadata(
      activity.fetchMetadata,
      `outreachActivity ${activity.id}.fetchMetadata`,
    );
    const followUpId = stringValue(metadata.get('followupid'));
    const followUpDate = stringValue(metadata.get('followupdate'));
    if (followUpId) {
      const taskId = requireMappedId(
        taskByLegacyId,
        followUpId,
        `outreachActivity ${activity.id} follow-up task`,
      );
      if (activity.followUpTaskId !== taskId) {
        throw new Error(
          `CRM cleanup blocked: outreachActivity ${activity.id} follow-up task mapping is incorrect`,
        );
      }
      outreachFollowUpTasks += 1;
    }
    if (followUpDate) {
      const normalizedDate = /^\d{4}-\d{2}-\d{2}/.exec(followUpDate)?.[0];
      if (!normalizedDate || activity.followUpDate !== normalizedDate) {
        throw new Error(
          `CRM cleanup blocked: outreachActivity ${activity.id} follow-up date is not preserved`,
        );
      }
      outreachFollowUpDates += 1;
    }
  }
  assertCount(
    'outreach follow-up tasks',
    outreachFollowUpTasks,
    EXACT_COUNTS.outreachFollowUpTasks,
  );
  assertCount(
    'outreach follow-up dates',
    outreachFollowUpDates,
    EXACT_COUNTS.outreachFollowUpDates,
  );
};

const nestedStrings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(nestedStrings);
  if (!value || typeof value !== 'object') return [];

  return Object.values(value).flatMap(nestedStrings);
};

export const assertNoWorkflowReferences = (
  workflows: WorkspaceRecord[],
  plan: MetadataCleanupPlan,
): void => {
  const exactIds = [
    ...plan.objectsToDelete.map(({ id }) => id),
    ...plan.fieldsToDelete.map(({ id }) => id),
  ];
  const exactNames = [
    ...plan.objectsToDelete.flatMap(({ nameSingular, namePlural }) => [
      nameSingular,
      namePlural,
    ]),
    ...plan.fieldsToDelete
      .filter(({ fieldName }) =>
        /fetch|legacy|migration|sourceRow|rawData|hmac/i.test(fieldName),
      )
      .map(({ fieldName }) => fieldName),
    ...plan.fieldsToRename.map(({ oldName }) => oldName),
  ];

  for (const workflow of workflows) {
    for (const value of nestedStrings(workflow)) {
      const reference = exactIds.find((id) => value.includes(id));
      const nameReference = exactNames.find(
        (name) =>
          value === name ||
          new RegExp(
            `(^|[^A-Za-z0-9_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`,
          ).test(value),
      );
      if (reference || nameReference) {
        throw new Error(
          `CRM cleanup blocked: workflow ${workflow.id} references cleanup metadata ${reference ?? nameReference}`,
        );
      }
    }
  }
};

export const cleanupPreflightContract = { exactCounts: EXACT_COUNTS } as const;

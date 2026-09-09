import { type APIResponse, expect, test } from '@playwright/test';

import {
  assertCompanyValuesCanonicalized,
  assertPeopleContactValuesCanonicalized,
  buildFetchMetadataCleanupPlan,
  cleanupContract,
  type MetadataCleanupApi,
  type MetadataField,
  type MetadataObject,
  runFetchMetadataCleanup,
  type WorkspaceRecord,
} from './fetchMetadataCleanup';
import {
  assertAuditedCanonicalizationSnapshot,
  assertNoWorkflowReferences,
  type CanonicalizationSnapshot,
} from './fetchMetadataCleanupPreflight';
import { createRateLimitedRequest } from './playwrightMetadataCleanupApi';

const MIGRATION_APPLICATION_ID = 'migration-application-id';
const STANDARD_APPLICATION_ID = 'standard-application-id';

const fakePreflightEvidence = {
  rowCoverageHash: 'a'.repeat(64),
  businessContentHash: 'b'.repeat(64),
  sourceRecordCount: 2603,
  importReviewItemCount: 212,
  companyCount: 2191,
  peopleCount: 1961,
  taskCount: 159,
  taskTargetCount: 309,
  wholesalerCount: 10,
  leadAssignmentCount: 4046,
  outreachActivityCount: 986,
  holdingObservationCount: 331,
  archivedOutreachActivityCount: 5,
};

const oldLabelByField = new Map(
  cleanupContract.retainedFieldRenames.map(
    ([objectName, oldName, oldLabel]) =>
      [`${objectName}.${oldName}`, oldLabel] as const,
  ),
);

const metadataField = (
  objectName: string,
  name: string,
  applicationId = MIGRATION_APPLICATION_ID,
): MetadataField => ({
  id: `${objectName}-${name}-id`,
  name,
  label: oldLabelByField.get(`${objectName}.${name}`) ?? name,
  isSystem: applicationId === STANDARD_APPLICATION_ID,
  applicationId,
});

const metadataFixture = (): MetadataObject[] => {
  const survivingObjects = cleanupContract.survivingObjectNames.map(
    (objectName) => {
      const retainedFieldNames = cleanupContract.retainedFieldRenames
        .filter(([targetObjectName]) => targetObjectName === objectName)
        .map(([, oldName]) => oldName);
      const customFieldNames = new Set([
        ...cleanupContract.provenanceFieldNames,
        ...cleanupContract.additionalFieldsToDelete[objectName],
        ...retainedFieldNames,
      ]);
      const standardFieldNames = cleanupContract.preservedFields[objectName];

      return {
        id: `${objectName}-id`,
        nameSingular: objectName,
        namePlural: objectName === 'person' ? 'people' : `${objectName}s`,
        labelSingular: objectName,
        labelPlural: `${objectName}s`,
        isSystem: ['company', 'person', 'task', 'taskTarget'].includes(
          objectName,
        ),
        applicationId: ['wholesaler', 'salesTeam', 'teamMembership'].includes(
          objectName,
        )
          ? MIGRATION_APPLICATION_ID
          : STANDARD_APPLICATION_ID,
        fields: [
          ...standardFieldNames.map((fieldName) =>
            metadataField(objectName, fieldName, STANDARD_APPLICATION_ID),
          ),
          ...[...customFieldNames].map((fieldName) =>
            metadataField(objectName, fieldName),
          ),
        ],
      };
    },
  );
  const cleanupObjects = cleanupContract.objectNames.map((objectName) => ({
    id: `${objectName}-id`,
    nameSingular: objectName,
    namePlural:
      objectName === 'importReviewItem'
        ? 'importReviewItems'
        : objectName === 'archivedOutreachActivity'
          ? 'archivedOutreachActivities'
          : `${objectName}s`,
    labelSingular: objectName,
    labelPlural: `${objectName}s`,
    isSystem: false,
    applicationId: MIGRATION_APPLICATION_ID,
    fields: [],
  }));

  return [...survivingObjects, ...cleanupObjects];
};

const canonicalizedPerson = (): WorkspaceRecord => ({
  id: 'person-1',
  legacyEmail: 'owner@example.com',
  legacySecondaryEmails: JSON.stringify(['sales@example.com']),
  emails: {
    primaryEmail: 'owner@example.com',
    additionalEmails: ['sales@example.com'],
  },
  legacyPrimaryPhone: '(312) 555-0100 x55',
  legacySecondaryPhones: JSON.stringify(['+44 20 7946 0958', 'call office']),
  phones: {
    primaryPhoneCallingCode: '+1',
    primaryPhoneNumber: '3125550100',
    additionalPhones: [
      { callingCode: '+44', countryCode: 'GB', number: '2079460958' },
    ],
  },
  otherContactDetails:
    'Phone extension: (312) 555-0100 x55\nPhone: call office',
  legacyLinkedInUrl: 'linkedin.com/in/owner/?trk=old#profile',
  linkedinLink: {
    primaryLinkLabel: 'LinkedIn',
    primaryLinkUrl: 'https://linkedin.com/in/owner',
    secondaryLinks: [],
  },
});

const canonicalizedCompany = (): WorkspaceRecord => ({
  id: 'company-1',
  fetchDescription: 'A genuine sales description',
  description: 'A genuine sales description',
  fetchNotes: null,
  legacyOwnerId: 'source-owner-1',
  historicalOwnerId: 'wholesaler-1',
  legacyWebsite: 'www.example.com/about',
  country: 'US',
  locationIsManual: false,
  address: { addressCountry: 'US', addressLat: 41.8, addressLng: -87.6 },
  domainName: {
    primaryLinkUrl: 'https://example.com',
    secondaryLinks: [],
  },
  websiteNotes: null,
});

const groupedDeletedFieldNames = (
  plan: ReturnType<typeof buildFetchMetadataCleanupPlan>,
) =>
  Object.fromEntries(
    cleanupContract.survivingObjectNames.map((objectName) => [
      objectName,
      plan.fieldsToDelete
        .filter((field) => field.objectNameSingular === objectName)
        .map(({ fieldName }) => fieldName)
        .sort(),
    ]),
  );

const auditedSnapshot = (): CanonicalizationSnapshot => {
  const wholesalers = Array.from({ length: 10 }, (_, index) => ({
    id: `wholesaler-${index}`,
    legacyFetchId: `wholesaler-legacy-${index}`,
  }));
  const companies = Array.from({ length: 2191 }, (_, index) => ({
    id: `company-${index}`,
    legacyFetchId: `company-legacy-${index}`,
    ...(index < 305
      ? { country: 'US', address: { addressCountry: 'US' } }
      : index < 310
        ? { address: { addressCountry: 'CA' } }
        : {}),
    locationIsManual: index < 2185 ? false : null,
    ...(index === 0
      ? {
          legacyOwnerId: 'wholesaler-legacy-0',
          historicalOwnerId: 'wholesaler-0',
        }
      : {}),
  }));
  const people = Array.from({ length: 1961 }, (_, index) => ({
    id: `person-${index}`,
    legacyFetchId: `person-legacy-${index}`,
  }));
  const tasks = Array.from({ length: 159 }, (_, index) => ({
    id: `task-${index}`,
    legacyFetchId: `task-legacy-${index}`,
    legacyCompanyId: `company-legacy-${index}`,
    ...(index < 150 ? { legacyContactId: `person-legacy-${index}` } : {}),
    legacyWholesalerId: `wholesaler-legacy-${index % 10}`,
    wholesalerId: `wholesaler-${index % 10}`,
  }));
  const taskTargets = [
    ...Array.from({ length: 159 }, (_, index) => ({
      id: `company-target-${index}`,
      taskId: `task-${index}`,
      targetCompanyId: `company-${index}`,
    })),
    ...Array.from({ length: 150 }, (_, index) => ({
      id: `person-target-${index}`,
      taskId: `task-${index}`,
      targetPersonId: `person-${index}`,
    })),
  ];

  return {
    companies,
    people,
    sourceRecords: Array.from({ length: 2603 }, (_, index) => ({
      id: `source-${index}`,
    })),
    importReviewItems: Array.from({ length: 212 }, (_, index) => ({
      id: `review-${index}`,
      reviewStatus: index < 140 ? 'pending' : 'accepted',
    })),
    holdingObservations: Array.from({ length: 331 }, (_, index) => ({
      id: `holding-${index}`,
    })),
    tasks,
    taskTargets,
    wholesalers,
    leadAssignments: Array.from({ length: 4046 }, (_, index) => ({
      id: `assignment-${index}`,
    })),
    outreachActivities: Array.from({ length: 986 }, (_, index) => ({
      id: `outreach-${index}`,
      ...(index < 113
        ? {
            fetchMetadata: JSON.stringify({
              followUpId: `task-legacy-${index}`,
              ...(index < 58 ? { followUpDate: '2026-08-01' } : {}),
            }),
            followUpTaskId: `task-${index}`,
            ...(index < 58 ? { followUpDate: '2026-08-01' } : {}),
          }
        : {}),
    })),
    archivedOutreachActivities: Array.from({ length: 5 }, (_, index) => ({
      id: `archived-${index}`,
    })),
  };
};

class FakeMetadataCleanupApi implements MetadataCleanupApi {
  objects = metadataFixture();
  records: Record<string, WorkspaceRecord[]> = {
    importReviewItems: [],
    salesTeams: [],
    teamMemberships: [],
    people: [canonicalizedPerson()],
    companies: [canonicalizedCompany()],
    sourceRecords: [],
    holdingObservations: [],
  };
  deletedObjectIds: string[] = [];
  deletedFieldIds: string[] = [];
  updatedFields: Array<{ id: string; name: string; label: string }> = [];
  reconciliationChecks = 0;
  reconciliationError?: Error;
  journals: Parameters<MetadataCleanupApi['writeCleanupJournal']>[0][] = [];
  journalToResume?: Parameters<MetadataCleanupApi['writeCleanupJournal']>[0];
  events: string[] = [];

  async listMetadataObjects() {
    return structuredClone(this.objects);
  }

  async listRecords(objectNamePlural: string) {
    return structuredClone(this.records[objectNamePlural] ?? []);
  }

  async assertCanonicalizationComplete() {
    this.reconciliationChecks += 1;
    this.events.push('reconciliation');
    if (this.reconciliationError) throw this.reconciliationError;
    return fakePreflightEvidence;
  }

  async assertNoWorkflowReferences() {
    this.events.push('workflow-preflight');
  }

  async readCleanupJournal() {
    return this.journalToResume
      ? structuredClone(this.journalToResume)
      : undefined;
  }

  async writeCleanupJournal(
    journal: Parameters<MetadataCleanupApi['writeCleanupJournal']>[0],
  ) {
    this.journals.push(structuredClone(journal));
    this.events.push(`journal:${journal.status}`);
  }

  async deleteMetadataObject(id: string) {
    this.events.push(`delete-object:${id}`);
    this.deletedObjectIds.push(id);
    this.objects = this.objects.filter((object) => object.id !== id);
  }

  async deleteMetadataField(id: string) {
    this.events.push(`delete-field:${id}`);
    this.deletedFieldIds.push(id);
    this.objects = this.objects.map((object) => ({
      ...object,
      fields: object.fields.filter((field) => field.id !== id),
    }));
  }

  async updateMetadataField(
    id: string,
    update: { name: string; label: string },
  ) {
    this.events.push(`rename-field:${id}`);
    this.updatedFields.push({ id, ...update });
    this.objects = this.objects.map((object) => ({
      ...object,
      fields: object.fields.map((field) =>
        field.id === id ? { ...field, ...update } : field,
      ),
    }));
  }
}

test('builds the exact object and field purge allowlist', () => {
  const plan = buildFetchMetadataCleanupPlan(metadataFixture());

  expect(plan.objectsToDelete.map(({ nameSingular }) => nameSingular)).toEqual([
    'archivedOutreachActivity',
    'importReviewItem',
    'importBatch',
    'sourceRecord',
  ]);
  expect(groupedDeletedFieldNames(plan)).toEqual({
    company: [
      'country',
      'fetchDescription',
      'fetchNotes',
      'legacyFetchId',
      'legacyOwnerId',
      'legacyWebsite',
      'locationIsManual',
      'locationPrecision',
      'locationSource',
      'migrationRunId',
      'normalizedName',
      'sourceCreatedAt',
      'sourceRowHmac',
      'sourceUpdatedAt',
    ],
    person: [
      'fetchMetadata',
      'legacyEmail',
      'legacyFetchId',
      'legacyLinkedInUrl',
      'legacyPrimaryPhone',
      'legacySecondaryEmails',
      'legacySecondaryPhones',
      'migrationRunId',
      'sourceCreatedAt',
      'sourceRowHmac',
      'sourceUpdatedAt',
    ],
    task: [
      'legacyCompanyId',
      'legacyContactId',
      'legacyFetchId',
      'legacyWholesalerId',
      'migrationRunId',
      'sourceCreatedAt',
      'sourceRowHmac',
      'sourceUpdatedAt',
    ],
    taskTarget: [
      'legacyFetchId',
      'migrationRunId',
      'sourceCreatedAt',
      'sourceRowHmac',
      'sourceUpdatedAt',
    ],
    wholesaler: [
      'legacyFetchId',
      'migrationRunId',
      'sourceCreatedAt',
      'sourceRowHmac',
      'sourceUpdatedAt',
    ],
    salesTeam: [
      'legacyFetchId',
      'migrationRunId',
      'sourceCreatedAt',
      'sourceRowHmac',
      'sourceUpdatedAt',
    ],
    teamMembership: [
      'legacyFetchId',
      'migrationRunId',
      'sourceCreatedAt',
      'sourceRowHmac',
      'sourceUpdatedAt',
    ],
    leadAssignment: [
      'legacyFetchId',
      'migrationRunId',
      'replacementOfLegacyId',
      'sourceCreatedAt',
      'sourceRowHmac',
      'sourceUpdatedAt',
    ],
    outreachActivity: [
      'fetchMetadata',
      'legacyFetchId',
      'migrationRunId',
      'sourceCreatedAt',
      'sourceRowHmac',
      'sourceUpdatedAt',
    ],
    holdingObservation: [
      'importBatchLegacyId',
      'legacyFetchId',
      'migrationRunId',
      'rawData',
      'sourceCreatedAt',
      'sourceFile',
      'sourceRow',
      'sourceRowHmac',
      'sourceUpdatedAt',
    ],
  });
  expect(plan.fieldsToDelete).toHaveLength(74);
  expect(plan.fieldsToRename).toHaveLength(9);
  expect(
    plan.fieldsToRename.map(
      ({ objectNameSingular, oldName, name, label }) =>
        `${objectNameSingular}.${oldName}->${name}:${label}`,
    ),
  ).toEqual([
    'company.fetchStatus->leadStatus:Lead Status',
    'company.fetchTags->tags:Tags',
    'person.legacyAddress->streetAddress:Street Address',
    'person.legacyCity->city:City',
    'person.legacyStateRegion->stateRegion:State / Region',
    'person.legacyPostalCode->postalCode:Postal Code',
    'person.fetchNotes->notes:Notes',
    'wholesaler.fetchRole->role:Role',
    'holdingObservation.sourceDate->asOfDate:As Of Date',
  ]);
});

test('never plans deletion of the retained sales and map contract', () => {
  const plan = buildFetchMetadataCleanupPlan(metadataFixture());
  const deletedObjects = new Set(
    plan.objectsToDelete.map(({ nameSingular }) => nameSingular),
  );
  const deletedFields = new Set(
    plan.fieldsToDelete.map(
      ({ objectNameSingular, fieldName }) =>
        `${objectNameSingular}.${fieldName}`,
    ),
  );

  for (const objectName of cleanupContract.survivingObjectNames) {
    expect(deletedObjects.has(objectName)).toBe(false);
    for (const fieldName of cleanupContract.preservedFields[objectName]) {
      expect(deletedFields.has(`${objectName}.${fieldName}`)).toBe(false);
    }
  }
});

test('applies once and a second run is an idempotent no-op', async () => {
  const api = new FakeMetadataCleanupApi();
  const firstPlan = await runFetchMetadataCleanup(api);
  const firstMutationCount =
    api.deletedObjectIds.length +
    api.deletedFieldIds.length +
    api.updatedFields.length;
  const secondPlan = await runFetchMetadataCleanup(api);

  expect(firstPlan.objectsToDelete).toHaveLength(4);
  expect(firstPlan.fieldsToDelete).toHaveLength(74);
  expect(firstPlan.fieldsToRename).toHaveLength(9);
  expect(firstMutationCount).toBe(87);
  expect(api.reconciliationChecks).toBe(1);
  expect(api.events.slice(0, 4)).toEqual([
    'reconciliation',
    'workflow-preflight',
    'journal:running',
    'delete-object:archivedOutreachActivity-id',
  ]);
  const completedMutationJournal = api.journals.find(
    ({ completedOperationKeys, status }) =>
      status === 'complete' && completedOperationKeys.length > 0,
  );
  expect(completedMutationJournal).toMatchObject({
    status: 'complete',
    completedOperationKeys: expect.any(Array),
  });
  expect(completedMutationJournal?.completedOperationKeys).toHaveLength(87);
  expect(secondPlan).toEqual({
    objectsToDelete: [],
    fieldsToDelete: [],
    fieldsToRename: [],
  });
  expect(
    api.deletedObjectIds.length +
      api.deletedFieldIds.length +
      api.updatedFields.length,
  ).toBe(firstMutationCount);
  expect(
    api.objects.flatMap((object) => [
      object.nameSingular,
      object.namePlural,
      object.labelSingular,
      object.labelPlural,
      ...object.fields.flatMap(({ name, label }) => [name, label]),
    ]),
  ).not.toEqual(
    expect.arrayContaining([
      expect.stringMatching(cleanupContract.forbiddenMetadataPattern),
    ]),
  );
});

test('resumes an interrupted journal without rerunning a destroyed staging preflight', async () => {
  const api = new FakeMetadataCleanupApi();
  const plan = buildFetchMetadataCleanupPlan(api.objects);
  const firstObject = plan.objectsToDelete[0]!;
  api.objects = api.objects.filter(({ id }) => id !== firstObject.id);
  api.journalToResume = {
    schemaVersion: 1,
    status: 'running',
    operations: [
      ...plan.objectsToDelete.map(({ id, nameSingular }) => ({
        key: `delete-object:${id}`,
        kind: 'delete-object' as const,
        id,
        target: nameSingular,
      })),
      ...plan.fieldsToDelete.map(({ id, objectNameSingular, fieldName }) => ({
        key: `delete-field:${id}`,
        kind: 'delete-field' as const,
        id,
        target: `${objectNameSingular}.${fieldName}`,
      })),
      ...plan.fieldsToRename.map(
        ({ id, objectNameSingular, oldName, name }) => ({
          key: `rename-field:${id}`,
          kind: 'rename-field' as const,
          id,
          target: `${objectNameSingular}.${oldName}->${name}`,
        }),
      ),
    ],
    completedOperationKeys: [`delete-object:${firstObject.id}`],
    preflightEvidence: fakePreflightEvidence,
  };

  await runFetchMetadataCleanup(api);

  expect(api.reconciliationChecks).toBe(0);
  expect(api.events[0]).toBe('workflow-preflight');
  expect(api.journals.at(-1)).toMatchObject({
    status: 'complete',
    completedOperationKeys: expect.arrayContaining([
      `delete-object:${firstObject.id}`,
    ]),
  });
  expect(api.journals.at(-1)?.completedOperationKeys).toHaveLength(87);
});

test('preserves populated sales teams and memberships while removing provenance fields', async () => {
  const api = new FakeMetadataCleanupApi();
  api.records.salesTeams = [{ id: 'team-1', name: 'Midwest' }];
  api.records.teamMemberships = [{ id: 'membership-1' }];

  await runFetchMetadataCleanup(api);

  const salesTeam = api.objects.find(
    ({ nameSingular }) => nameSingular === 'salesTeam',
  );
  const teamMembership = api.objects.find(
    ({ nameSingular }) => nameSingular === 'teamMembership',
  );
  expect(salesTeam).toBeDefined();
  expect(salesTeam?.fields.map(({ name }) => name)).toEqual([
    'name',
    'description',
  ]);
  expect(teamMembership).toBeDefined();
  expect(teamMembership?.fields.map(({ name }) => name)).toEqual([
    'name',
    'membershipRole',
    'salesTeam',
    'wholesaler',
  ]);
});

test('blocks before mutation when aggregate reconciliation is incomplete', async () => {
  const api = new FakeMetadataCleanupApi();
  api.reconciliationError = new Error(
    'Canonicalization has unresolved records: SOURCE_ROW_UNRESOLVED=1',
  );

  await expect(runFetchMetadataCleanup(api)).rejects.toThrow(
    /SOURCE_ROW_UNRESOLVED=1/,
  );
  expect(api.reconciliationChecks).toBe(1);
  expect(api.deletedObjectIds).toEqual([]);
  expect(api.deletedFieldIds).toEqual([]);
  expect(api.updatedFields).toEqual([]);
});

test('proves imported contact values exist in standard Twenty fields', () => {
  expect(() =>
    assertPeopleContactValuesCanonicalized([canonicalizedPerson()]),
  ).not.toThrow();

  const missingPhone = canonicalizedPerson();
  missingPhone.phones = {
    primaryPhoneCallingCode: '',
    primaryPhoneNumber: '',
    additionalPhones: [],
  };
  expect(() => assertPeopleContactValuesCanonicalized([missingPhone])).toThrow(
    /Phones does not contain every imported phone/i,
  );

  const missingExtension = canonicalizedPerson();
  missingExtension.otherContactDetails = 'Phone: call office';
  expect(() =>
    assertPeopleContactValuesCanonicalized([missingExtension]),
  ).toThrow(/Phones does not contain every imported phone/i);

  const missingEmail = canonicalizedPerson();
  missingEmail.emails = { primaryEmail: '', additionalEmails: [] };
  expect(() => assertPeopleContactValuesCanonicalized([missingEmail])).toThrow(
    /Emails does not contain every imported email/i,
  );
});

test('proves company descriptions, ownership, and websites were canonicalized', () => {
  expect(() =>
    assertCompanyValuesCanonicalized([canonicalizedCompany()], []),
  ).not.toThrow();

  const sourceCommentary = canonicalizedCompany();
  sourceCommentary.fetchDescription = 'High confidence match';
  sourceCommentary.description = null;
  expect(() =>
    assertCompanyValuesCanonicalized(
      [sourceCommentary],
      [
        {
          id: 'source-1',
          companyId: sourceCommentary.id,
          rawData: JSON.stringify({
            'notes / source confidence': 'High confidence match',
          }),
        },
      ],
    ),
  ).not.toThrow();

  const missingWebsite = canonicalizedCompany();
  missingWebsite.domainName = { primaryLinkUrl: '', secondaryLinks: [] };
  expect(() => assertCompanyValuesCanonicalized([missingWebsite], [])).toThrow(
    /domainName does not contain the imported website/i,
  );

  const missingCountry = canonicalizedCompany();
  missingCountry.address = { addressCountry: '' };
  expect(() => assertCompanyValuesCanonicalized([missingCountry], [])).toThrow(
    /Source Country is not preserved/i,
  );

  const manualLocation = canonicalizedCompany();
  manualLocation.locationIsManual = true;
  expect(() => assertCompanyValuesCanonicalized([manualLocation], [])).toThrow(
    /manual location marker still requires canonicalization/i,
  );
});

test('blocks before mutation when a workflow references cleanup metadata', () => {
  const plan = buildFetchMetadataCleanupPlan(metadataFixture());

  expect(() =>
    assertNoWorkflowReferences(
      [
        {
          id: 'workflow-version-1',
          steps: [
            { settings: { fieldMetadataId: 'company-legacyFetchId-id' } },
          ],
        },
      ],
      plan,
    ),
  ).toThrow(/workflow workflow-version-1 references cleanup metadata/i);
  expect(() =>
    assertNoWorkflowReferences(
      [{ id: 'workflow-version-2', steps: [{ name: 'Send notification' }] }],
      plan,
    ),
  ).not.toThrow();
  expect(() =>
    assertNoWorkflowReferences(
      [
        {
          id: 'workflow-version-3',
          trigger: { filters: [{ fieldName: 'COUNTRY' }] },
        },
      ],
      plan,
    ),
  ).toThrow(/workflow workflow-version-3 references cleanup metadata country/i);
  expect(() =>
    assertNoWorkflowReferences(
      [
        {
          id: 'workflow-version-4',
          description: 'A country-specific sales workflow',
        },
      ],
      plan,
    ),
  ).not.toThrow();
});

test('requires the audited counts, hashes, and exact legacy relationships', () => {
  const snapshot = auditedSnapshot();
  const report = {
    rowCoverageHash: 'a'.repeat(64),
    businessContentHash: 'b'.repeat(64),
  };
  const expected = {
    companyCount: 2191,
    peopleCount: 1961,
    holdingCount: 331,
    rowCoverageHash: report.rowCoverageHash,
    businessContentHash: report.businessContentHash,
  };

  expect(() =>
    assertAuditedCanonicalizationSnapshot(snapshot, report, expected),
  ).not.toThrow();

  snapshot.companies[0]!.historicalOwnerId = 'wholesaler-1';
  expect(() =>
    assertAuditedCanonicalizationSnapshot(snapshot, report, expected),
  ).toThrow(/historical owner mapping is incorrect/i);
});

test('paces every request and honors bounded Retry-After retries', async () => {
  let clock = 0;
  const waits: number[] = [];
  let disposedResponses = 0;
  const request = createRateLimitedRequest({
    now: () => clock,
    wait: async (delay) => {
      waits.push(delay);
      clock += delay;
    },
  });
  const response = (status: number, retryAfter?: string) =>
    ({
      status: () => status,
      headers: () => (retryAfter ? { 'retry-after': retryAfter } : {}),
      dispose: async () => {
        disposedResponses += 1;
      },
    }) as unknown as APIResponse;
  let attempts = 0;

  const result = await request(async () => {
    attempts += 1;
    return attempts === 1 ? response(429, '2') : response(200);
  });

  expect(result.status()).toBe(200);
  expect(attempts).toBe(2);
  expect(disposedResponses).toBe(1);
  expect(waits).toEqual([2000]);

  attempts = 0;
  await expect(
    request(async () => {
      attempts += 1;
      return response(429);
    }),
  ).rejects.toThrow(/remained rate limited after retries/i);
  expect(attempts).toBe(5);
});

test('fails closed on protected or unhandled metadata', () => {
  const systemFieldObjects = metadataFixture();
  const companyLegacyId = systemFieldObjects
    .find(({ nameSingular }) => nameSingular === 'company')
    ?.fields.find(({ name }) => name === 'legacyFetchId');

  expect(companyLegacyId).toBeDefined();
  companyLegacyId!.isSystem = true;
  expect(() => buildFetchMetadataCleanupPlan(systemFieldObjects)).toThrow(
    /refusing to mutate system field/i,
  );

  const unhandledObjects = metadataFixture();
  unhandledObjects
    .find(({ nameSingular }) => nameSingular === 'company')!
    .fields.push(metadataField('company', 'fetchMystery'));
  expect(() => buildFetchMetadataCleanupPlan(unhandledObjects)).toThrow(
    /forbidden migration metadata field is not allowlisted/i,
  );
});

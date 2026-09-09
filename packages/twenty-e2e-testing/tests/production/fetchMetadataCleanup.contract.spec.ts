import { type APIResponse, expect, type Page, test } from '@playwright/test';

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
import {
  createPlaywrightMetadataCleanupApi,
  createRateLimitedRequest,
} from './playwrightMetadataCleanupApi';

const MIGRATION_APPLICATION_ID = 'migration-application-id';
const STANDARD_APPLICATION_ID = 'standard-application-id';

const canonicalSystemTargetRelations = {
  timelineActivity: [
    'workspaceMember',
    'targetPerson',
    'targetCompany',
    'targetOpportunity',
    'targetNote',
    'targetTask',
    'targetWorkflow',
    'targetWorkflowVersion',
    'targetWorkflowRun',
    'targetDashboard',
    'targetMessageList',
    'targetMessageCampaign',
  ],
  attachment: [
    'targetTask',
    'targetNote',
    'targetPerson',
    'targetCompany',
    'targetOpportunity',
    'targetDashboard',
    'targetWorkflow',
  ],
  noteTarget: ['note', 'targetPerson', 'targetCompany', 'targetOpportunity'],
  taskTarget: ['task', 'targetPerson', 'targetCompany', 'targetOpportunity'],
} as const;

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
const provenanceObjectNames = new Set<string>(
  cleanupContract.provenanceObjectNames,
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
        ...(provenanceObjectNames.has(objectName)
          ? cleanupContract.provenanceFieldNames
          : []),
        ...cleanupContract.additionalFieldsToDelete[objectName],
        ...retainedFieldNames,
      ]);
      const standardFieldNames = cleanupContract.preservedFields[objectName];

      return {
        id: `${objectName}-id`,
        nameSingular: objectName,
        namePlural:
          objectName === 'person'
            ? 'people'
            : objectName === 'timelineActivity'
              ? 'timelineActivities'
              : `${objectName}s`,
        labelSingular: objectName,
        labelPlural: `${objectName}s`,
        isSystem: [
          'company',
          'person',
          'task',
          'taskTarget',
          'timelineActivity',
          'attachment',
          'noteTarget',
        ].includes(objectName),
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

const auditedSnapshot = ({
  companyCount = 2191,
  peopleCount = 1961,
  holdingCount = 331,
}: {
  companyCount?: number;
  peopleCount?: number;
  holdingCount?: number;
} = {}): CanonicalizationSnapshot => {
  const wholesalers = Array.from({ length: 10 }, (_, index) => ({
    id: `wholesaler-${index}`,
    legacyFetchId: `wholesaler-legacy-${index}`,
  }));
  const companies = Array.from({ length: companyCount }, (_, index) => ({
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
  const people = Array.from({ length: peopleCount }, (_, index) => ({
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
    holdingObservations: Array.from({ length: holdingCount }, (_, index) => ({
      id: `holding-${index}`,
    })),
    tasks,
    taskTargets,
    wholesalers,
    leadAssignments: Array.from({ length: 4046 }, (_, index) => ({
      id: `assignment-${index}`,
      legacyFetchId: `assignment-legacy-${index}`,
      companyId: `company-${index % companies.length}`,
      wholesalerId: `wholesaler-${index % wholesalers.length}`,
      ...(index % 2 === 0
        ? { contactId: `person-${index % people.length}` }
        : {}),
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
      'targetImportBatch',
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
    timelineActivity: ['targetImportBatch'],
    attachment: ['targetImportBatch'],
    noteTarget: ['targetImportBatch'],
  });
  expect(plan.fieldsToDelete).toHaveLength(78);
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
    'wholesaler.fetchRole->wholesalerRole:Role',
    'holdingObservation.sourceDate->asOfDate:As Of Date',
  ]);
});

test('accepts an already canonical wholesaler role field without a reserved target', () => {
  const objects = metadataFixture();
  const wholesaler = objects.find(
    ({ nameSingular }) => nameSingular === 'wholesaler',
  );
  const roleField = wholesaler?.fields.find(({ name }) => name === 'fetchRole');
  expect(roleField).toBeDefined();
  roleField!.name = 'wholesalerRole';
  roleField!.label = 'Role';

  const plan = buildFetchMetadataCleanupPlan(objects);

  expect(
    plan.fieldsToRename.some(
      ({ objectNameSingular }) => objectNameSingular === 'wholesaler',
    ),
  ).toBe(false);
  expect(plan.fieldsToRename.some(({ name }) => name === 'role')).toBe(false);
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

test('deletes only import-batch system targets and remains idempotent', async () => {
  const api = new FakeMetadataCleanupApi();
  for (const [objectName, relationNames] of Object.entries(
    canonicalSystemTargetRelations,
  )) {
    let object = api.objects.find(
      ({ nameSingular }) => nameSingular === objectName,
    );
    if (!object) {
      object = {
        id: `${objectName}-id`,
        nameSingular: objectName,
        namePlural:
          objectName === 'timelineActivity'
            ? 'timelineActivities'
            : `${objectName}s`,
        labelSingular: objectName,
        labelPlural: `${objectName}s`,
        isSystem: true,
        applicationId: STANDARD_APPLICATION_ID,
        fields: relationNames.map((fieldName) =>
          metadataField(objectName, fieldName, STANDARD_APPLICATION_ID),
        ),
      };
      api.objects.push(object);
    }
    if (!object.fields.some(({ name }) => name === 'targetImportBatch')) {
      object.fields.push(metadataField(objectName, 'targetImportBatch'));
    }
  }

  const firstPlan = await runFetchMetadataCleanup(api);
  const secondPlan = await runFetchMetadataCleanup(api);

  expect(
    firstPlan.fieldsToDelete
      .filter(({ fieldName }) => fieldName === 'targetImportBatch')
      .map(({ objectNameSingular }) => objectNameSingular)
      .sort(),
  ).toEqual(Object.keys(canonicalSystemTargetRelations).sort());
  expect(secondPlan).toEqual({
    objectsToDelete: [],
    fieldsToDelete: [],
    fieldsToRename: [],
  });
  for (const [objectName, relationNames] of Object.entries(
    canonicalSystemTargetRelations,
  )) {
    expect(api.deletedFieldIds).toContain(`${objectName}-targetImportBatch-id`);
    expect(
      api.objects
        .find(({ nameSingular }) => nameSingular === objectName)
        ?.fields.map(({ name }) => name),
    ).toEqual(expect.arrayContaining([...relationNames]));
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
  expect(firstPlan.fieldsToDelete).toHaveLength(78);
  expect(firstPlan.fieldsToRename).toHaveLength(9);
  expect(firstMutationCount).toBe(91);
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
  expect(completedMutationJournal?.completedOperationKeys).toHaveLength(91);
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
  expect(api.journals.at(-1)?.completedOperationKeys).toHaveLength(91);
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

test('matches canonical contact normalization and residual preservation', () => {
  const normalizedLinkedIn = canonicalizedPerson();
  normalizedLinkedIn.legacyLinkedInUrl =
    'http://www.linkedin.com/in/owner/?trk=old#profile';
  normalizedLinkedIn.linkedinLink = {
    primaryLinkLabel: '',
    primaryLinkUrl: '',
    secondaryLinks: [
      { primaryLinkUrl: 'https://linkedin.com/in/owner', label: 'LinkedIn' },
    ],
  };
  expect(() =>
    assertPeopleContactValuesCanonicalized([normalizedLinkedIn]),
  ).not.toThrow();

  const residualContacts = canonicalizedPerson();
  residualContacts.legacySecondaryEmails = JSON.stringify([
    { label: 'private' },
  ]);
  residualContacts.legacySecondaryPhones = 'call switchboard';
  residualContacts.otherContactDetails =
    'Email: {"label":"private"}\nPhone: call switchboard\nPhone extension: (312) 555-0100 x55';
  expect(() =>
    assertPeopleContactValuesCanonicalized([residualContacts]),
  ).not.toThrow();

  const ignoredNonArrays = canonicalizedPerson();
  ignoredNonArrays.legacySecondaryEmails = JSON.stringify({
    email: 'not-a-candidate@example.com',
  });
  ignoredNonArrays.legacySecondaryPhones = JSON.stringify({
    phone: '+13125550199',
  });
  expect(() =>
    assertPeopleContactValuesCanonicalized([ignoredNonArrays]),
  ).not.toThrow();

  const missingLinkedIn = canonicalizedPerson();
  missingLinkedIn.linkedinLink = {
    primaryLinkLabel: '',
    primaryLinkUrl: '',
    secondaryLinks: [],
  };
  expect(() =>
    assertPeopleContactValuesCanonicalized([missingLinkedIn]),
  ).toThrow(/LinkedIn does not contain the imported URL/i);

  const missingResiduals = canonicalizedPerson();
  missingResiduals.legacySecondaryEmails = '[not-json';
  missingResiduals.legacySecondaryPhones = 'call switchboard';
  missingResiduals.otherContactDetails = '';
  expect(() =>
    assertPeopleContactValuesCanonicalized([missingResiduals]),
  ).toThrow(/Emails does not contain every imported email/i);

  const missingPhoneResidual = canonicalizedPerson();
  missingPhoneResidual.legacyEmail = null;
  missingPhoneResidual.legacySecondaryEmails = null;
  missingPhoneResidual.legacyPrimaryPhone = null;
  missingPhoneResidual.legacySecondaryPhones = 'call switchboard';
  missingPhoneResidual.otherContactDetails = '';
  expect(() =>
    assertPeopleContactValuesCanonicalized([missingPhoneResidual]),
  ).toThrow(/Phones does not contain every imported phone/i);

  const partialPhoneIdentity = canonicalizedPerson();
  partialPhoneIdentity.legacyPrimaryPhone = '(312) 555-0100';
  partialPhoneIdentity.legacySecondaryPhones = null;
  partialPhoneIdentity.phones = {
    primaryPhoneCallingCode: '',
    primaryPhoneNumber: '5550100',
    additionalPhones: [],
  };
  partialPhoneIdentity.otherContactDetails = '';
  expect(() =>
    assertPeopleContactValuesCanonicalized([partialPhoneIdentity]),
  ).toThrow(/Phones does not contain every imported phone/i);
});

test('proves company descriptions, ownership, and websites were canonicalized', () => {
  expect(() =>
    assertCompanyValuesCanonicalized([canonicalizedCompany()], []),
  ).not.toThrow();

  const enrichedMultilineDescription = canonicalizedCompany();
  enrichedMultilineDescription.fetchDescription =
    'Zulu re\u0301sume\u0301\r\n  Middle profile  \r\n \t \r\nAlpha profile';
  enrichedMultilineDescription.description =
    'Alpha profile\nAdded native context\nMiddle profile\nZulu résumé';
  expect(() =>
    assertCompanyValuesCanonicalized([enrichedMultilineDescription], []),
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

  const normalizedImportReviewCommentary = canonicalizedCompany();
  normalizedImportReviewCommentary.fetchDescription =
    'High confidence import review';
  normalizedImportReviewCommentary.description = null;
  expect(() =>
    assertCompanyValuesCanonicalized(
      [normalizedImportReviewCommentary],
      [],
      [
        {
          id: 'review-1',
          companyId: normalizedImportReviewCommentary.id,
          rawData: JSON.stringify({
            ' Notes / Source-Confidence ': 'High confidence import review',
          }),
        },
      ],
    ),
  ).not.toThrow();

  const unrelatedImportReviewCommentary = canonicalizedCompany();
  unrelatedImportReviewCommentary.fetchDescription =
    'High confidence import review';
  unrelatedImportReviewCommentary.description = null;
  expect(() =>
    assertCompanyValuesCanonicalized(
      [unrelatedImportReviewCommentary],
      [],
      [
        {
          id: 'review-2',
          companyId: 'another-company',
          rawData: JSON.stringify({
            'notes source confidence': 'High confidence import review',
          }),
        },
      ],
    ),
  ).toThrow(/Description classification is incomplete/i);

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

  for (const description of [
    'Alpha profile\nZulu résumé',
    'Alpha profile with user-authored context\nMiddle profile\nZulu résumé',
  ]) {
    const incompleteMultilineDescription = canonicalizedCompany();
    incompleteMultilineDescription.fetchDescription =
      'Zulu re\u0301sume\u0301\r\n  Middle profile  \r\n \t \r\nAlpha profile';
    incompleteMultilineDescription.description = description;

    expect(() =>
      assertCompanyValuesCanonicalized([incompleteMultilineDescription], []),
    ).toThrow(/Description classification is incomplete/i);
  }
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

test('ignores generated trigger and step output schemas', () => {
  const plan = buildFetchMetadataCleanupPlan(metadataFixture());
  const generatedCountryField = {
    isLeaf: true,
    type: 'TEXT',
    label: 'Country',
    value: 'France',
    fieldMetadataId: 'company-country-id',
  };

  expect(() =>
    assertNoWorkflowReferences(
      [
        {
          id: 'workflow-version-generated-schemas',
          trigger: {
            type: 'DATABASE_EVENT',
            settings: {
              eventName: 'company.updated',
              outputSchema: {
                object: {
                  label: 'Company',
                  objectMetadataId: 'company-id',
                },
                fields: {
                  'properties.after.country': generatedCountryField,
                },
                _outputSchemaType: 'RECORD',
              },
            },
          },
          steps: [
            {
              type: 'FIND_RECORDS',
              settings: {
                OutputSchema: {
                  object: {
                    label: 'Company',
                    objectMetadataId: 'company-id',
                  },
                  fields: { country: generatedCountryField },
                  _outputSchemaType: 'RECORD',
                },
              },
            },
          ],
        },
      ],
      plan,
    ),
  ).not.toThrow();
});

test('still blocks executable workflow references outside output schemas', () => {
  const plan = buildFetchMetadataCleanupPlan(metadataFixture());

  for (const [id, workflow] of [
    ['trigger-field-name', { trigger: { settings: { fields: ['country'] } } }],
    [
      'trigger-filter-id',
      {
        trigger: {
          settings: {
            filter: {
              stepFilters: [
                { fieldMetadataId: 'company-country-id', value: 'US' },
              ],
            },
          },
        },
      },
    ],
    [
      'step-field-name',
      {
        steps: [
          {
            settings: {
              input: {
                objectName: 'company',
                fieldsToUpdate: ['country'],
              },
            },
          },
        ],
      },
    ],
    [
      'step-variable',
      {
        steps: [
          {
            settings: {
              input: {
                body: '{{trigger.properties.after.country}}',
              },
            },
          },
        ],
      },
    ],
  ] as const) {
    expect(() =>
      assertNoWorkflowReferences([{ id, ...workflow }], plan),
    ).toThrow(/references cleanup metadata/i);
  }
});

test('only skips exact outputSchema property names', () => {
  const plan = buildFetchMetadataCleanupPlan(metadataFixture());

  expect(() =>
    assertNoWorkflowReferences(
      [
        {
          id: 'workflow-version-output-schema-copy',
          trigger: {
            settings: {
              outputSchemaCopy: {
                label: 'Country',
                fieldMetadataId: 'company-country-id',
              },
            },
          },
        },
      ],
      plan,
    ),
  ).toThrow(/references cleanup metadata/i);
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

test('derives unset location markers from each approved manifest size', () => {
  const report = {
    rowCoverageHash: 'a'.repeat(64),
    businessContentHash: 'b'.repeat(64),
  };

  for (const manifest of [
    { companyCount: 2191, peopleCount: 1961, holdingCount: 331 },
    { companyCount: 2238, peopleCount: 2604, holdingCount: 680 },
  ]) {
    const snapshot = auditedSnapshot(manifest);

    expect(() =>
      assertAuditedCanonicalizationSnapshot(snapshot, report, {
        ...manifest,
        rowCoverageHash: report.rowCoverageHash,
        businessContentHash: report.businessContentHash,
      }),
    ).not.toThrow();
  }
});

test('rejects non-boolean non-null location markers', () => {
  const snapshot = auditedSnapshot();
  snapshot.companies.at(-1)!.locationIsManual = 'false';
  const report = {
    rowCoverageHash: 'a'.repeat(64),
    businessContentHash: 'b'.repeat(64),
  };

  expect(() =>
    assertAuditedCanonicalizationSnapshot(snapshot, report, {
      companyCount: 2191,
      peopleCount: 1961,
      holdingCount: 331,
      rowCoverageHash: report.rowCoverageHash,
      businessContentHash: report.businessContentHash,
    }),
  ).toThrow(/locationIsManual.*boolean or nullish/i);
});

test('rejects a manifest too small for the audited location cohorts', () => {
  const manifest = {
    companyCount: 2184,
    peopleCount: 1961,
    holdingCount: 331,
  };
  const snapshot = auditedSnapshot(manifest);
  const report = {
    rowCoverageHash: 'a'.repeat(64),
    businessContentHash: 'b'.repeat(64),
  };

  expect(() =>
    assertAuditedCanonicalizationSnapshot(snapshot, report, {
      ...manifest,
      rowCoverageHash: report.rowCoverageHash,
      businessContentHash: report.businessContentHash,
    }),
  ).toThrow(/company count.*smaller than the audited location cohorts/i);
});

test('accepts additive native lead assignments without losing the migrated baseline', () => {
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

  snapshot.leadAssignments.push({ id: 'native-assignment' });
  expect(() =>
    assertAuditedCanonicalizationSnapshot(snapshot, report, expected),
  ).not.toThrow();

  snapshot.leadAssignments.shift();
  expect(() =>
    assertAuditedCanonicalizationSnapshot(snapshot, report, expected),
  ).toThrow(/migrated lead assignments/i);
});

test('rejects unresolved relations on the migrated lead-assignment cohort', () => {
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

  for (const [field, error] of [
    ['companyId', /company mapping is unresolved/i],
    ['wholesalerId', /wholesaler mapping is unresolved/i],
    ['contactId', /contact mapping is unresolved/i],
  ] as const) {
    const snapshot = auditedSnapshot();
    snapshot.leadAssignments[0]![field] = 'missing-relation';

    expect(() =>
      assertAuditedCanonicalizationSnapshot(snapshot, report, expected),
    ).toThrow(error);
  }
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

test('loads canonicalization before issuing the first snapshot request', async () => {
  const sentinel = new Error('snapshot request sentinel');
  let getCount = 0;
  const page = {
    request: {
      get: async () => {
        getCount += 1;
        throw sentinel;
      },
    },
  } as unknown as Page;
  const api = createPlaywrightMetadataCleanupApi({
    page,
    backendBaseUrl: 'https://crm.example.test',
    frontendBaseUrl: 'https://crm.example.test',
  });

  const preflight = api.assertCanonicalizationComplete();
  const getCountBeforeYield = getCount;

  await expect(preflight).rejects.toBe(sentinel);
  expect(getCountBeforeYield).toBe(1);
  expect(getCount).toBe(1);
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

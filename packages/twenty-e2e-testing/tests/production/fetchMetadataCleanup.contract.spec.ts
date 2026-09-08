import { expect, test } from '@playwright/test';

import {
  assertCompanyValuesCanonicalized,
  assertHoldingRawDataCanonicalized,
  assertPeopleContactValuesCanonicalized,
  buildFetchMetadataCleanupPlan,
  cleanupContract,
  type MetadataCleanupApi,
  type MetadataField,
  type MetadataObject,
  runFetchMetadataCleanup,
  type WorkspaceRecord,
} from './fetchMetadataCleanup';

const MIGRATION_APPLICATION_ID = 'migration-application-id';
const STANDARD_APPLICATION_ID = 'standard-application-id';

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
        applicationId:
          objectName === 'wholesaler'
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
  legacyPrimaryPhone: '+1 (312) 555-010012',
  legacySecondaryPhones: JSON.stringify(['+44 20 7946 0958']),
  phones: {
    primaryPhoneCallingCode: '+1',
    primaryPhoneNumber: '312555010012',
    additionalPhones: [
      { callingCode: '+44', countryCode: 'GB', number: '2079460958' },
    ],
  },
  legacyLinkedInUrl: 'linkedin.com/in/owner',
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
  domainName: {
    primaryLinkUrl: 'https://example.com',
    secondaryLinks: [],
  },
  unformattedWebsite: null,
});

const canonicalizedHolding = (): WorkspaceRecord => ({
  id: 'holding-1',
  rawData: JSON.stringify({
    'Product Name': 'Fund A',
    '% Ownership': '12.5%',
    'Avg Price': '$42.10',
    'Source Date': '2026-06-30',
    '13F': 'Q2 filing',
  }),
  productName: 'Fund A',
  ownershipPercent: 12.5,
  averagePrice: 42.1,
  sourceDate: '2026-06-30',
  form13f: 'Q2 filing',
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

class FakeMetadataCleanupApi implements MetadataCleanupApi {
  objects = metadataFixture();
  records: Record<string, WorkspaceRecord[]> = {
    importReviewItems: [
      {
        id: 'review-1',
        reviewStatus: 'accepted',
        candidateCompanyId: 'company-1',
      },
    ],
    salesTeams: [],
    teamMemberships: [],
    people: [canonicalizedPerson()],
    companies: [canonicalizedCompany()],
    sourceRecords: [],
    holdingObservations: [canonicalizedHolding()],
  };
  deletedObjectIds: string[] = [];
  deletedFieldIds: string[] = [];
  updatedFields: Array<{ id: string; name: string; label: string }> = [];

  async listMetadataObjects() {
    return structuredClone(this.objects);
  }

  async listRecords(objectNamePlural: string) {
    return structuredClone(this.records[objectNamePlural] ?? []);
  }

  async deleteMetadataObject(id: string) {
    this.deletedObjectIds.push(id);
    this.objects = this.objects.filter((object) => object.id !== id);
  }

  async deleteMetadataField(id: string) {
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
    'teamMembership',
    'salesTeam',
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
  expect(plan.fieldsToDelete).toHaveLength(64);
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

  expect(firstPlan.objectsToDelete).toHaveLength(6);
  expect(firstPlan.fieldsToDelete).toHaveLength(64);
  expect(firstPlan.fieldsToRename).toHaveLength(9);
  expect(firstMutationCount).toBe(79);
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

test('blocks before mutation while review rows are pending', async () => {
  const api = new FakeMetadataCleanupApi();
  api.records.importReviewItems = [
    {
      id: 'review-pending',
      reviewStatus: 'pending',
      rawData: '{"Company":"X"}',
    },
  ];

  await expect(runFetchMetadataCleanup(api)).rejects.toThrow(
    /unresolved row.*canonicalized first/i,
  );
  expect(api.deletedObjectIds).toEqual([]);
  expect(api.deletedFieldIds).toEqual([]);
  expect(api.updatedFields).toEqual([]);
});

test('blocks before mutation when empty-only migration objects have records', async () => {
  const api = new FakeMetadataCleanupApi();
  api.records.salesTeams = [{ id: 'team-1' }];

  await expect(runFetchMetadataCleanup(api)).rejects.toThrow(
    /non-empty migration-only object salesTeam/i,
  );
  expect(api.deletedObjectIds).toEqual([]);
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
});

test('proves every nonempty holding raw value exists in a typed field', () => {
  expect(() =>
    assertHoldingRawDataCanonicalized([canonicalizedHolding()]),
  ).not.toThrow();

  const missingValue = canonicalizedHolding();
  missingValue.ownershipPercent = null;
  expect(() => assertHoldingRawDataCanonicalized([missingValue])).toThrow(
    /rawData field % Ownership is not canonicalized/i,
  );

  const unknownKey = canonicalizedHolding();
  unknownKey.rawData = JSON.stringify({ 'Undocumented column': 'value' });
  expect(() => assertHoldingRawDataCanonicalized([unknownKey])).toThrow(
    /rawData field Undocumented column is not canonicalized/i,
  );
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

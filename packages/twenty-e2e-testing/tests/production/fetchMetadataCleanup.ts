const CLEANUP_OBJECT_NAMES = [
  'archivedOutreachActivity',
  'importReviewItem',
  'importBatch',
  'sourceRecord',
] as const;

const SURVIVING_MIGRATED_OBJECT_NAMES = [
  'company',
  'person',
  'task',
  'taskTarget',
  'wholesaler',
  'salesTeam',
  'teamMembership',
  'leadAssignment',
  'outreachActivity',
  'holdingObservation',
] as const;

const PROVENANCE_FIELD_NAMES = [
  'legacyFetchId',
  'migrationRunId',
  'sourceRowHmac',
  'sourceCreatedAt',
  'sourceUpdatedAt',
] as const;

export type CleanupObjectName = (typeof CLEANUP_OBJECT_NAMES)[number];
export type SurvivingMigratedObjectName =
  (typeof SURVIVING_MIGRATED_OBJECT_NAMES)[number];

const ADDITIONAL_FIELDS_TO_DELETE = {
  company: [
    'legacyOwnerId',
    'normalizedName',
    'country',
    'locationPrecision',
    'locationSource',
    'locationIsManual',
    'fetchDescription',
    'fetchNotes',
    'legacyWebsite',
  ],
  person: [
    'fetchMetadata',
    'legacyEmail',
    'legacyPrimaryPhone',
    'legacyLinkedInUrl',
    'legacySecondaryEmails',
    'legacySecondaryPhones',
  ],
  task: ['legacyCompanyId', 'legacyContactId', 'legacyWholesalerId'],
  taskTarget: [],
  wholesaler: [],
  salesTeam: [],
  teamMembership: [],
  leadAssignment: ['replacementOfLegacyId'],
  outreachActivity: ['fetchMetadata'],
  holdingObservation: [
    'importBatchLegacyId',
    'sourceFile',
    'sourceRow',
    'rawData',
  ],
} as const satisfies Record<SurvivingMigratedObjectName, readonly string[]>;

const PRESERVED_FIELDS = {
  company: ['name', 'address', 'historicalOwner', 'geography', 'description'],
  person: [
    'name',
    'company',
    'emails',
    'phones',
    'linkedinLink',
    'otherContactDetails',
  ],
  task: ['title'],
  taskTarget: ['task', 'targetCompany'],
  wholesaler: ['name'],
  salesTeam: ['name', 'description'],
  teamMembership: ['name', 'membershipRole', 'salesTeam', 'wholesaler'],
  leadAssignment: ['name', 'company', 'contact', 'wholesaler'],
  outreachActivity: ['name', 'company', 'contact', 'wholesaler', 'assignment'],
  holdingObservation: [
    'name',
    'company',
    'productName',
    'filerName',
    'filerId',
    'cik',
    'crd',
    'city',
    'stateRegion',
    'sharesHeld',
    'marketValue',
    'portfolioPercent',
    'ownershipPercent',
    'averagePrice',
    'shareChange',
    'shareChangePercent',
    'previousPortfolioPercent',
    'firstOwnedQuarter',
    'ranking',
    'previousRanking',
    'form13f',
    'filerIrsNumber',
    'streetAddress',
    'addressLine2',
  ],
} as const satisfies Record<SurvivingMigratedObjectName, readonly string[]>;

const RETAINED_FIELD_RENAMES = [
  ['company', 'fetchStatus', 'Fetch Status', 'leadStatus', 'Lead Status'],
  ['company', 'fetchTags', 'Fetch Tags', 'tags', 'Tags'],
  [
    'person',
    'legacyAddress',
    'Legacy Address',
    'streetAddress',
    'Street Address',
  ],
  ['person', 'legacyCity', 'Legacy City', 'city', 'City'],
  [
    'person',
    'legacyStateRegion',
    'Legacy State / Region',
    'stateRegion',
    'State / Region',
  ],
  [
    'person',
    'legacyPostalCode',
    'Legacy Postal Code',
    'postalCode',
    'Postal Code',
  ],
  ['person', 'fetchNotes', 'Fetch Notes', 'notes', 'Notes'],
  ['wholesaler', 'fetchRole', 'Fetch Role', 'role', 'Role'],
  ['holdingObservation', 'sourceDate', 'Source Date', 'asOfDate', 'As Of Date'],
] as const;

const FORBIDDEN_METADATA_PATTERN =
  /fetch|legacy|migration|import\s*batch|source\s*row|hmac|raw\s*data/i;

export const FETCH_METADATA_CLEANUP_CONFIRMATION =
  'PERMANENTLY_DELETE_FETCH_METADATA_FROM_CRM_CORGIINVEST_COM';

export type MetadataField = {
  id: string;
  name: string;
  label: string;
  isSystem?: boolean;
  applicationId: string;
};

export type MetadataObject = {
  id: string;
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural?: string;
  isSystem: boolean;
  applicationId: string;
  fields: MetadataField[];
};

export type WorkspaceRecord = Record<string, unknown> & { id: string };

export type MetadataCleanupApi = {
  listMetadataObjects(): Promise<MetadataObject[]>;
  listRecords(objectNamePlural: string): Promise<WorkspaceRecord[]>;
  assertCanonicalizationComplete(): Promise<MetadataCleanupPreflightEvidence>;
  assertNoWorkflowReferences(plan: MetadataCleanupPlan): Promise<void>;
  readCleanupJournal(): Promise<MetadataCleanupJournal | undefined>;
  writeCleanupJournal(journal: MetadataCleanupJournal): Promise<void>;
  deleteMetadataObject(id: string): Promise<void>;
  deleteMetadataField(id: string): Promise<void>;
  updateMetadataField(
    id: string,
    update: { name: string; label: string },
  ): Promise<void>;
};

export type MetadataCleanupPlan = {
  objectsToDelete: Array<
    Pick<MetadataObject, 'id' | 'nameSingular' | 'namePlural'>
  >;
  fieldsToDelete: Array<{
    id: string;
    objectNameSingular: SurvivingMigratedObjectName;
    fieldName: string;
  }>;
  fieldsToRename: Array<{
    id: string;
    objectNameSingular: SurvivingMigratedObjectName;
    oldName: string;
    name: string;
    label: string;
  }>;
};

export type MetadataCleanupOperation = {
  key: string;
  kind: 'delete-object' | 'delete-field' | 'rename-field';
  id: string;
  target: string;
};

export type MetadataCleanupJournal = {
  schemaVersion: 1;
  status: 'planned' | 'running' | 'complete';
  operations: MetadataCleanupOperation[];
  completedOperationKeys: string[];
  preflightEvidence: MetadataCleanupPreflightEvidence;
};

export type MetadataCleanupPreflightEvidence = {
  rowCoverageHash: string;
  businessContentHash: string;
  sourceRecordCount: number;
  importReviewItemCount: number;
  companyCount: number;
  peopleCount: number;
  taskCount: number;
  taskTargetCount: number;
  wholesalerCount: number;
  leadAssignmentCount: number;
  outreachActivityCount: number;
  holdingObservationCount: number;
  archivedOutreachActivityCount: number;
};

const getObjectByName = (objects: MetadataObject[]) => {
  const objectsByName = new Map<string, MetadataObject>();

  for (const object of objects) {
    if (objectsByName.has(object.nameSingular)) {
      throw new Error(`Duplicate metadata object ${object.nameSingular}`);
    }
    objectsByName.set(object.nameSingular, object);
  }

  return objectsByName;
};

const requireObject = (
  objectsByName: ReadonlyMap<string, MetadataObject>,
  objectNameSingular: SurvivingMigratedObjectName,
): MetadataObject => {
  const object = objectsByName.get(objectNameSingular);

  if (!object) {
    throw new Error(`Required sales object ${objectNameSingular} is missing`);
  }

  return object;
};

const requirePreservedFields = (object: MetadataObject): void => {
  const fieldNames = new Set(object.fields.map(({ name }) => name));

  for (const fieldName of PRESERVED_FIELDS[
    object.nameSingular as SurvivingMigratedObjectName
  ]) {
    if (!fieldNames.has(fieldName)) {
      throw new Error(
        `Required sales field ${object.nameSingular}.${fieldName} is missing`,
      );
    }
  }
};

const assertMigrationField = ({
  field,
  objectNameSingular,
  migrationApplicationId,
}: {
  field: MetadataField;
  objectNameSingular: string;
  migrationApplicationId: string;
}): void => {
  if (field.isSystem === true) {
    throw new Error(
      `Refusing to mutate system field ${objectNameSingular}.${field.name}`,
    );
  }
  if (field.applicationId !== migrationApplicationId) {
    throw new Error(
      `Refusing to mutate ${objectNameSingular}.${field.name} owned by another application`,
    );
  }
};

const buildFieldsToRename = ({
  objectsByName,
  migrationApplicationId,
}: {
  objectsByName: ReadonlyMap<string, MetadataObject>;
  migrationApplicationId: string;
}): MetadataCleanupPlan['fieldsToRename'] =>
  RETAINED_FIELD_RENAMES.flatMap(
    ([objectNameSingular, oldName, oldLabel, newName, newLabel]) => {
      const object = requireObject(objectsByName, objectNameSingular);
      const oldField = object.fields.find(({ name }) => name === oldName);
      const newField = object.fields.find(({ name }) => name === newName);

      if (oldField && newField && oldField.id !== newField.id) {
        throw new Error(
          `Refusing to rename ${objectNameSingular}.${oldName}; ${newName} already exists`,
        );
      }
      const field = oldField ?? newField;
      if (!field) {
        throw new Error(
          `Required retained field ${objectNameSingular}.${oldName} or ${newName} is missing`,
        );
      }
      assertMigrationField({
        field,
        objectNameSingular,
        migrationApplicationId,
      });
      if (field.name === newName && field.label === newLabel) return [];
      if (
        ![oldName, newName].includes(field.name) ||
        ![oldLabel, newLabel].includes(field.label)
      ) {
        throw new Error(
          `Refusing unexpected rename state on ${objectNameSingular}.${field.name}`,
        );
      }

      return [
        {
          id: field.id,
          objectNameSingular,
          oldName,
          name: newName,
          label: newLabel,
        },
      ];
    },
  );

const assertNoUnhandledForbiddenMetadata = (
  objects: MetadataObject[],
  plan: MetadataCleanupPlan,
): void => {
  const deletedObjectIds = new Set(plan.objectsToDelete.map(({ id }) => id));
  const deletedFieldIds = new Set(plan.fieldsToDelete.map(({ id }) => id));
  const renamedFieldIds = new Set(plan.fieldsToRename.map(({ id }) => id));

  for (const object of objects) {
    if (
      !deletedObjectIds.has(object.id) &&
      FORBIDDEN_METADATA_PATTERN.test(
        `${object.nameSingular} ${object.namePlural} ${object.labelSingular} ${object.labelPlural ?? ''}`,
      )
    ) {
      throw new Error(
        `Forbidden migration metadata object is not allowlisted: ${object.nameSingular}`,
      );
    }
    if (deletedObjectIds.has(object.id)) continue;

    for (const field of object.fields) {
      if (
        !deletedFieldIds.has(field.id) &&
        !renamedFieldIds.has(field.id) &&
        FORBIDDEN_METADATA_PATTERN.test(`${field.name} ${field.label}`)
      ) {
        throw new Error(
          `Forbidden migration metadata field is not allowlisted: ${object.nameSingular}.${field.name}`,
        );
      }
    }
  }
};

export const buildFetchMetadataCleanupPlan = (
  objects: MetadataObject[],
): MetadataCleanupPlan => {
  const objectsByName = getObjectByName(objects);
  const survivingObjects = SURVIVING_MIGRATED_OBJECT_NAMES.map((objectName) =>
    requireObject(objectsByName, objectName),
  );

  for (const object of survivingObjects) requirePreservedFields(object);

  const migrationApplicationId = requireObject(
    objectsByName,
    'wholesaler',
  ).applicationId;
  const objectsToDelete = CLEANUP_OBJECT_NAMES.flatMap((objectName) => {
    const object = objectsByName.get(objectName);

    if (!object) return [];
    if (object.isSystem) {
      throw new Error(`Refusing to delete system object ${objectName}`);
    }
    if (object.applicationId !== migrationApplicationId) {
      throw new Error(
        `Refusing to delete ${objectName} owned by another application`,
      );
    }

    return [
      {
        id: object.id,
        nameSingular: objectName,
        namePlural: object.namePlural,
      },
    ];
  });
  const fieldsToDelete = survivingObjects.flatMap((object) => {
    const fieldNames = new Set<string>([
      ...PROVENANCE_FIELD_NAMES,
      ...ADDITIONAL_FIELDS_TO_DELETE[
        object.nameSingular as SurvivingMigratedObjectName
      ],
    ]);

    return object.fields.flatMap((field) => {
      if (!fieldNames.has(field.name)) return [];
      assertMigrationField({
        field,
        objectNameSingular: object.nameSingular,
        migrationApplicationId,
      });

      return [
        {
          id: field.id,
          objectNameSingular:
            object.nameSingular as SurvivingMigratedObjectName,
          fieldName: field.name,
        },
      ];
    });
  });
  const fieldsToRename = buildFieldsToRename({
    objectsByName,
    migrationApplicationId,
  });
  const plan = { objectsToDelete, fieldsToDelete, fieldsToRename };

  assertNoUnhandledForbiddenMetadata(objects, plan);

  return plan;
};

const trimmedString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const parseJsonArray = (value: unknown, context: string): unknown[] => {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string')
    throw new Error(`${context} is not a JSON array`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${context} contains invalid JSON`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${context} is not a JSON array`);
  return parsed;
};

const emailSources = (person: WorkspaceRecord): string[] => {
  const primary = trimmedString(person.legacyEmail);
  const secondary = parseJsonArray(
    person.legacySecondaryEmails,
    `person ${person.id} legacySecondaryEmails`,
  ).map((value) => {
    const email = trimmedString(value);
    if (!email)
      throw new Error(`person ${person.id} has invalid secondary email data`);
    return email;
  });

  const seen = new Set<string>();
  return (primary ? [primary, ...secondary] : secondary).filter((email) => {
    const key = email.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const phoneKey = (value: string): string => value.replace(/\D/g, '');

type PhoneSource = { raw: string; baseKey: string; extension?: string };

const phoneSources = (person: WorkspaceRecord): PhoneSource[] => {
  const values = [
    person.legacyPrimaryPhone,
    ...parseJsonArray(
      person.legacySecondaryPhones,
      `person ${person.id} legacySecondaryPhones`,
    ),
  ];

  return values.flatMap((value) => {
    if (value === null || value === undefined || value === '') return [];
    if (typeof value === 'string' && value.trim()) {
      const raw = value.trim();
      const extensionMatch = raw.match(
        /[\s,;]*(?:(?:ext(?:ension)?\.?|x|#)\s*(\d+))\s*$/i,
      );
      const base = extensionMatch
        ? raw.slice(0, extensionMatch.index).trim()
        : raw;
      return [
        {
          raw,
          baseKey: phoneKey(base),
          extension: extensionMatch?.[1],
        },
      ];
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      const number = trimmedString(record.number);
      const callingCode = trimmedString(record.callingCode) ?? '';
      if (number) {
        return [
          {
            raw: `${callingCode}${number}`,
            baseKey: phoneKey(`${callingCode}${number}`),
          },
        ];
      }
    }
    throw new Error(`person ${person.id} has invalid secondary phone data`);
  });
};

const normalizedHttpUrl = (value: unknown): string | undefined => {
  const raw = trimmedString(value);
  if (!raw) return undefined;
  const candidate = /^(?:www\.)?linkedin\.com(?:[/?#]|$)/i.test(raw)
    ? `https://${raw}`
    : raw;

  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
      return undefined;
    }
    parsed.search = '';
    parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.href.replace(/\/$/, '');
  } catch {
    return undefined;
  }
};

export const assertPeopleContactValuesCanonicalized = (
  people: WorkspaceRecord[],
): void => {
  for (const person of people) {
    const residualLines = new Set(
      (trimmedString(person.otherContactDetails) ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    );
    const emails = (person.emails ?? {}) as Record<string, unknown>;
    const canonicalEmails = [
      emails.primaryEmail,
      ...(Array.isArray(emails.additionalEmails)
        ? emails.additionalEmails
        : []),
    ]
      .map(trimmedString)
      .filter((value): value is string => Boolean(value))
      .map((email) => email.toLocaleLowerCase());
    if (
      emailSources(person).some(
        (email) =>
          !canonicalEmails.includes(email.toLocaleLowerCase()) &&
          !residualLines.has(`Email: ${email}`),
      )
    ) {
      throw new Error(
        `person ${person.id} contact cleanup blocked: Emails does not contain every imported email`,
      );
    }

    const phones = (person.phones ?? {}) as Record<string, unknown>;
    const canonicalPhoneKeys = [
      phoneKey(
        `${trimmedString(phones.primaryPhoneCallingCode) ?? ''}${trimmedString(phones.primaryPhoneNumber) ?? ''}`,
      ),
      ...(Array.isArray(phones.additionalPhones)
        ? phones.additionalPhones.map((value) => {
            if (!value || typeof value !== 'object' || Array.isArray(value))
              return '';
            const phone = value as Record<string, unknown>;
            return phoneKey(
              `${trimmedString(phone.callingCode) ?? ''}${trimmedString(phone.number) ?? ''}`,
            );
          })
        : []),
    ].filter(Boolean);
    if (
      phoneSources(person).some(({ raw, baseKey, extension }) => {
        const baseIsCanonical =
          baseKey.length > 0 &&
          canonicalPhoneKeys.some(
            (canonical) =>
              canonical === baseKey ||
              canonical.endsWith(baseKey) ||
              baseKey.endsWith(canonical),
          );
        if (!baseIsCanonical) return !residualLines.has(`Phone: ${raw}`);
        return Boolean(
          extension && !residualLines.has(`Phone extension: ${raw}`),
        );
      })
    ) {
      throw new Error(
        `person ${person.id} contact cleanup blocked: Phones does not contain every imported phone`,
      );
    }

    const rawLegacyLinkedin = trimmedString(person.legacyLinkedInUrl);
    const legacyLinkedin = normalizedHttpUrl(rawLegacyLinkedin);
    if (rawLegacyLinkedin) {
      const linkedin = (person.linkedinLink ?? {}) as Record<string, unknown>;
      const canonicalLinkedinUrls = [
        linkedin.primaryLinkUrl,
        ...(Array.isArray(linkedin.secondaryLinks)
          ? linkedin.secondaryLinks.map((value) =>
              value && typeof value === 'object' && !Array.isArray(value)
                ? (value as Record<string, unknown>).url
                : undefined,
            )
          : []),
      ]
        .map(normalizedHttpUrl)
        .filter((value): value is string => Boolean(value));
      if (
        (!legacyLinkedin || !canonicalLinkedinUrls.includes(legacyLinkedin)) &&
        !residualLines.has(`LinkedIn: ${rawLegacyLinkedin}`)
      ) {
        throw new Error(
          `person ${person.id} contact cleanup blocked: LinkedIn does not contain the imported URL`,
        );
      }
    }
  }
};

const normalizedHostname = (value: unknown): string | undefined => {
  const raw = trimmedString(value);
  if (!raw) return undefined;
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname
      .toLocaleLowerCase()
      .replace(/^www\./, '');
  } catch {
    return undefined;
  }
};

export const assertCompanyValuesCanonicalized = (
  companies: WorkspaceRecord[],
  sourceRecords: WorkspaceRecord[],
): void => {
  const confidenceNotesByCompanyId = new Map<string, string[]>();
  for (const sourceRecord of sourceRecords) {
    const companyId = trimmedString(sourceRecord.companyId);
    if (!companyId) continue;
    let rawData: unknown = sourceRecord.rawData;
    if (typeof rawData === 'string') {
      try {
        rawData = JSON.parse(rawData);
      } catch {
        continue;
      }
    }
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      continue;
    }
    const confidenceNote = trimmedString(
      (rawData as Record<string, unknown>)['notes / source confidence'],
    );
    if (!confidenceNote) continue;
    confidenceNotesByCompanyId.set(companyId, [
      ...(confidenceNotesByCompanyId.get(companyId) ?? []),
      confidenceNote,
    ]);
  }

  for (const company of companies) {
    if (trimmedString(company.fetchNotes)) {
      throw new Error(
        `company ${company.id} cleanup blocked: Fetch Notes is not empty`,
      );
    }
    if (
      trimmedString(company.legacyOwnerId) &&
      !trimmedString(company.historicalOwnerId)
    ) {
      throw new Error(
        `company ${company.id} cleanup blocked: historicalOwner is not canonicalized`,
      );
    }

    const address = (company.address ?? {}) as Record<string, unknown>;
    const sourceCountry = trimmedString(company.country);
    if (
      sourceCountry &&
      trimmedString(address.addressCountry)?.toLocaleLowerCase() !==
        sourceCountry.toLocaleLowerCase()
    ) {
      throw new Error(
        `company ${company.id} cleanup blocked: Source Country is not preserved in Address`,
      );
    }
    if (company.locationIsManual === true) {
      throw new Error(
        `company ${company.id} cleanup blocked: a manual location marker still requires canonicalization`,
      );
    }

    const legacyWebsite = trimmedString(company.legacyWebsite);
    if (legacyWebsite) {
      const domainName = (company.domainName ?? {}) as Record<string, unknown>;
      const canonicalHostnames = [
        domainName.primaryLinkUrl,
        ...(Array.isArray(domainName.secondaryLinks)
          ? domainName.secondaryLinks.map((value) =>
              value && typeof value === 'object' && !Array.isArray(value)
                ? (value as Record<string, unknown>).url
                : undefined,
            )
          : []),
      ]
        .map(normalizedHostname)
        .filter((value): value is string => Boolean(value));
      const legacyHostname = normalizedHostname(legacyWebsite);
      const isPreserved =
        (legacyHostname
          ? canonicalHostnames.includes(legacyHostname)
          : false) ||
        (trimmedString(company.websiteNotes) ?? '').includes(legacyWebsite);
      if (!isPreserved) {
        throw new Error(
          `company ${company.id} cleanup blocked: domainName does not contain the imported website`,
        );
      }
    }

    const sourceDescription = trimmedString(company.fetchDescription);
    const description = trimmedString(company.description);
    const isSourceConfidenceCommentary = (
      confidenceNotesByCompanyId.get(company.id) ?? []
    ).includes(sourceDescription ?? '');
    if (
      sourceDescription &&
      description !== sourceDescription &&
      !isSourceConfidenceCommentary
    ) {
      throw new Error(
        `company ${company.id} cleanup blocked: Description classification is incomplete`,
      );
    }
  }
};

const assertCleanupComplete = (objects: MetadataObject[]): void => {
  if (
    objects.some(({ nameSingular }) =>
      CLEANUP_OBJECT_NAMES.includes(nameSingular as CleanupObjectName),
    )
  ) {
    throw new Error('Migration-only objects remain after cleanup');
  }

  for (const object of objects) {
    if (
      FORBIDDEN_METADATA_PATTERN.test(
        `${object.nameSingular} ${object.namePlural} ${object.labelSingular} ${object.labelPlural ?? ''}`,
      )
    ) {
      throw new Error(
        `Forbidden migration metadata remains on ${object.nameSingular}`,
      );
    }
    const forbiddenField = object.fields.find(({ name, label }) =>
      FORBIDDEN_METADATA_PATTERN.test(`${name} ${label}`),
    );
    if (forbiddenField) {
      throw new Error(
        `Forbidden migration metadata remains on ${object.nameSingular}.${forbiddenField.name}`,
      );
    }
  }
};

const cleanupOperations = (
  plan: MetadataCleanupPlan,
): MetadataCleanupOperation[] => [
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
  ...plan.fieldsToRename.map(({ id, objectNameSingular, oldName, name }) => ({
    key: `rename-field:${id}`,
    kind: 'rename-field' as const,
    id,
    target: `${objectNameSingular}.${oldName}->${name}`,
  })),
];

const assertResumeJournalMatchesPlan = (
  journal: MetadataCleanupJournal,
  operations: MetadataCleanupOperation[],
): void => {
  const originalOperations = new Map(
    journal.operations.map((operation) => [operation.key, operation]),
  );
  if (originalOperations.size !== journal.operations.length) {
    throw new Error('Cleanup resume journal contains duplicate operations');
  }
  for (const key of journal.completedOperationKeys) {
    if (!originalOperations.has(key)) {
      throw new Error('Cleanup resume journal contains an unknown checkpoint');
    }
  }
  for (const operation of operations) {
    const original = originalOperations.get(operation.key);
    if (!original || JSON.stringify(original) !== JSON.stringify(operation)) {
      throw new Error(
        `Cleanup resume plan contains unexpected operation ${operation.key}`,
      );
    }
  }
};

export const runFetchMetadataCleanup = async (
  api: MetadataCleanupApi,
): Promise<MetadataCleanupPlan> => {
  const plan = buildFetchMetadataCleanupPlan(await api.listMetadataObjects());
  const operations = cleanupOperations(plan);
  const previousJournal = await api.readCleanupJournal();
  const isResume = previousJournal?.status === 'running';
  let preflightEvidence = previousJournal?.preflightEvidence;

  if (isResume) {
    assertResumeJournalMatchesPlan(previousJournal, operations);
  } else {
    if (previousJournal?.status === 'complete' && operations.length > 0) {
      throw new Error(
        'Completed cleanup journal conflicts with current metadata',
      );
    }
    if (operations.length > 0) {
      preflightEvidence = await api.assertCanonicalizationComplete();
    }
  }
  if (operations.length > 0) await api.assertNoWorkflowReferences(plan);

  const journal: MetadataCleanupJournal =
    isResume && previousJournal
      ? structuredClone(previousJournal)
      : {
          schemaVersion: 1,
          status: operations.length > 0 ? 'running' : 'complete',
          operations,
          completedOperationKeys: [],
          preflightEvidence: preflightEvidence ?? {
            rowCoverageHash: '',
            businessContentHash: '',
            sourceRecordCount: 0,
            importReviewItemCount: 0,
            companyCount: 0,
            peopleCount: 0,
            taskCount: 0,
            taskTargetCount: 0,
            wholesalerCount: 0,
            leadAssignmentCount: 0,
            outreachActivityCount: 0,
            holdingObservationCount: 0,
            archivedOutreachActivityCount: 0,
          },
        };
  await api.writeCleanupJournal(journal);

  const recordCompletedOperation = async (key: string): Promise<void> => {
    if (!journal.completedOperationKeys.includes(key)) {
      journal.completedOperationKeys.push(key);
    }
    await api.writeCleanupJournal(journal);
  };

  for (const object of plan.objectsToDelete) {
    await api.deleteMetadataObject(object.id);
    await recordCompletedOperation(`delete-object:${object.id}`);
  }
  for (const field of plan.fieldsToDelete) {
    await api.deleteMetadataField(field.id);
    await recordCompletedOperation(`delete-field:${field.id}`);
  }
  for (const field of plan.fieldsToRename) {
    await api.updateMetadataField(field.id, {
      name: field.name,
      label: field.label,
    });
    await recordCompletedOperation(`rename-field:${field.id}`);
  }

  const postconditionObjects = await api.listMetadataObjects();
  assertCleanupComplete(postconditionObjects);
  const postconditionPlan = buildFetchMetadataCleanupPlan(postconditionObjects);
  if (
    postconditionPlan.objectsToDelete.length > 0 ||
    postconditionPlan.fieldsToDelete.length > 0 ||
    postconditionPlan.fieldsToRename.length > 0
  ) {
    throw new Error('Fetch metadata cleanup postcondition failed');
  }

  journal.status = 'complete';
  await api.writeCleanupJournal(journal);

  return plan;
};

export const cleanupContract = {
  objectNames: CLEANUP_OBJECT_NAMES,
  survivingObjectNames: SURVIVING_MIGRATED_OBJECT_NAMES,
  provenanceFieldNames: PROVENANCE_FIELD_NAMES,
  additionalFieldsToDelete: ADDITIONAL_FIELDS_TO_DELETE,
  preservedFields: PRESERVED_FIELDS,
  retainedFieldRenames: RETAINED_FIELD_RENAMES,
  forbiddenMetadataPattern: FORBIDDEN_METADATA_PATTERN,
} as const;

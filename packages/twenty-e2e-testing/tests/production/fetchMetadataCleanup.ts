const CLEANUP_OBJECT_NAMES = [
  'archivedOutreachActivity',
  'importReviewItem',
  'importBatch',
  'sourceRecord',
  'teamMembership',
  'salesTeam',
] as const;

const SURVIVING_MIGRATED_OBJECT_NAMES = [
  'company',
  'person',
  'task',
  'taskTarget',
  'wholesaler',
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
  company: [
    'name',
    'address',
    'historicalOwner',
    'geography',
    'description',
    'unformattedWebsite',
  ],
  person: ['name', 'company', 'emails', 'phones', 'linkedinLink'],
  task: ['title'],
  taskTarget: ['task', 'targetCompany'],
  wholesaler: ['name'],
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

const EMPTY_ONLY_OBJECT_NAMES = ['salesTeam', 'teamMembership'] as const;
const RESOLVED_REVIEW_STATUSES = new Set([
  'accepted',
  'approved',
  'completed',
  'dismissed',
  'ignored',
  'rejected',
  'resolved',
]);
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

  return [
    ...new Set(
      (primary ? [primary, ...secondary] : secondary).map((email) =>
        email.toLocaleLowerCase(),
      ),
    ),
  ];
};

const phoneKey = (value: string): string => value.replace(/\D/g, '');

const phoneSources = (person: WorkspaceRecord): string[] => {
  const values = [
    person.legacyPrimaryPhone,
    ...parseJsonArray(
      person.legacySecondaryPhones,
      `person ${person.id} legacySecondaryPhones`,
    ),
  ];

  return values.flatMap((value) => {
    if (value === null || value === undefined || value === '') return [];
    if (typeof value === 'string' && value.trim()) return [phoneKey(value)];
    if (typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      const number = trimmedString(record.number);
      const callingCode = trimmedString(record.callingCode) ?? '';
      if (number) return [phoneKey(`${callingCode}${number}`)];
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
    return new URL(candidate).href;
  } catch {
    return raw;
  }
};

export const assertPeopleContactValuesCanonicalized = (
  people: WorkspaceRecord[],
): void => {
  for (const person of people) {
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
      emailSources(person).some((email) => !canonicalEmails.includes(email))
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
      phoneSources(person).some(
        (source) =>
          source &&
          !canonicalPhoneKeys.some(
            (canonical) =>
              canonical === source ||
              canonical.endsWith(source) ||
              source.endsWith(canonical),
          ),
      )
    ) {
      throw new Error(
        `person ${person.id} contact cleanup blocked: Phones does not contain every imported phone`,
      );
    }

    const legacyLinkedin = normalizedHttpUrl(person.legacyLinkedInUrl);
    if (legacyLinkedin) {
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
      if (!canonicalLinkedinUrls.includes(legacyLinkedin)) {
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
      const isPreserved = legacyHostname
        ? canonicalHostnames.includes(legacyHostname)
        : trimmedString(company.unformattedWebsite) === legacyWebsite;
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

const HOLDING_RAW_FIELD_BY_NORMALIZED_KEY: Record<string, string[]> = {
  product: ['productName'],
  productname: ['productName'],
  filer: ['filerName'],
  filername: ['filerName'],
  filerid: ['filerId'],
  cik: ['cik'],
  crd: ['crd'],
  city: ['city'],
  state: ['stateRegion'],
  stateregion: ['stateRegion'],
  shares: ['sharesHeld'],
  sharesheld: ['sharesHeld'],
  marketvalue: ['marketValue'],
  portfolio: ['portfolioPercent'],
  portfoliopercent: ['portfolioPercent'],
  percentofportfolio: ['portfolioPercent'],
  ownership: ['ownershipPercent'],
  ownershippercent: ['ownershipPercent'],
  percentownership: ['ownershipPercent'],
  avgprice: ['averagePrice'],
  averageprice: ['averagePrice'],
  changeinshares: ['shareChange'],
  sharechange: ['shareChange'],
  percentchange: ['shareChangePercent'],
  sharechangepercent: ['shareChangePercent'],
  priorofportfolio: ['previousPortfolioPercent'],
  priorportfoliopercent: ['previousPortfolioPercent'],
  priorpercentofportfolio: ['previousPortfolioPercent'],
  qtrfirstowned: ['firstOwnedQuarter'],
  firstownedquarter: ['firstOwnedQuarter'],
  ranking: ['ranking'],
  priorranking: ['previousRanking'],
  previousranking: ['previousRanking'],
  sourcedate: ['sourceDate', 'asOfDate'],
  asofdate: ['sourceDate', 'asOfDate'],
  '13f': ['form13f'],
  form13f: ['form13f'],
};

const normalizedRawKey = (value: string): string =>
  value
    .toLocaleLowerCase()
    .replace(/%/g, ' percent ')
    .replace(/[^a-z0-9]+/g, '');

const comparableValue = (value: unknown): string | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (typeof value !== 'string') return JSON.stringify(value);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed.replace(/[$,%\s]/g, ''));
  return Number.isFinite(numeric)
    ? String(numeric)
    : trimmed.toLocaleLowerCase();
};

export const assertHoldingRawDataCanonicalized = (
  holdings: WorkspaceRecord[],
): void => {
  for (const holding of holdings) {
    if (
      holding.rawData === null ||
      holding.rawData === undefined ||
      holding.rawData === ''
    ) {
      continue;
    }
    let rawData: unknown = holding.rawData;
    if (typeof rawData === 'string') {
      try {
        rawData = JSON.parse(rawData);
      } catch {
        throw new Error(
          `holdingObservation ${holding.id} cleanup blocked: rawData is invalid JSON`,
        );
      }
    }
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      throw new Error(
        `holdingObservation ${holding.id} cleanup blocked: rawData is not an object`,
      );
    }

    for (const [rawKey, rawValue] of Object.entries(rawData)) {
      const comparableRawValue = comparableValue(rawValue);
      if (comparableRawValue === undefined) continue;
      const targetFields =
        HOLDING_RAW_FIELD_BY_NORMALIZED_KEY[normalizedRawKey(rawKey)];
      if (
        !targetFields ||
        !targetFields.some(
          (fieldName) =>
            comparableValue(holding[fieldName]) === comparableRawValue,
        )
      ) {
        throw new Error(
          `holdingObservation ${holding.id} cleanup blocked: rawData field ${rawKey} is not canonicalized`,
        );
      }
    }
  }
};

const assertCleanupObjectRecordsAreSafe = async (
  api: MetadataCleanupApi,
  plan: MetadataCleanupPlan,
): Promise<void> => {
  const cleanupObjectByName = new Map(
    plan.objectsToDelete.map((object) => [object.nameSingular, object]),
  );

  for (const objectName of EMPTY_ONLY_OBJECT_NAMES) {
    const object = cleanupObjectByName.get(objectName);
    if (!object) continue;
    if ((await api.listRecords(object.namePlural)).length > 0) {
      throw new Error(
        `Refusing to delete non-empty migration-only object ${objectName}`,
      );
    }
  }

  const reviewObject = cleanupObjectByName.get('importReviewItem');
  if (!reviewObject) return;
  const reviewItems = await api.listRecords(reviewObject.namePlural);
  const unresolvedCount = reviewItems.filter((item) => {
    const status = trimmedString(item.reviewStatus)?.toLocaleLowerCase();
    if (
      !status ||
      status === 'pending' ||
      !RESOLVED_REVIEW_STATUSES.has(status)
    ) {
      return true;
    }
    return (
      ['accepted', 'approved', 'completed', 'resolved'].includes(status) &&
      !trimmedString(item.candidateCompanyId)
    );
  }).length;

  if (unresolvedCount > 0) {
    throw new Error(
      `Refusing to delete Import Review Items: ${unresolvedCount} unresolved row(s) must be canonicalized first`,
    );
  }
};

const hasPersonContactFields = (plan: MetadataCleanupPlan): boolean =>
  plan.fieldsToDelete.some(
    ({ objectNameSingular, fieldName }) =>
      objectNameSingular === 'person' &&
      [
        'legacyEmail',
        'legacyPrimaryPhone',
        'legacyLinkedInUrl',
        'legacySecondaryEmails',
        'legacySecondaryPhones',
      ].includes(fieldName),
  );

const hasCompanyCanonicalizationFields = (plan: MetadataCleanupPlan): boolean =>
  plan.fieldsToDelete.some(
    ({ objectNameSingular, fieldName }) =>
      objectNameSingular === 'company' &&
      [
        'fetchDescription',
        'fetchNotes',
        'legacyOwnerId',
        'legacyWebsite',
      ].includes(fieldName),
  );

const hasHoldingRawDataField = (plan: MetadataCleanupPlan): boolean =>
  plan.fieldsToDelete.some(
    ({ objectNameSingular, fieldName }) =>
      objectNameSingular === 'holdingObservation' && fieldName === 'rawData',
  );

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

export const runFetchMetadataCleanup = async (
  api: MetadataCleanupApi,
): Promise<MetadataCleanupPlan> => {
  const plan = buildFetchMetadataCleanupPlan(await api.listMetadataObjects());

  await assertCleanupObjectRecordsAreSafe(api, plan);
  if (hasPersonContactFields(plan)) {
    assertPeopleContactValuesCanonicalized(await api.listRecords('people'));
  }
  if (hasCompanyCanonicalizationFields(plan)) {
    const sourceRecordObject = plan.objectsToDelete.find(
      ({ nameSingular }) => nameSingular === 'sourceRecord',
    );
    assertCompanyValuesCanonicalized(
      await api.listRecords('companies'),
      sourceRecordObject
        ? await api.listRecords(sourceRecordObject.namePlural)
        : [],
    );
  }
  if (hasHoldingRawDataField(plan)) {
    assertHoldingRawDataCanonicalized(
      await api.listRecords('holdingObservations'),
    );
  }

  for (const object of plan.objectsToDelete) {
    await api.deleteMetadataObject(object.id);
  }
  for (const field of plan.fieldsToDelete) {
    await api.deleteMetadataField(field.id);
  }
  for (const field of plan.fieldsToRename) {
    await api.updateMetadataField(field.id, {
      name: field.name,
      label: field.label,
    });
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

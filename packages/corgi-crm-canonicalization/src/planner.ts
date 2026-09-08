import { createHash } from 'node:crypto';

import {
  canonicalContentKey,
  canonicalRowKey,
  normalizeDomain,
  normalizeEmail,
  normalizeKey,
  normalizeLinkedIn,
  normalizePhone,
  parseRawData,
  stableStringify,
  textValue,
} from './normalization.ts';

export type CrmRecord = { id: string } & Record<string, unknown>;

export type CanonicalizationSnapshot = {
  companies: CrmRecord[];
  people: CrmRecord[];
  sourceRecords: CrmRecord[];
  importReviewItems: CrmRecord[];
  holdingObservations: CrmRecord[];
  tasks: CrmRecord[];
  taskTargets: CrmRecord[];
  wholesalers: CrmRecord[];
  leadAssignments: CrmRecord[];
  outreachActivities: CrmRecord[];
  archivedOutreachActivities: CrmRecord[];
};

export type RecordMutation = {
  objectPlural: string;
  id: string;
  data: Record<string, unknown>;
};

export type UnresolvedItem = {
  code: string;
  rowKey: string;
};

export type RawKeyDisposition = {
  rowKey: string;
  key: string;
  kind: 'canonical' | 'identity' | 'ignored';
  target: string;
  sourceValueHash: string;
  resultValueHash?: string;
};

export type CanonicalizationPlan = {
  mutations: RecordMutation[];
  unresolved: UnresolvedItem[];
  dispositions: RawKeyDisposition[];
  summary: {
    inputRows: number;
    semanticRows: number;
    duplicateRows: number;
    normalizedKeyCoalesces: number;
    mutations: number;
  };
};

type StagingRow = {
  record: CrmRecord;
  rawData: Record<string, unknown>;
  rowKey: string;
  contentKey: string;
  priority: number;
};

type RecordAccumulator = {
  record: CrmRecord;
  data: Record<string, unknown>;
  facts: Map<string, Set<string>>;
  residualContacts?: Set<string>;
};

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const valueAt = (
  record: Record<string, unknown>,
  currentName: string,
  previousName?: string,
): unknown =>
  record[currentName] !== undefined
    ? record[currentName]
    : previousName
      ? record[previousName]
      : undefined;

const valuesEqual = (left: unknown, right: unknown): boolean => {
  if (left === undefined || right === undefined) return left === right;

  return stableStringify(left) === stableStringify(right);
};

const setIfChanged = (
  accumulator: RecordAccumulator,
  name: string,
  value: unknown,
  previousName?: string,
): void => {
  if (!valuesEqual(valueAt(accumulator.record, name, previousName), value)) {
    accumulator.data[name] = value;
  }
};

const effectiveValue = (
  accumulator: RecordAccumulator,
  name: string,
  previousName?: string,
): unknown =>
  Object.prototype.hasOwnProperty.call(accumulator.data, name)
    ? accumulator.data[name]
    : valueAt(accumulator.record, name, previousName);

const isEmptyValue = (value: unknown): boolean =>
  value === undefined || value === null || value === '';

const setPreservingNative = (
  accumulator: RecordAccumulator,
  name: string,
  value: unknown,
  unresolved: UnresolvedItem[],
  rowKey: string,
  conflictCode: string,
  previousName?: string,
): void => {
  const current = effectiveValue(accumulator, name, previousName);
  if (isEmptyValue(current)) {
    setIfChanged(accumulator, name, value, previousName);
    return;
  }
  if (!valuesEqual(current, value)) {
    unresolved.push({ code: conflictCode, rowKey });
  }
};

const mergeFact = (
  accumulator: RecordAccumulator,
  name: string,
  value: unknown,
): void => {
  const text = textValue(value);
  if (!text) return;

  const existing = asString(valueAt(accumulator.record, name));
  const values = accumulator.facts.get(name) ?? new Set<string>();
  for (const existingValue of existing?.split('\n').filter(Boolean) ?? []) {
    values.add(existingValue);
  }
  values.add(text);
  accumulator.facts.set(name, values);
};

const finalizeFacts = (accumulator: RecordAccumulator): void => {
  for (const [name, values] of accumulator.facts) {
    setIfChanged(accumulator, name, [...values].sort().join('\n'));
  }
  if (accumulator.residualContacts && accumulator.residualContacts.size > 0) {
    const existing = asString(
      valueAt(accumulator.record, 'otherContactDetails'),
    );
    const lines = new Set([
      ...(existing?.split('\n').filter(Boolean) ?? []),
      ...accumulator.residualContacts,
    ]);
    setIfChanged(
      accumulator,
      'otherContactDetails',
      [...lines].sort().join('\n'),
    );
  }
};

const stableUuid = (kind: string, key: string): string => {
  const bytes = createHash('sha256')
    .update(`${kind}\0${key}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const valueHash = (value: unknown): string =>
  createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');

const rawIndex = (rawData: Record<string, unknown>) => {
  const index = new Map<string, unknown>();
  let coalesces = 0;

  for (const [key, value] of Object.entries(rawData)) {
    const normalized = normalizeKey(key);
    if (index.has(normalized)) {
      if (!valuesEqual(index.get(normalized), value)) {
        throw new Error(`Conflicting normalized raw key ${normalized}`);
      }
      coalesces += 1;
    } else {
      index.set(normalized, value);
    }
  }

  return { index, coalesces };
};

const rawValue = (
  index: ReadonlyMap<string, unknown>,
  ...aliases: string[]
): unknown => {
  for (const alias of aliases) {
    const value = index.get(normalizeKey(alias));
    if (textValue(value)) return value;
  }

  return null;
};

const jsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [value];
  }
};

const emailValues = (record: CrmRecord): string[] => {
  const emails = record.emails as
    | { primaryEmail?: unknown; additionalEmails?: unknown }
    | undefined;

  return [
    emails?.primaryEmail,
    ...(Array.isArray(emails?.additionalEmails) ? emails.additionalEmails : []),
    record.legacyEmail,
    ...jsonArray(record.legacySecondaryEmails),
  ]
    .map(normalizeEmail)
    .filter((value): value is string => !!value);
};

const phoneValues = (record: CrmRecord): string[] => {
  const phones = record.phones as
    | {
        primaryPhoneNumber?: unknown;
        additionalPhones?: Array<{ number?: unknown }>;
      }
    | undefined;

  return [
    phones?.primaryPhoneNumber,
    ...(phones?.additionalPhones?.map(({ number }) => number) ?? []),
    record.legacyPrimaryPhone,
    ...jsonArray(record.legacySecondaryPhones),
  ]
    .map(normalizePhone)
    .filter((value): value is NonNullable<typeof value> => !!value)
    .map(({ number }) => number);
};

const linkedinValue = (record: CrmRecord): string | null => {
  const link = record.linkedinLink as { primaryLinkUrl?: unknown } | undefined;

  return (
    normalizeLinkedIn(link?.primaryLinkUrl) ??
    normalizeLinkedIn(record.legacyLinkedInUrl)
  );
};

const addOwner = (
  owners: Map<string, Set<string>>,
  value: string,
  recordId: string,
): void => {
  owners.set(value, new Set([...(owners.get(value) ?? []), recordId]));
};

const ownerIndexes = (people: readonly CrmRecord[]) => {
  const emails = new Map<string, Set<string>>();
  const phones = new Map<string, Set<string>>();
  const linkedin = new Map<string, Set<string>>();

  for (const person of people) {
    for (const value of emailValues(person)) addOwner(emails, value, person.id);
    for (const value of phoneValues(person)) addOwner(phones, value, person.id);
    const linkedIn = linkedinValue(person);
    if (linkedIn) addOwner(linkedin, linkedIn, person.id);
  }

  return { emails, phones, linkedin };
};

const nativeEmailShape = (record: CrmRecord) => {
  const current = record.emails as
    | { primaryEmail?: unknown; additionalEmails?: unknown }
    | undefined;

  return {
    primaryEmail: asString(current?.primaryEmail) ?? '',
    additionalEmails: Array.isArray(current?.additionalEmails)
      ? current.additionalEmails.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
  };
};

const nativePhoneShape = (record: CrmRecord) => {
  const current = record.phones as
    | {
        primaryPhoneNumber?: unknown;
        primaryPhoneCountryCode?: unknown;
        primaryPhoneCallingCode?: unknown;
        additionalPhones?: unknown;
      }
    | undefined;

  return {
    primaryPhoneNumber: asString(current?.primaryPhoneNumber) ?? '',
    primaryPhoneCountryCode: asString(current?.primaryPhoneCountryCode) ?? '',
    primaryPhoneCallingCode: asString(current?.primaryPhoneCallingCode) ?? '',
    additionalPhones: Array.isArray(current?.additionalPhones)
      ? (current.additionalPhones as Array<Record<string, unknown>>).map(
          (phone) => ({ ...phone }),
        )
      : [],
  };
};

type LinkShape = {
  primaryLinkLabel: string;
  primaryLinkUrl: string;
  secondaryLinks: Array<Record<string, unknown>>;
};

const nativeLinkShape = (record: CrmRecord): LinkShape => {
  const current = record.linkedinLink as
    | {
        primaryLinkLabel?: unknown;
        primaryLinkUrl?: unknown;
        secondaryLinks?: unknown;
      }
    | undefined;

  return {
    primaryLinkLabel: asString(current?.primaryLinkLabel) ?? '',
    primaryLinkUrl: asString(current?.primaryLinkUrl) ?? '',
    secondaryLinks: Array.isArray(current?.secondaryLinks)
      ? (current.secondaryLinks as Array<Record<string, unknown>>).map(
          (link) => ({ ...link }),
        )
      : [],
  };
};

const mergeLinkedIn = (
  accumulator: RecordAccumulator,
  original: string,
  owners: ReturnType<typeof ownerIndexes>,
): void => {
  const normalized = normalizeLinkedIn(original);
  if (!normalized) {
    accumulator.residualContacts!.add(`LinkedIn: ${original}`);
    return;
  }
  const holders = owners.linkedin.get(normalized) ?? new Set<string>();
  if ([...holders].some((id) => id !== accumulator.record.id)) {
    accumulator.residualContacts!.add(`LinkedIn: ${original}`);
    return;
  }

  const effective = {
    ...accumulator.record,
    ...accumulator.data,
    id: accumulator.record.id,
  };
  const link = nativeLinkShape(effective);
  const primaryNormalized = normalizeLinkedIn(link.primaryLinkUrl);
  const hasSecondary = link.secondaryLinks.some((secondary) =>
    [secondary.url, secondary.primaryLinkUrl].some(
      (value) => normalizeLinkedIn(value) === normalized,
    ),
  );
  if (!link.primaryLinkUrl) {
    link.primaryLinkLabel = 'LinkedIn';
    link.primaryLinkUrl = normalized;
  } else if (primaryNormalized !== normalized && !hasSecondary) {
    link.secondaryLinks.push({ label: 'LinkedIn', url: normalized });
  }
  setIfChanged(accumulator, 'linkedinLink', link);
  addOwner(owners.linkedin, normalized, accumulator.record.id);
};

const mergeLegacyContacts = (
  people: readonly CrmRecord[],
  accumulators: Map<string, RecordAccumulator>,
): ReturnType<typeof ownerIndexes> => {
  const owners = ownerIndexes(people);

  for (const person of [...people].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const accumulator = accumulators.get(person.id)!;
    const emails = nativeEmailShape(person);
    const emailCandidates = [
      person.legacyEmail,
      ...jsonArray(person.legacySecondaryEmails),
    ];

    for (const candidate of emailCandidates) {
      const original = textValue(candidate);
      if (!original) continue;
      const normalized = normalizeEmail(candidate);
      if (!normalized) {
        accumulator.residualContacts!.add(`Email: ${original}`);
        continue;
      }
      const holders = owners.emails.get(normalized) ?? new Set<string>();
      if ([...holders].some((id) => id !== person.id)) {
        accumulator.residualContacts!.add(`Email: ${original}`);
        continue;
      }
      if (!emails.primaryEmail) emails.primaryEmail = normalized;
      else if (
        emails.primaryEmail !== normalized &&
        !emails.additionalEmails.includes(normalized)
      ) {
        emails.additionalEmails.push(normalized);
      }
      addOwner(owners.emails, normalized, person.id);
    }
    emails.additionalEmails.sort();
    setIfChanged(accumulator, 'emails', emails);

    const phones = nativePhoneShape(person);
    const phoneCandidates = [
      person.legacyPrimaryPhone,
      ...jsonArray(person.legacySecondaryPhones),
    ];
    for (const candidate of phoneCandidates) {
      const original = textValue(candidate);
      if (!original) continue;
      const normalized = normalizePhone(candidate);
      if (!normalized) {
        accumulator.residualContacts!.add(`Phone: ${original}`);
        continue;
      }
      if (normalized.extension) {
        accumulator.residualContacts!.add(`Phone extension: ${original}`);
      }
      const holders = owners.phones.get(normalized.number) ?? new Set<string>();
      if ([...holders].some((id) => id !== person.id)) {
        accumulator.residualContacts!.add(`Phone: ${original}`);
        continue;
      }
      const additional = phones.additionalPhones as Array<
        Record<string, unknown>
      >;
      if (!phones.primaryPhoneNumber) {
        phones.primaryPhoneNumber = normalized.number;
        phones.primaryPhoneCountryCode = normalized.countryCode;
        phones.primaryPhoneCallingCode = normalized.callingCode;
      } else if (
        phones.primaryPhoneNumber !== normalized.number &&
        !additional.some(({ number }) => number === normalized.number)
      ) {
        additional.push({
          number: normalized.number,
          countryCode: normalized.countryCode,
          callingCode: normalized.callingCode,
        });
      }
      addOwner(owners.phones, normalized.number, person.id);
    }
    (phones.additionalPhones as Array<Record<string, unknown>>).sort(
      (left, right) => String(left.number).localeCompare(String(right.number)),
    );
    setIfChanged(accumulator, 'phones', phones);

    const originalLinkedIn = textValue(person.legacyLinkedInUrl);
    if (originalLinkedIn) {
      mergeLinkedIn(accumulator, originalLinkedIn, owners);
    }
  }

  return owners;
};

const mapOfUniqueOwners = (
  records: readonly CrmRecord[],
  getValues: (record: CrmRecord) => string[],
): Map<string, Set<string>> => {
  const result = new Map<string, Set<string>>();
  for (const record of records) {
    for (const value of getValues(record)) addOwner(result, value, record.id);
  }

  return result;
};

const companyDomainValues = (company: CrmRecord): string[] => {
  const link = company.domainName as { primaryLinkUrl?: unknown } | undefined;
  const values = [link?.primaryLinkUrl, company.legacyWebsite, company.website];

  return values
    .map(normalizeDomain)
    .filter((value): value is string => !!value);
};

const companyNameKey = (name: unknown): string | null =>
  asString(name)?.normalize('NFC').toLowerCase().replace(/\s+/g, ' ') ?? null;

const companyLocationKey = (
  name: unknown,
  city: unknown,
  state: unknown,
): string | null => {
  const normalizedName = companyNameKey(name);
  const normalizedCity = companyNameKey(city);
  const normalizedState = companyNameKey(state);
  if (!normalizedName || (!normalizedCity && !normalizedState)) return null;

  return `${normalizedName}\0${normalizedCity ?? ''}\0${normalizedState ?? ''}`;
};

const companyAddress = (company: CrmRecord): Record<string, unknown> =>
  (company.address as Record<string, unknown> | undefined) ?? {};

const sourceRows = (snapshot: CanonicalizationSnapshot): StagingRow[] => {
  const rows = [
    ...snapshot.sourceRecords.map((record) => ({ record, priority: 1 })),
    ...snapshot.importReviewItems.map((record) => ({
      record,
      priority:
        asString(record.reviewStatus)?.toLowerCase() === 'accepted' ? 0 : 2,
    })),
  ];

  return rows.map(({ record, priority }) => {
    const rawData = parseRawData(record.rawData);

    return {
      record,
      rawData,
      priority,
      rowKey: canonicalRowKey({
        sourceFile: record.sourceFile,
        sourceSheet: record.sourceSheet,
        sourceRow: record.sourceRow,
        rawData,
      }),
      contentKey: canonicalContentKey(rawData),
    };
  });
};

const rowIsPerson = (index: ReadonlyMap<string, unknown>): boolean =>
  !!(
    textValue(rawValue(index, 'first name')) ||
    textValue(rawValue(index, 'last name'))
  );

const rowIsHolding = (index: ReadonlyMap<string, unknown>): boolean =>
  !!(
    textValue(rawValue(index, 'shares held', 'shares')) ||
    textValue(rawValue(index, 'market value')) ||
    (!rowIsPerson(index) && textValue(rawValue(index, 'filer name')))
  );

const productNameFor = (record: CrmRecord): string =>
  asString(record.productName) ??
  asString(record.sourceFile)
    ?.replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/, '') ??
  'Holding';

const holdingIdentityKey = (
  companyId: string,
  productName: string,
  rawData: Record<string, unknown>,
): string => {
  const { index } = rawIndex(rawData);

  return stableStringify({
    companyId,
    product: productName.normalize('NFC').trim().toLowerCase(),
    filerName: companyNameKey(rawValue(index, 'filer name')),
    filerId: companyNameKey(rawValue(index, 'filer id')),
    cik: companyNameKey(rawValue(index, 'filer cik')),
    crd: companyNameKey(rawValue(index, 'filer crd')),
    asOfDate: textValue(rawValue(index, 'source date')),
    shares: numberValue(rawValue(index, 'shares held', 'shares')),
    marketValue: numberValue(rawValue(index, 'market value')),
  });
};

const rowSemanticKey = (row: StagingRow): string => {
  const { index } = rawIndex(row.rawData);

  return rowIsHolding(index)
    ? `${row.contentKey}\0${productNameFor(row.record).normalize('NFC').toLowerCase()}`
    : row.contentKey;
};

const deduplicateRows = (rows: readonly StagingRow[]) => {
  const groups = new Map<string, StagingRow[]>();
  for (const row of rows) {
    const key = rowSemanticKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const selected: StagingRow[] = [];
  const collisions: UnresolvedItem[] = [];
  for (const [semanticKey, candidates] of [...groups].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const companyIds = new Set(
      candidates
        .flatMap(({ record }) => [record.companyId, record.candidateCompanyId])
        .filter(
          (value): value is string => typeof value === 'string' && !!value,
        ),
    );
    if (companyIds.size > 1) {
      collisions.push({
        code: 'CONTENT_IDENTITY_COLLISION',
        rowKey: semanticKey,
      });
      continue;
    }
    selected.push(
      [...candidates].sort(
        (left, right) =>
          left.priority - right.priority ||
          left.rowKey.localeCompare(right.rowKey),
      )[0]!,
    );
  }

  return { selected, collisions };
};

const numberValue = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = asString(value);
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text);
  const normalized = text.replace(/[,$%()\s]/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized) * (negative ? -1 : 1);

  return Number.isFinite(parsed) ? parsed : null;
};

const absoluteWebsite = (value: unknown): string | null => {
  const domain = normalizeDomain(value);
  const text = asString(value);
  if (!domain || !text) return null;

  try {
    const parsed = new URL(text.includes('://') ? text : `https://${text}`);
    parsed.protocol = 'https:';
    parsed.username = '';
    parsed.password = '';

    return parsed.href.replace(/\/$/, '');
  } catch {
    return null;
  }
};

const COMPANY_FACTS: ReadonlyArray<[string, string[]]> = [
  ['assetsUnderManagement', ['firm aum']],
  ['brokerDealerRepresentatives', ['firm bd reps']],
  ['investmentAdviserRepresentatives', ['firm ria reps']],
  ['custodians', ['firm custodians', 'firm tag custodian']],
  ['form13f', ['firm form 13f', 'firm form13f']],
  ['totalAccounts', ['firm total accounts']],
  ['ownership', ['firm ownership']],
  ['accreditedInvestorFocus', ['firm tag accredited investors']],
  ['assetClasses', ['firm tag asset classes']],
  ['clientPersonas', ['firm tag client personas']],
  ['crmSystem', ['firm tag crm']],
  ['fundManagers', ['firm tag fund managers']],
  ['investmentThemes', ['firm tag investment themes']],
  ['investmentVehicles', ['firm tag investment vehicles']],
  ['platform', ['firm tag platform']],
  ['services', ['firm tag services']],
  ['technology', ['firm tag technology']],
  ['familyOfficeType', ['family office type']],
  ['familyOfficeGeneration', ['family office generation']],
  ['familyOfficeWealthOrigin', ['family office wealth source']],
  ['familyOfficeFocus', ['family office focus']],
  ['familyOfficeGeography', ['family office geography']],
];

const PERSON_FACTS: ReadonlyArray<[string, string[]]> = [
  ['profile', ['profile']],
  ['gender', ['gender']],
  ['estimatedAge', ['est age']],
  ['bio', ['bio']],
  ['brokerDealer', ['broker dealer']],
  ['designations', ['designations']],
  ['licensesAndExams', ['licenses exams']],
  ['registrationType', ['registration type', 'registration']],
  ['yearsOfExperience', ['years of experience', 'years experience']],
  ['yearsWithCurrentFirm', ['years with current ria', 'years current ria']],
  ['previousBrokerDealer', ['previous broker dealer']],
  ['previousFirm', ['previous ria', 'previous firms']],
  ['nonAdvisor', ['non advisor']],
  ['secProfile', ['sec link']],
  ['finraProfile', ['finra link']],
  ['metroArea', ['metro area', 'metro']],
  ['teamName', ['named team']],
  ['teamWebsite', ['named team website', 'named team site']],
  ['family', ['person tag family']],
  ['hobbies', ['person tag hobbies']],
  ['militaryService', ['person tag military status']],
  ['school', ['person tag school']],
  ['services', ['person tag services']],
  ['sportsTeams', ['person tag sports teams']],
];

const EMPTY_ONLY_RAW_KEYS = new Set(
  `|connection name|disclosures|email 3|lead score|notes|person tag expertise|person tag faith based investing|person tag greek life|person tag investments|person tag role`.split(
    '|',
  ),
);

const COMPANY_TARGET_BY_KEY: Readonly<Record<string, string>> = {
  address: 'company.address',
  'street address': 'company.address',
  'street address2': 'company.address',
  city: 'company.address',
  state: 'company.address',
  'filer state': 'company.address',
  zip: 'company.address',
  'zip code': 'company.address',
  'firm address': 'company.address',
  'firm city': 'company.address',
  'firm state': 'company.address',
  'firm zip': 'company.address',
  'city hq': 'company.address',
  region: 'company.geography',
  'firm aum': 'company.assetsUnderManagement',
  'firm bd reps': 'company.brokerDealerRepresentatives',
  'firm ria reps': 'company.investmentAdviserRepresentatives',
  'firm custodians': 'company.custodians',
  'firm tag custodian': 'company.custodians',
  'firm form 13f': 'company.form13f',
  'firm form13f': 'company.form13f',
  'firm total accounts': 'company.totalAccounts',
  'firm total employees': 'company.employees',
  'firm ownership': 'company.ownership',
  'firm phone': 'company.firmPhone',
  'firm type': 'company.firmType',
  'type of firm': 'company.firmType',
  'firm website': 'company.domainName',
  website: 'company.domainName',
  'firm tag accredited investors': 'company.accreditedInvestorFocus',
  'firm tag asset classes': 'company.assetClasses',
  'firm tag client personas': 'company.clientPersonas',
  'firm tag crm': 'company.crmSystem',
  'firm tag fund managers': 'company.fundManagers',
  'firm tag investment themes': 'company.investmentThemes',
  'firm tag investment vehicles': 'company.investmentVehicles',
  'firm tag platform': 'company.platform',
  'firm tag services': 'company.services',
  'firm tag technology': 'company.technology',
  'family office type': 'company.familyOfficeType',
  'family office generation': 'company.familyOfficeGeneration',
  'family office wealth source': 'company.familyOfficeWealthOrigin',
  'family office focus': 'company.familyOfficeFocus',
  'family office geography': 'company.familyOfficeGeography',
};

const PERSON_TARGET_BY_KEY: Readonly<Record<string, string>> = {
  profile: 'person.profile',
  address: 'person.streetAddress',
  'street address': 'person.streetAddress',
  city: 'person.city',
  state: 'person.stateRegion',
  zip: 'person.postalCode',
  'zip code': 'person.postalCode',
  gender: 'person.gender',
  'est age': 'person.estimatedAge',
  bio: 'person.bio',
  'broker dealer': 'person.brokerDealer',
  designations: 'person.designations',
  'licenses exams': 'person.licensesAndExams',
  'registration type': 'person.registrationType',
  registration: 'person.registrationType',
  'years of experience': 'person.yearsOfExperience',
  'years experience': 'person.yearsOfExperience',
  'years with current ria': 'person.yearsWithCurrentFirm',
  'years current ria': 'person.yearsWithCurrentFirm',
  'previous broker dealer': 'person.previousBrokerDealer',
  'previous ria': 'person.previousFirm',
  'previous firms': 'person.previousFirm',
  'non advisor': 'person.nonAdvisor',
  'sec link': 'person.secProfile',
  'finra link': 'person.finraProfile',
  'metro area': 'person.metroArea',
  metro: 'person.metroArea',
  'named team': 'person.teamName',
  'named team website': 'person.teamWebsite',
  'named team site': 'person.teamWebsite',
  'named team id': 'person.otherContactDetails',
  'person tag family': 'person.family',
  'person tag hobbies': 'person.hobbies',
  'person tag military status': 'person.militaryService',
  'person tag school': 'person.school',
  'person tag services': 'person.services',
  'person tag sports teams': 'person.sportsTeams',
  title: 'person.jobTitle',
  'email 1': 'person.emails',
  'email 2': 'person.emails',
  'personal email': 'person.emails',
  'mobile phone': 'person.phones',
  mobile: 'person.phones',
  'landline phone': 'person.phones',
  landline: 'person.phones',
  phone: 'person.phones',
  'phone type': 'person.otherContactDetails',
  linkedin: 'person.linkedinLink',
};

const HOLDING_TARGET_BY_KEY: Readonly<Record<string, string>> = {
  'filer name': 'holdingObservation.filerName',
  'filer id': 'holdingObservation.filerId',
  'filer cik': 'holdingObservation.cik',
  'filer crd': 'holdingObservation.crd',
  'filer irs number': 'holdingObservation.filerIrsNumber',
  address: 'holdingObservation.streetAddress',
  'street address': 'holdingObservation.streetAddress',
  'street address2': 'holdingObservation.addressLine2',
  city: 'holdingObservation.city',
  state: 'holdingObservation.stateRegion',
  'filer state': 'holdingObservation.stateRegion',
  zip: 'holdingObservation.postalCode',
  'zip code': 'holdingObservation.postalCode',
  'shares held': 'holdingObservation.sharesHeld',
  shares: 'holdingObservation.sharesHeld',
  'market value': 'holdingObservation.marketValue',
  'of portfolio': 'holdingObservation.portfolioPercent',
  ownership: 'holdingObservation.ownershipPercent',
  'avg price': 'holdingObservation.averagePrice',
  'change in shares': 'holdingObservation.shareChange',
  'percent change': 'holdingObservation.shareChangePercent',
  'prior of portfolio': 'holdingObservation.previousPortfolioPercent',
  prior: 'holdingObservation.previousPortfolioPercent',
  ranking: 'holdingObservation.ranking',
  'prior ranking': 'holdingObservation.previousRanking',
  'qtr first owned': 'holdingObservation.firstOwnedQuarter',
  'source date': 'holdingObservation.asOfDate',
  'source type': 'holdingObservation.filingType',
  '13f': 'holdingObservation.form13f',
};

const COMPANY_IDENTITY_RAW_KEYS = new Set([
  'firm company name',
  'ria',
  'firm name',
  'filer name',
  'filer id',
  'filer cik',
  'filer crd',
  'filer irs number',
]);

const PERSON_IDENTITY_RAW_KEYS = new Set(['first name', 'last name']);

const NUMERIC_HOLDING_KEYS = new Set([
  'shares held',
  'shares',
  'market value',
  'of portfolio',
  'ownership',
  'avg price',
  'change in shares',
  'percent change',
  'prior of portfolio',
  'prior',
  'ranking',
  'prior ranking',
]);

const dispositionForKey = (
  key: string,
  value: unknown,
  isPerson: boolean,
  isHolding: boolean,
): Omit<RawKeyDisposition, 'rowKey' | 'key'> | null => {
  const sourceValueHash = valueHash(value);
  if (key === 'notes source confidence' || key === 'named team id') {
    return {
      kind: 'ignored',
      target:
        key === 'named team id'
          ? 'opaque team identifier excluded; team name and website retained'
          : 'quality commentary excluded from business records',
      sourceValueHash,
    };
  }
  if (COMPANY_IDENTITY_RAW_KEYS.has(key)) {
    const target =
      isHolding && key.startsWith('filer ')
        ? `company.identity+${HOLDING_TARGET_BY_KEY[key]}`
        : 'company.identity';
    return {
      kind: 'identity',
      target,
      sourceValueHash,
      resultValueHash: valueHash(companyNameKey(value)),
    };
  }
  if (PERSON_IDENTITY_RAW_KEYS.has(key)) {
    if (!isPerson) return null;
    return {
      kind: 'identity',
      target: 'person.name',
      sourceValueHash,
      resultValueHash: valueHash(companyNameKey(value)),
    };
  }
  if ((key === 'source type' || key === '13f') && !isHolding) {
    return {
      kind: 'ignored',
      target: 'non-holding filing marker excluded as technical classification',
      sourceValueHash,
    };
  }
  const targets = [
    COMPANY_TARGET_BY_KEY[key],
    isPerson ? PERSON_TARGET_BY_KEY[key] : undefined,
    isHolding ? HOLDING_TARGET_BY_KEY[key] : undefined,
  ].filter((target): target is string => !!target);
  if (targets.length === 0) return null;
  const normalizedResult =
    isHolding && NUMERIC_HOLDING_KEYS.has(key)
      ? numberValue(value)
      : key.includes('email')
        ? (normalizeEmail(value) ?? textValue(value))
        : key.includes('phone') || key === 'mobile' || key === 'landline'
          ? (normalizePhone(value)?.number ?? textValue(value))
          : key === 'linkedin'
            ? (normalizeLinkedIn(value) ?? textValue(value))
            : textValue(value);

  return {
    kind: 'canonical',
    target: [...new Set(targets)].sort().join('+'),
    sourceValueHash,
    resultValueHash: valueHash(normalizedResult),
  };
};

const applyCompanyRaw = (
  accumulator: RecordAccumulator,
  index: ReadonlyMap<string, unknown>,
  domainOwners: Map<string, Set<string>>,
): void => {
  for (const [field, aliases] of COMPANY_FACTS) {
    mergeFact(accumulator, field, rawValue(index, ...aliases));
  }
  mergeFact(accumulator, 'geography', rawValue(index, 'region'));
  const employeeCount = numberValue(rawValue(index, 'firm total employees'));
  if (
    employeeCount !== null &&
    valueAt(accumulator.record, 'employees') == null
  ) {
    setIfChanged(accumulator, 'employees', employeeCount);
  }
  mergeFact(accumulator, 'firmPhone', rawValue(index, 'firm phone'));
  mergeFact(
    accumulator,
    'firmType',
    rawValue(index, 'firm type', 'type of firm'),
  );
  mergeFact(accumulator, 'filerId', rawValue(index, 'filer id'));
  mergeFact(accumulator, 'cik', rawValue(index, 'filer cik'));
  mergeFact(accumulator, 'crd', rawValue(index, 'filer crd'));
  mergeFact(accumulator, 'irsNumber', rawValue(index, 'filer irs number'));

  for (const alias of ['firm company name', 'ria', 'firm name', 'filer name']) {
    const alternate = textValue(rawValue(index, alias));
    if (
      alternate &&
      companyNameKey(alternate) !== companyNameKey(accumulator.record.name)
    ) {
      mergeFact(accumulator, 'alternateNames', alternate);
    }
  }

  const website = rawValue(index, 'firm website', 'website');
  const websiteText = textValue(website);
  if (websiteText) {
    const domain = normalizeDomain(website);
    const currentLink = accumulator.record.domainName as
      | {
          primaryLinkUrl?: unknown;
          primaryLinkLabel?: unknown;
          secondaryLinks?: unknown;
        }
      | undefined;
    const holders = domain
      ? (domainOwners.get(domain) ?? new Set<string>())
      : new Set<string>();
    const currentDomain = normalizeDomain(currentLink?.primaryLinkUrl);
    if (
      domain &&
      !asString(currentLink?.primaryLinkUrl) &&
      ![...holders].some((id) => id !== accumulator.record.id)
    ) {
      setIfChanged(accumulator, 'domainName', {
        primaryLinkLabel: domain,
        primaryLinkUrl: absoluteWebsite(website),
        secondaryLinks: [],
      });
      addOwner(domainOwners, domain, accumulator.record.id);
    } else if (
      !domain ||
      (asString(currentLink?.primaryLinkUrl) !== null &&
        currentDomain !== domain) ||
      [...holders].some((id) => id !== accumulator.record.id)
    ) {
      mergeFact(accumulator, 'websiteNotes', websiteText);
    }
  }

  const currentAddress = (effectiveValue(accumulator, 'address') ??
    {}) as Record<string, unknown>;
  const rawAddress: Record<string, string | null> = {
    addressStreet1: textValue(
      rawValue(index, 'firm address', 'address', 'street address'),
    ),
    addressStreet2: textValue(rawValue(index, 'street address2')),
    addressCity: textValue(rawValue(index, 'firm city', 'city', 'city hq')),
    addressState: textValue(
      rawValue(index, 'firm state', 'state', 'filer state'),
    ),
    addressPostcode: textValue(rawValue(index, 'firm zip', 'zip', 'zip code')),
  };
  const conflicts = Object.entries(rawAddress).filter(
    ([field, value]) =>
      value &&
      asString(currentAddress[field]) &&
      companyNameKey(currentAddress[field]) !== companyNameKey(value),
  );
  if (conflicts.length > 0) {
    const alternate = Object.values(rawAddress).filter(Boolean).join(', ');
    if (alternate) mergeFact(accumulator, 'alternateAddresses', alternate);
  } else {
    const nextAddress = {
      addressStreet1:
        asString(currentAddress.addressStreet1) ??
        rawAddress.addressStreet1 ??
        '',
      addressStreet2:
        asString(currentAddress.addressStreet2) ??
        rawAddress.addressStreet2 ??
        '',
      addressCity:
        asString(currentAddress.addressCity) ?? rawAddress.addressCity ?? '',
      addressState:
        asString(currentAddress.addressState) ?? rawAddress.addressState ?? '',
      addressPostcode:
        asString(currentAddress.addressPostcode) ??
        rawAddress.addressPostcode ??
        '',
      addressCountry: asString(currentAddress.addressCountry) ?? '',
      addressLat: currentAddress.addressLat ?? null,
      addressLng: currentAddress.addressLng ?? null,
    };
    setIfChanged(accumulator, 'address', nextAddress);
  }
};

const applyPersonRaw = (
  accumulator: RecordAccumulator,
  index: ReadonlyMap<string, unknown>,
): void => {
  for (const [field, aliases] of PERSON_FACTS) {
    mergeFact(accumulator, field, rawValue(index, ...aliases));
  }
  mergeFact(accumulator, 'jobTitle', rawValue(index, 'title'));
  const phoneType = textValue(rawValue(index, 'phone type'));
  if (phoneType) accumulator.residualContacts!.add(`Phone type: ${phoneType}`);
  mergeFact(
    accumulator,
    'streetAddress',
    rawValue(index, 'address', 'street address'),
  );
  mergeFact(accumulator, 'city', rawValue(index, 'city'));
  mergeFact(accumulator, 'stateRegion', rawValue(index, 'state'));
  mergeFact(accumulator, 'postalCode', rawValue(index, 'zip', 'zip code'));
};

const personName = (
  record: CrmRecord,
): { firstName: string; lastName: string } => {
  const name = record.name as
    | { firstName?: unknown; lastName?: unknown }
    | undefined;

  return {
    firstName: asString(name?.firstName) ?? '',
    lastName: asString(name?.lastName) ?? '',
  };
};

const nameIdentity = (firstName: unknown, lastName: unknown): string | null => {
  const first = companyNameKey(firstName);
  const last = companyNameKey(lastName);

  return first || last ? `${first ?? ''}\0${last ?? ''}` : null;
};

const resolveCompany = (
  row: StagingRow,
  index: ReadonlyMap<string, unknown>,
  companies: Map<string, RecordAccumulator>,
  domains: Map<string, Set<string>>,
  names: Map<string, Set<string>>,
  locations: Map<string, Set<string>>,
  regulatoryIds: Map<string, Set<string>>,
  personCompanyAnchor?: string,
): { id?: string; unresolved?: string } => {
  const direct =
    asString(row.record.candidateCompanyId) ?? asString(row.record.companyId);
  if (direct)
    return companies.has(direct)
      ? { id: direct }
      : { unresolved: 'MISSING_DIRECT_COMPANY' };

  const regulatoryMatches = new Set<string>();
  for (const [kind, aliases] of [
    ['filerId', ['filer id']],
    ['cik', ['filer cik']],
    ['crd', ['filer crd']],
    ['irs', ['filer irs number']],
  ] as const) {
    const value = companyNameKey(rawValue(index, ...aliases));
    for (const owner of value
      ? (regulatoryIds.get(`${kind}\0${value}`) ?? [])
      : []) {
      regulatoryMatches.add(owner);
    }
  }
  if (regulatoryMatches.size === 1) return { id: [...regulatoryMatches][0] };
  if (regulatoryMatches.size > 1)
    return { unresolved: 'AMBIGUOUS_COMPANY_REGULATORY_ID' };

  const domain = normalizeDomain(rawValue(index, 'firm website', 'website'));
  const domainMatches = domain
    ? (domains.get(domain) ?? new Set<string>())
    : new Set<string>();
  if (domainMatches.size === 1) return { id: [...domainMatches][0] };
  if (domainMatches.size > 1) return { unresolved: 'AMBIGUOUS_COMPANY' };

  const name = rawValue(
    index,
    'firm company name',
    'ria',
    'firm name',
    'filer name',
  );
  const key = companyNameKey(name);
  const locationKey = companyLocationKey(
    name,
    rawValue(index, 'firm city', 'city', 'city hq'),
    rawValue(index, 'firm state', 'state', 'filer state'),
  );
  const locationMatches = locationKey
    ? (locations.get(locationKey) ?? new Set<string>())
    : new Set<string>();
  if (locationMatches.size === 1) return { id: [...locationMatches][0] };
  if (locationMatches.size > 1) return { unresolved: 'AMBIGUOUS_COMPANY' };
  const nameMatches = key
    ? (names.get(key) ?? new Set<string>())
    : new Set<string>();
  if (personCompanyAnchor) {
    return companies.has(personCompanyAnchor)
      ? { id: personCompanyAnchor }
      : { unresolved: 'MISSING_PERSON_COMPANY_ANCHOR' };
  }
  if (nameMatches.size > 0) return { unresolved: 'AMBIGUOUS_COMPANY' };
  if (!key || !textValue(name))
    return { unresolved: 'MISSING_COMPANY_IDENTITY' };

  const id = stableUuid(
    'company',
    stableStringify({
      name: key,
      domain,
      city: companyNameKey(rawValue(index, 'firm city', 'city', 'city hq')),
      state: companyNameKey(
        rawValue(index, 'firm state', 'state', 'filer state'),
      ),
    }),
  );
  const record: CrmRecord = { id, name: textValue(name)! };
  companies.set(id, {
    record,
    data: { id, name: record.name },
    facts: new Map(),
  });
  addOwner(names, key, id);
  if (locationKey) addOwner(locations, locationKey, id);
  if (domain) addOwner(domains, domain, id);

  return { id };
};

const strongPersonCandidates = (
  index: ReadonlyMap<string, unknown>,
  identityOwners: ReturnType<typeof ownerIndexes>,
): Set<string> => {
  const candidates = new Set<string>();
  for (const value of [
    rawValue(index, 'email 1'),
    rawValue(index, 'email 2'),
    rawValue(index, 'personal email'),
  ]) {
    const normalized = normalizeEmail(value);
    for (const owner of normalized
      ? (identityOwners.emails.get(normalized) ?? [])
      : [])
      candidates.add(owner);
  }
  for (const value of [
    rawValue(index, 'mobile phone', 'mobile'),
    rawValue(index, 'landline phone', 'landline'),
    rawValue(index, 'phone'),
  ]) {
    const normalized = normalizePhone(value)?.number;
    for (const owner of normalized
      ? (identityOwners.phones.get(normalized) ?? [])
      : [])
      candidates.add(owner);
  }
  const linkedIn = normalizeLinkedIn(rawValue(index, 'linkedin'));
  for (const owner of linkedIn
    ? (identityOwners.linkedin.get(linkedIn) ?? [])
    : [])
    candidates.add(owner);

  return candidates;
};

const resolvePerson = (
  row: StagingRow,
  index: ReadonlyMap<string, unknown>,
  companyId: string,
  people: Map<string, RecordAccumulator>,
  identityOwners: ReturnType<typeof ownerIndexes>,
  companyNameOwners: Map<string, Set<string>>,
): { id?: string; unresolved?: string } => {
  const candidates = strongPersonCandidates(index, identityOwners);

  if (candidates.size === 1) {
    const id = [...candidates][0]!;
    const existingCompanyId = asString(people.get(id)?.record.companyId);
    if (existingCompanyId && existingCompanyId !== companyId) {
      return { unresolved: 'PERSON_COMPANY_MISMATCH' };
    }

    return { id };
  }
  if (candidates.size > 1) return { unresolved: 'AMBIGUOUS_PERSON_IDENTITY' };

  const identity = nameIdentity(
    rawValue(index, 'first name'),
    rawValue(index, 'last name'),
  );
  const nameMatches = identity
    ? (companyNameOwners.get(`${companyId}\0${identity}`) ?? new Set<string>())
    : new Set<string>();
  if (nameMatches.size === 1) return { id: [...nameMatches][0] };
  if (nameMatches.size > 1) return { unresolved: 'AMBIGUOUS_PERSON_NAME' };
  if (!identity) return { unresolved: 'MISSING_PERSON_IDENTITY' };

  const id = stableUuid('person', row.contentKey);
  const name = {
    firstName: textValue(rawValue(index, 'first name')) ?? '',
    lastName: textValue(rawValue(index, 'last name')) ?? '',
  };
  const record: CrmRecord = { id, companyId, name };
  people.set(id, {
    record,
    data: { id, companyId, name },
    facts: new Map(),
    residualContacts: new Set(),
  });
  addOwner(companyNameOwners, `${companyId}\0${identity}`, id);

  return { id };
};

const applyRawContacts = (
  accumulator: RecordAccumulator,
  index: ReadonlyMap<string, unknown>,
  owners: ReturnType<typeof ownerIndexes>,
): void => {
  const emailShape = nativeEmailShape({
    ...accumulator.record,
    ...accumulator.data,
    id: accumulator.record.id,
  });
  for (const value of [
    rawValue(index, 'email 1'),
    rawValue(index, 'email 2'),
    rawValue(index, 'personal email'),
  ]) {
    const original = textValue(value);
    if (!original) continue;
    const normalized = normalizeEmail(value);
    if (
      !normalized ||
      [...(owners.emails.get(normalized) ?? [])].some(
        (id) => id !== accumulator.record.id,
      )
    ) {
      accumulator.residualContacts!.add(`Email: ${original}`);
    } else if (!emailShape.primaryEmail) emailShape.primaryEmail = normalized;
    else if (
      emailShape.primaryEmail !== normalized &&
      !emailShape.additionalEmails.includes(normalized)
    ) {
      emailShape.additionalEmails.push(normalized);
    }
    if (normalized) addOwner(owners.emails, normalized, accumulator.record.id);
  }
  emailShape.additionalEmails.sort();
  setIfChanged(accumulator, 'emails', emailShape);

  const phoneShape = nativePhoneShape({
    ...accumulator.record,
    ...accumulator.data,
    id: accumulator.record.id,
  });
  for (const value of [
    rawValue(index, 'mobile phone', 'mobile'),
    rawValue(index, 'landline phone', 'landline'),
    rawValue(index, 'phone'),
  ]) {
    const original = textValue(value);
    if (!original) continue;
    const normalized = normalizePhone(value);
    if (
      !normalized ||
      [...(owners.phones.get(normalized.number) ?? [])].some(
        (id) => id !== accumulator.record.id,
      )
    ) {
      accumulator.residualContacts!.add(`Phone: ${original}`);
      continue;
    }
    if (normalized.extension)
      accumulator.residualContacts!.add(`Phone extension: ${original}`);
    const additional = phoneShape.additionalPhones as Array<
      Record<string, unknown>
    >;
    if (!phoneShape.primaryPhoneNumber) {
      phoneShape.primaryPhoneNumber = normalized.number;
      phoneShape.primaryPhoneCountryCode = normalized.countryCode;
      phoneShape.primaryPhoneCallingCode = normalized.callingCode;
    } else if (
      phoneShape.primaryPhoneNumber !== normalized.number &&
      !additional.some(({ number }) => number === normalized.number)
    ) {
      additional.push({
        number: normalized.number,
        countryCode: normalized.countryCode,
        callingCode: normalized.callingCode,
      });
    }
    addOwner(owners.phones, normalized.number, accumulator.record.id);
  }
  (phoneShape.additionalPhones as Array<Record<string, unknown>>).sort(
    (left, right) => String(left.number).localeCompare(String(right.number)),
  );
  setIfChanged(accumulator, 'phones', phoneShape);

  const originalLinkedIn = textValue(rawValue(index, 'linkedin'));
  if (originalLinkedIn) {
    mergeLinkedIn(accumulator, originalLinkedIn, owners);
  }
};

const holdingPatch = (
  record: CrmRecord,
  rawData: Record<string, unknown>,
  unresolved: UnresolvedItem[],
  rowKey: string,
): RecordAccumulator => {
  const accumulator: RecordAccumulator = { record, data: {}, facts: new Map() };
  const { index } = rawIndex(rawData);
  const numeric: ReadonlyArray<[string, string[]]> = [
    ['sharesHeld', ['shares held', 'shares']],
    ['marketValue', ['market value']],
    ['portfolioPercent', ['of portfolio']],
    ['ownershipPercent', ['ownership']],
    ['averagePrice', ['avg price']],
    ['shareChange', ['change in shares']],
    ['shareChangePercent', ['percent change']],
    ['previousPortfolioPercent', ['prior of portfolio', 'prior']],
    ['ranking', ['ranking']],
    ['previousRanking', ['prior ranking']],
  ];
  for (const [field, aliases] of numeric) {
    const raw = rawValue(index, ...aliases);
    const value = numberValue(raw);
    if (textValue(raw) && value === null)
      throw new Error(`Invalid numeric holding field ${field}`);
    if (value !== null) {
      setPreservingNative(
        accumulator,
        field,
        value,
        unresolved,
        rowKey,
        'HOLDING_FIELD_CONFLICT',
      );
    }
  }
  const text: ReadonlyArray<[string, string[], string?]> = [
    ['filerName', ['filer name']],
    ['filerId', ['filer id']],
    ['cik', ['filer cik']],
    ['crd', ['filer crd']],
    ['filerIrsNumber', ['filer irs number']],
    ['city', ['city']],
    ['stateRegion', ['filer state', 'state']],
    ['streetAddress', ['street address', 'address']],
    ['addressLine2', ['street address2']],
    ['postalCode', ['zip', 'zip code']],
    ['firstOwnedQuarter', ['qtr first owned']],
    ['filingType', ['source type']],
    ['form13f', ['13f']],
    ['asOfDate', ['source date'], 'sourceDate'],
  ];
  for (const [field, aliases, previousName] of text) {
    const value = textValue(rawValue(index, ...aliases));
    if (!value) continue;
    if (field === 'asOfDate' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      unresolved.push({ code: 'HOLDING_DATE_INVALID', rowKey });
      continue;
    }
    setPreservingNative(
      accumulator,
      field,
      value,
      unresolved,
      rowKey,
      'HOLDING_FIELD_CONFLICT',
      previousName,
    );
  }

  return accumulator;
};

export const buildCanonicalizationPlan = (
  snapshot: CanonicalizationSnapshot,
): CanonicalizationPlan => {
  const unresolved: UnresolvedItem[] = [];
  const dispositions: RawKeyDisposition[] = [];
  const companyAccumulators = new Map(
    snapshot.companies.map((record) => [
      record.id,
      { record, data: {}, facts: new Map() } satisfies RecordAccumulator,
    ]),
  );
  const personAccumulators = new Map(
    snapshot.people.map((record) => [
      record.id,
      {
        record,
        data: {},
        facts: new Map(),
        residualContacts: new Set<string>(),
      } satisfies RecordAccumulator,
    ]),
  );
  const domainOwners = mapOfUniqueOwners(
    snapshot.companies,
    companyDomainValues,
  );
  const nameOwners = mapOfUniqueOwners(snapshot.companies, (record) => {
    const key = companyNameKey(record.name);

    return key ? [key] : [];
  });
  const locationOwners = mapOfUniqueOwners(snapshot.companies, (record) => {
    const address = companyAddress(record);
    const key = companyLocationKey(
      record.name,
      address.addressCity,
      address.addressState,
    );

    return key ? [key] : [];
  });
  const regulatoryOwners = new Map<string, Set<string>>();
  for (const company of snapshot.companies) {
    for (const [kind, field] of [
      ['filerId', 'filerId'],
      ['cik', 'cik'],
      ['crd', 'crd'],
      ['irs', 'irsNumber'],
    ]) {
      const value = companyNameKey(company[field]);
      if (value) addOwner(regulatoryOwners, `${kind}\0${value}`, company.id);
    }
  }
  const personIdentityOwners = mergeLegacyContacts(
    snapshot.people,
    personAccumulators,
  );
  const companyNamePersonOwners = new Map<string, Set<string>>();
  for (const person of snapshot.people) {
    const name = personName(person);
    const identity = nameIdentity(name.firstName, name.lastName);
    const companyId = asString(person.companyId);
    if (identity && companyId)
      addOwner(companyNamePersonOwners, `${companyId}\0${identity}`, person.id);
  }

  const rows = sourceRows(snapshot);
  const { selected, collisions } = deduplicateRows(rows);
  unresolved.push(...collisions);
  let normalizedKeyCoalesces = 0;

  const confidenceByCompany = new Map<string, Set<string>>();
  for (const row of rows) {
    const companyId = asString(row.record.companyId);
    const { index, coalesces } = rawIndex(row.rawData);
    normalizedKeyCoalesces += coalesces;
    const rowIsPerson = !!(
      textValue(rawValue(index, 'first name')) ||
      textValue(rawValue(index, 'last name'))
    );
    const rowIsHolding = !!(
      textValue(rawValue(index, 'shares held', 'shares')) ||
      textValue(rawValue(index, 'market value')) ||
      (!rowIsPerson && textValue(rawValue(index, 'filer name')))
    );
    const occurrenceKey = stableUuid(
      'stagingRow',
      `${row.rowKey}\0${row.record.id}`,
    );
    for (const [key, value] of index) {
      if (!textValue(value)) continue;
      const disposition = dispositionForKey(
        key,
        value,
        rowIsPerson,
        rowIsHolding,
      );
      if (!disposition || EMPTY_ONLY_RAW_KEYS.has(key)) {
        unresolved.push({ code: 'UNHANDLED_RAW_FIELD', rowKey: row.rowKey });
        continue;
      }
      dispositions.push({ rowKey: occurrenceKey, key, ...disposition });
    }
    const confidence = textValue(rawValue(index, 'notes source confidence'));
    if (companyId && confidence) {
      confidenceByCompany.set(
        companyId,
        new Set([...(confidenceByCompany.get(companyId) ?? []), confidence]),
      );
    }
  }

  for (const accumulator of companyAccumulators.values()) {
    const nativeAddress = companyAddress(accumulator.record);
    const previousCountry = asString(accumulator.record.country);
    const nativeCountry = asString(nativeAddress.addressCountry);
    if (previousCountry && previousCountry !== nativeCountry) {
      unresolved.push({
        code: 'COUNTRY_NOT_CANONICAL',
        rowKey: accumulator.record.id,
      });
    }
    if (accumulator.record.locationIsManual === true) {
      unresolved.push({
        code: 'MANUAL_LOCATION_NOT_CANONICAL',
        rowKey: accumulator.record.id,
      });
    }
    const description = asString(accumulator.record.fetchDescription);
    if (description) {
      const isConfidence =
        confidenceByCompany.get(accumulator.record.id)?.has(description) ??
        false;
      if (!isConfidence) {
        setPreservingNative(
          accumulator,
          'description',
          description,
          unresolved,
          accumulator.record.id,
          'DESCRIPTION_CONFLICT',
        );
      }
    }
    const website = accumulator.record.legacyWebsite;
    if (textValue(website)) {
      applyCompanyRaw(
        accumulator,
        new Map([['website', website]]),
        domainOwners,
      );
    }
  }

  const holdingByIdentity = new Map<string, CrmRecord>();
  const holdingCompanyByContent = new Map<string, Set<string>>();
  for (const holding of snapshot.holdingObservations) {
    if (!textValue(holding.rawData)) continue;
    const rawData = parseRawData(holding.rawData);
    const { index: holdingRawIndex } = rawIndex(rawData);
    const dispositionRowKey = stableUuid('holdingRaw', holding.id);
    for (const [key, value] of holdingRawIndex) {
      if (!textValue(value)) continue;
      const disposition = dispositionForKey(key, value, false, true);
      if (!disposition || EMPTY_ONLY_RAW_KEYS.has(key)) {
        unresolved.push({
          code: 'UNHANDLED_HOLDING_RAW_FIELD',
          rowKey: holding.id,
        });
      } else {
        dispositions.push({
          rowKey: dispositionRowKey,
          key,
          ...disposition,
        });
      }
    }
    const companyId = asString(holding.companyId);
    if (!companyId) {
      unresolved.push({ code: 'HOLDING_COMPANY_MISSING', rowKey: holding.id });
      continue;
    }
    const identity = holdingIdentityKey(
      companyId,
      productNameFor(holding),
      rawData,
    );
    if (holdingByIdentity.has(identity)) {
      unresolved.push({ code: 'DUPLICATE_HOLDING_IDENTITY', rowKey: identity });
      continue;
    }
    holdingByIdentity.set(identity, holding);
    const content = canonicalContentKey(rawData);
    holdingCompanyByContent.set(
      content,
      new Set([...(holdingCompanyByContent.get(content) ?? []), companyId]),
    );
  }
  const holdingAccumulators = new Map<string, RecordAccumulator>();
  for (const [identity, holding] of holdingByIdentity) {
    holdingAccumulators.set(
      holding.id,
      holdingPatch(
        holding,
        parseRawData(holding.rawData),
        unresolved,
        holding.id,
      ),
    );
    void identity;
  }

  const orderedRows = [...selected].sort((left, right) => {
    const leftHasDirect = Number(
      !!asString(left.record.companyId) ||
        !!asString(left.record.candidateCompanyId),
    );
    const rightHasDirect = Number(
      !!asString(right.record.companyId) ||
        !!asString(right.record.candidateCompanyId),
    );

    return (
      rightHasDirect - leftHasDirect || left.rowKey.localeCompare(right.rowKey)
    );
  });
  for (const row of orderedRows) {
    const { index } = rawIndex(row.rawData);
    const isPerson = rowIsPerson(index);
    const isHolding = rowIsHolding(index);
    const strongPeople = isPerson
      ? strongPersonCandidates(index, personIdentityOwners)
      : new Set<string>();
    const anchoredPerson =
      strongPeople.size === 1
        ? personAccumulators.get([...strongPeople][0]!)?.record
        : undefined;
    const personCompanyAnchor = asString(anchoredPerson?.companyId);
    const company = resolveCompany(
      row,
      index,
      companyAccumulators,
      domainOwners,
      nameOwners,
      locationOwners,
      regulatoryOwners,
      personCompanyAnchor ?? undefined,
    );
    if (!company.id) {
      unresolved.push({ code: company.unresolved!, rowKey: row.rowKey });
      continue;
    }
    const companyAccumulator = companyAccumulators.get(company.id)!;
    applyCompanyRaw(companyAccumulator, index, domainOwners);
    const companyName = rawValue(
      index,
      'firm company name',
      'ria',
      'firm name',
      'filer name',
    );
    const locationKey = companyLocationKey(
      companyName,
      rawValue(index, 'firm city', 'city', 'city hq'),
      rawValue(index, 'firm state', 'state', 'filer state'),
    );
    if (locationKey) addOwner(locationOwners, locationKey, company.id);
    for (const [kind, aliases] of [
      ['filerId', ['filer id']],
      ['cik', ['filer cik']],
      ['crd', ['filer crd']],
      ['irs', ['filer irs number']],
    ] as const) {
      const value = companyNameKey(rawValue(index, ...aliases));
      if (value) addOwner(regulatoryOwners, `${kind}\0${value}`, company.id);
    }

    if (isPerson) {
      const person = resolvePerson(
        row,
        index,
        company.id,
        personAccumulators,
        personIdentityOwners,
        companyNamePersonOwners,
      );
      if (!person.id) {
        unresolved.push({ code: person.unresolved!, rowKey: row.rowKey });
        continue;
      }
      const personAccumulator = personAccumulators.get(person.id)!;
      applyPersonRaw(personAccumulator, index);
      applyRawContacts(personAccumulator, index, personIdentityOwners);
    }

    if (isHolding) {
      const productName = productNameFor(row.record);
      const holdingIdentity = holdingIdentityKey(
        company.id,
        productName,
        row.rawData,
      );
      const existing = holdingByIdentity.get(holdingIdentity);
      if (
        !existing &&
        [...(holdingCompanyByContent.get(row.contentKey) ?? [])].some(
          (id) => id !== company.id,
        )
      ) {
        unresolved.push({
          code: 'HOLDING_COMPANY_CONFLICT',
          rowKey: row.rowKey,
        });
        continue;
      }
      const holding = existing ?? {
        id: stableUuid('holdingObservation', holdingIdentity),
        companyId: company.id,
      };
      const accumulator = holdingPatch(
        holding,
        row.rawData,
        unresolved,
        row.rowKey,
      );
      if (!existing) {
        accumulator.data.id = holding.id;
        accumulator.data.companyId = company.id;
        accumulator.data.productName = productName;
        accumulator.data.name = `${productName} - ${textValue(rawValue(index, 'filer name')) ?? 'Holding'}`;
      }
      holdingAccumulators.set(holding.id, accumulator);
    }
  }

  for (const accumulator of companyAccumulators.values())
    finalizeFacts(accumulator);
  for (const accumulator of personAccumulators.values())
    finalizeFacts(accumulator);

  const taskTargetKeys = new Set(
    snapshot.taskTargets.map(
      (target) =>
        `${asString(target.taskId)}\0${asString(target.targetPersonId)}`,
    ),
  );
  const personByPreviousId = mapOfUniqueOwners(snapshot.people, (record) => {
    const id = asString(record.legacyFetchId);

    return id ? [id] : [];
  });
  const wholesalerByPreviousId = mapOfUniqueOwners(
    snapshot.wholesalers,
    (record) => {
      const id = asString(record.legacyFetchId);

      return id ? [id] : [];
    },
  );
  const additionalMutations: RecordMutation[] = [];
  for (const task of [...snapshot.tasks].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const contactId = asString(task.legacyContactId);
    if (contactId) {
      const people = personByPreviousId.get(contactId) ?? new Set<string>();
      if (people.size !== 1)
        unresolved.push({ code: 'TASK_CONTACT_UNRESOLVED', rowKey: task.id });
      else {
        const personId = [...people][0]!;
        if (!taskTargetKeys.has(`${task.id}\0${personId}`)) {
          const id = stableUuid('taskPersonTarget', task.id);
          additionalMutations.push({
            objectPlural: 'taskTargets',
            id,
            data: { id, taskId: task.id, targetPersonId: personId },
          });
        }
      }
    }
    const previousWholesalerId = asString(task.legacyWholesalerId);
    if (previousWholesalerId) {
      const wholesalers =
        wholesalerByPreviousId.get(previousWholesalerId) ?? new Set<string>();
      if (wholesalers.size !== 1)
        unresolved.push({
          code: 'TASK_WHOLESALER_UNRESOLVED',
          rowKey: task.id,
        });
      else if (task.wholesalerId !== [...wholesalers][0]) {
        additionalMutations.push({
          objectPlural: 'tasks',
          id: task.id,
          data: { wholesalerId: [...wholesalers][0] },
        });
      }
    }
  }

  const taskByPreviousId = mapOfUniqueOwners(snapshot.tasks, (record) => {
    const id = asString(record.legacyFetchId);

    return id ? [id] : [];
  });
  for (const activity of snapshot.outreachActivities) {
    if (!textValue(activity.fetchMetadata)) continue;
    const metadata = parseRawData(activity.fetchMetadata);
    const { index } = rawIndex(metadata);
    const previousTaskId = textValue(rawValue(index, 'follow up id'));
    const followUpDate = textValue(rawValue(index, 'follow up date'));
    const data: Record<string, unknown> = {};
    if (previousTaskId) {
      const tasks = taskByPreviousId.get(previousTaskId) ?? new Set<string>();
      if (tasks.size !== 1) {
        unresolved.push({
          code: 'OUTREACH_TASK_UNRESOLVED',
          rowKey: activity.id,
        });
      } else {
        const taskId = [...tasks][0]!;
        if (asString(activity.followUpTaskId)) {
          if (activity.followUpTaskId !== taskId) {
            unresolved.push({
              code: 'OUTREACH_RELATION_CONFLICT',
              rowKey: activity.id,
            });
          }
        } else {
          data.followUpTaskId = taskId;
        }
      }
    }
    if (followUpDate) {
      const date = /^\d{4}-\d{2}-\d{2}/.exec(followUpDate)?.[0];
      if (!date)
        unresolved.push({ code: 'OUTREACH_DATE_INVALID', rowKey: activity.id });
      else if (asString(activity.followUpDate)) {
        if (activity.followUpDate !== date) {
          unresolved.push({
            code: 'OUTREACH_DATE_CONFLICT',
            rowKey: activity.id,
          });
        }
      } else data.followUpDate = date;
    }
    if (Object.keys(data).length > 0) {
      additionalMutations.push({
        objectPlural: 'outreachActivities',
        id: activity.id,
        data,
      });
    }
  }

  const activityById = new Map(
    snapshot.outreachActivities.map((activity) => [activity.id, activity]),
  );
  const archivedComparableFields = [
    'companyId',
    'contactId',
    'wholesalerId',
    'assignmentId',
    'activityType',
    'outcome',
    'notes',
    'occurredAt',
  ];
  for (const archived of snapshot.archivedOutreachActivities) {
    const canonicalId = asString(archived.canonicalActivityId);
    const canonical = canonicalId ? activityById.get(canonicalId) : undefined;
    if (
      !canonical ||
      archivedComparableFields.some(
        (field) =>
          !valuesEqual(archived[field] ?? null, canonical[field] ?? null),
      )
    ) {
      unresolved.push({
        code: 'ARCHIVED_ACTIVITY_NOT_CLONE',
        rowKey: archived.id,
      });
    }
  }

  const accumulatorMutations = (
    objectPlural: string,
    accumulators: Map<string, RecordAccumulator>,
  ): RecordMutation[] =>
    [...accumulators.values()]
      .filter(({ data }) => Object.keys(data).length > 0)
      .map(({ record, data }) => ({ objectPlural, id: record.id, data }))
      .sort((left, right) => left.id.localeCompare(right.id));
  const mutations = [
    ...accumulatorMutations('companies', companyAccumulators),
    ...accumulatorMutations('people', personAccumulators),
    ...accumulatorMutations('holdingObservations', holdingAccumulators),
    ...additionalMutations,
  ].sort(
    (left, right) =>
      left.objectPlural.localeCompare(right.objectPlural) ||
      left.id.localeCompare(right.id),
  );
  unresolved.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.rowKey.localeCompare(right.rowKey),
  );

  return {
    mutations,
    unresolved,
    dispositions: dispositions.sort(
      (left, right) =>
        left.rowKey.localeCompare(right.rowKey) ||
        left.key.localeCompare(right.key),
    ),
    summary: {
      inputRows: rows.length,
      semanticRows: selected.length,
      duplicateRows: rows.length - selected.length - collisions.length,
      normalizedKeyCoalesces,
      mutations: mutations.length,
    },
  };
};

export const assertPlanCanApply = (plan: CanonicalizationPlan): void => {
  if (plan.unresolved.length > 0) {
    const counts = new Map<string, number>();
    for (const item of plan.unresolved)
      counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
    const summary = [...counts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([code, count]) => `${code}=${count}`)
      .join(', ');
    throw new Error(`Canonicalization has unresolved records: ${summary}`);
  }
};

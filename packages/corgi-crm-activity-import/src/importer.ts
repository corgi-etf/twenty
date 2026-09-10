import { createHash } from 'node:crypto';

export type ActivityImportSourceFormat =
  | 'legacy-nash-outreach-v1'
  | 'completed-actions-v2';
export type ActivityOwnerLabel = 'Grace' | 'Nash';
export type CompletedActivityType = 'phone_call' | 'email';
export type CanonicalActivityOutcome =
  | 'left_voicemail'
  | 'no_response'
  | 'connected'
  | 'follow_up_scheduled'
  | 'not_interested'
  | 'other';

export type ActivityImportNormalizationReceipt = {
  schemaVersion: 1;
  sourceFormat: 'completed-actions-v2';
  sourceDocumentSha256: string;
  normalizedCsvSha256: string;
  rowSequenceSha256: string;
  sourceRowCount: number;
  activityCount: number;
  phoneCallCount: number;
  voicemailCount: number;
  emailCount: number;
};

export type ActivityImportCsvOptions = {
  sourceFormat: ActivityImportSourceFormat;
  ownerLabel: ActivityOwnerLabel;
  sourceSha256: string;
  provenanceSha256: string;
  expectedRowSequenceSha256?: string;
  expectedRows: number;
  activityDate: string;
  timeZone: string;
  importId: string;
  normalizationReceipt?: ActivityImportNormalizationReceipt;
};

export type SourceActivity = {
  rowNumber: number;
  companyName: string;
  sourceRowNumber?: number;
  actionOrdinal?: number;
  activityType?: CompletedActivityType;
  outcome?: CanonicalActivityOutcome;
  phone?: string | null;
  websiteEvidence?: string | null;
  linkedInEvidence?: string | null;
  contactEmail?: string | null;
  contactName?: string | null;
  assetsUnderManagement?: string | null;
  primaryNotes?: string | null;
  additionalDetailOne?: string | null;
  additionalDetailTwo?: string | null;
  notes: string | null;
  occurredAt: string;
};

export type ActivityImportCompany = { id: string; name: unknown };
export type ActivityImportPerson = {
  id: string;
  companyId?: unknown;
  company?: { id?: unknown } | null;
  name?: unknown;
  emails?: unknown;
};
export type ActivityImportWholesaler = {
  id: string;
  workspaceMemberId?: unknown;
  workspaceMember?: { id?: unknown } | null;
};
export type OutreachActivityRecord = Record<string, unknown> & { id: string };

export type TerritoryIdentityArtifact = {
  workspaceMemberIds: Record<ActivityOwnerLabel, string>;
  aggregateIdentityHash: string;
};

export type ActivityImportManifest = {
  schemaVersion: 2;
  sourceFormat: ActivityImportSourceFormat;
  ownerLabel: ActivityOwnerLabel;
  sourceSha256: string;
  provenanceSha256: string;
  rowSequenceSha256: string;
  importIdHash: string;
  expectedRows: number;
  activityDate: string;
  timeZone: string;
  rowCount: number;
  blankNoteCount: number;
  distinctCompanyCount: number;
  activityIdSetHash: string;
  planHash: string;
  normalizationReceipt: ActivityImportNormalizationReceipt | null;
};

export type PlannedActivity = {
  rowNumber: number;
  state: 'create' | 'existing';
  operationHash: string;
  record: OutreachActivityRecord;
};

export type ActivityImportPlan = {
  manifest: ActivityImportManifest;
  activities: PlannedActivity[];
};

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IMPORT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const ACTIVITY_SOURCE_FORMATS = [
  'legacy-nash-outreach-v1',
  'completed-actions-v2',
] as const;
const ACTIVITY_OWNER_LABELS = ['Grace', 'Nash'] as const;

const CANONICAL_IDENTITY_KEYS = [...ACTIVITY_OWNER_LABELS].sort().join(',');
const COMPLETED_ACTIVITY_TYPES = ['phone_call', 'email'] as const;
const CANONICAL_ACTIVITY_OUTCOMES = [
  'left_voicemail',
  'no_response',
  'connected',
  'follow_up_scheduled',
  'not_interested',
  'other',
] as const;
const ACTIVITY_IMPORT_UUID_NAMESPACE = 'c0671000-75d5-5df7-a950-50da7105b2dd';
const COMPATIBLE_OUTCOMES_BY_ACTIVITY_TYPE: Readonly<
  Record<CompletedActivityType, readonly CanonicalActivityOutcome[]>
> = {
  phone_call: ['left_voicemail', 'no_response', 'connected', 'other'],
  email: ['no_response', 'follow_up_scheduled', 'not_interested', 'other'],
};

const isCompatibleActivityTypeAndOutcome = (
  activityType: CompletedActivityType,
  outcome: CanonicalActivityOutcome,
): boolean =>
  COMPATIBLE_OUTCOMES_BY_ACTIVITY_TYPE[activityType].includes(outcome);

const assertNormalizationReceipt = (
  receipt: ActivityImportNormalizationReceipt | undefined,
  options: ActivityImportCsvOptions,
): void => {
  if (options.sourceFormat === 'legacy-nash-outreach-v1') {
    if (receipt !== undefined) {
      throw new Error(
        'Activity import legacy source cannot include a normalization receipt',
      );
    }
    return;
  }
  if (
    Object.keys((receipt as unknown as Record<string, unknown>) ?? {})
      .sort()
      .join(',') !==
      [
        'schemaVersion',
        'sourceFormat',
        'sourceDocumentSha256',
        'normalizedCsvSha256',
        'rowSequenceSha256',
        'sourceRowCount',
        'activityCount',
        'phoneCallCount',
        'voicemailCount',
        'emailCount',
      ]
        .sort()
        .join(',') ||
    receipt?.schemaVersion !== 1 ||
    receipt.sourceFormat !== 'completed-actions-v2' ||
    ![
      receipt.sourceDocumentSha256,
      receipt.normalizedCsvSha256,
      receipt.rowSequenceSha256,
    ].every((hash) => typeof hash === 'string' && HASH_PATTERN.test(hash)) ||
    receipt.sourceDocumentSha256 !== options.provenanceSha256 ||
    receipt.normalizedCsvSha256 !== options.sourceSha256 ||
    receipt.rowSequenceSha256 !== options.expectedRowSequenceSha256 ||
    receipt.activityCount !== options.expectedRows ||
    ![
      receipt.sourceRowCount,
      receipt.activityCount,
      receipt.phoneCallCount,
      receipt.voicemailCount,
      receipt.emailCount,
    ].every((count) => Number.isSafeInteger(count) && count >= 0) ||
    receipt.sourceRowCount < 1 ||
    receipt.activityCount < 1 ||
    receipt.phoneCallCount + receipt.emailCount !== receipt.activityCount ||
    receipt.voicemailCount > receipt.phoneCallCount
  ) {
    throw new Error('Activity import normalization receipt is invalid');
  }
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

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

const assertCsvOptions = (options: ActivityImportCsvOptions): void => {
  if (!ACTIVITY_SOURCE_FORMATS.includes(options.sourceFormat)) {
    throw new Error('Activity import source format is invalid');
  }
  if (!ACTIVITY_OWNER_LABELS.includes(options.ownerLabel)) {
    throw new Error('Activity import owner label is invalid');
  }
  if (!HASH_PATTERN.test(options.sourceSha256)) {
    throw new Error('Activity import source SHA-256 is invalid');
  }
  if (!HASH_PATTERN.test(options.provenanceSha256)) {
    throw new Error('Activity import provenance SHA-256 is invalid');
  }
  if (
    options.expectedRowSequenceSha256 !== undefined &&
    !HASH_PATTERN.test(options.expectedRowSequenceSha256)
  ) {
    throw new Error('Activity import row sequence SHA-256 is invalid');
  }
  if (
    options.sourceFormat === 'legacy-nash-outreach-v1' &&
    options.ownerLabel !== 'Nash'
  ) {
    throw new Error('Activity import legacy source owner must be Nash');
  }
  if (
    options.sourceFormat === 'legacy-nash-outreach-v1' &&
    options.provenanceSha256 !== options.sourceSha256
  ) {
    throw new Error('Activity import legacy provenance must match its source');
  }
  if (
    options.sourceFormat === 'completed-actions-v2' &&
    options.expectedRowSequenceSha256 === undefined
  ) {
    throw new Error('Activity import completed actions require a row hash');
  }
  assertNormalizationReceipt(options.normalizationReceipt, options);
  if (
    !Number.isSafeInteger(options.expectedRows) ||
    options.expectedRows < 1 ||
    options.expectedRows > 10_000
  ) {
    throw new Error('Activity import expected row count is invalid');
  }
  if (!IMPORT_ID_PATTERN.test(options.importId)) {
    throw new Error('Activity import ID is invalid');
  }
  const match = options.activityDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsedDate = match
    ? new Date(
        Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
      )
    : undefined;
  if (
    !match ||
    !parsedDate ||
    parsedDate.toISOString().slice(0, 10) !== options.activityDate
  ) {
    throw new Error('Activity import date is invalid');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: options.timeZone }).format();
  } catch {
    throw new Error('Activity import time zone is invalid');
  }
};

const parseCsvRows = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;
  let fieldStarted = false;
  let endedWithRowBreak = false;

  const finishField = () => {
    row.push(field);
    field = '';
    afterQuote = false;
    fieldStarted = false;
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
    endedWithRowBreak = true;
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    endedWithRowBreak = false;
    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else if (character === '\r' && input[index + 1] === '\n') {
        field += '\n';
        index += 1;
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ',') {
        finishField();
      } else if (character === '\n' || character === '\r') {
        finishRow();
        if (character === '\r' && input[index + 1] === '\n') index += 1;
      } else {
        throw new Error('Activity import CSV has characters after a quote');
      }
      continue;
    }

    if (character === '"') {
      if (fieldStarted || field.length > 0) {
        throw new Error('Activity import CSV has an unexpected quote');
      }
      inQuotes = true;
      fieldStarted = true;
    } else if (character === ',') {
      finishField();
    } else if (character === '\n' || character === '\r') {
      finishRow();
      if (character === '\r' && input[index + 1] === '\n') index += 1;
    } else {
      field += character;
      fieldStarted = true;
    }
  }
  if (inQuotes)
    throw new Error('Activity import CSV has an unterminated quote');
  if (!endedWithRowBreak || row.length > 0 || field.length > 0 || afterQuote) {
    finishRow();
  }

  return rows;
};

const localNoon = (activityDate: string, timeZone: string): string => {
  const [year, month, day] = activityDate.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const requestedLocal = Date.UTC(year, month - 1, day, 12);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const localParts = Object.fromEntries(
    formatter
      .formatToParts(new Date(requestedLocal))
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<string, number>;
  const representedLocal = Date.UTC(
    localParts.year!,
    localParts.month! - 1,
    localParts.day!,
    localParts.hour!,
    localParts.minute!,
    localParts.second!,
  );
  const instant = new Date(
    requestedLocal - (representedLocal - requestedLocal),
  );
  const verification = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<string, number>;
  if (
    verification.year !== year ||
    verification.month !== month ||
    verification.day !== day ||
    verification.hour !== 12 ||
    verification.minute !== 0 ||
    verification.second !== 0
  ) {
    throw new Error('Activity import date could not be represented safely');
  }

  return instant.toISOString();
};

const rowSequenceSha256 = (rows: readonly (readonly string[])[]): string =>
  sha256(rows.map((row) => sha256(stableStringify(row))).join('\n'));

export const activityCsvRowSequenceSha256 = (source: Uint8Array): string => {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(source);
  } catch {
    throw new Error('Activity import source is not valid UTF-8');
  }

  return rowSequenceSha256(parseCsvRows(decoded));
};

export const parseActivityCsv = (
  source: Uint8Array,
  options: ActivityImportCsvOptions,
): SourceActivity[] => {
  assertCsvOptions(options);
  if (sha256(source) !== options.sourceSha256) {
    throw new Error('Activity import source SHA-256 mismatch');
  }
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(source);
  } catch {
    throw new Error('Activity import source is not valid UTF-8');
  }
  const rows = parseCsvRows(decoded);
  if (rows.length !== options.expectedRows) {
    throw new Error('Activity import logical row count mismatch');
  }

  const actualRowSequenceSha256 = rowSequenceSha256(rows);
  if (
    options.expectedRowSequenceSha256 !== undefined &&
    options.expectedRowSequenceSha256 !== actualRowSequenceSha256
  ) {
    throw new Error('Activity import row sequence SHA-256 mismatch');
  }

  const occurredAt = localNoon(options.activityDate, options.timeZone);

  if (options.sourceFormat === 'completed-actions-v2') {
    let previousSourceRow = 0;
    let previousActionOrdinal = 0;

    const completedRows = rows.map((columns, rowIndex) => {
      if (columns.length !== 6) {
        throw new Error(
          `Activity import row ${rowIndex + 1} must have exactly 6 columns`,
        );
      }
      if (
        !/^[1-9][0-9]*$/.test(columns[0]!) ||
        !/^[1-9][0-9]*$/.test(columns[1]!)
      ) {
        throw new Error(
          `Activity import row ${rowIndex + 1} has an invalid source position`,
        );
      }
      const sourceRowNumber = Number(columns[0]);
      const actionOrdinal = Number(columns[1]);
      if (
        !Number.isSafeInteger(sourceRowNumber) ||
        !Number.isSafeInteger(actionOrdinal) ||
        sourceRowNumber < previousSourceRow ||
        (sourceRowNumber === previousSourceRow &&
          actionOrdinal !== previousActionOrdinal + 1) ||
        (sourceRowNumber > previousSourceRow && actionOrdinal !== 1)
      ) {
        throw new Error(
          `Activity import row ${rowIndex + 1} is not in deterministic source order`,
        );
      }
      previousSourceRow = sourceRowNumber;
      previousActionOrdinal = actionOrdinal;

      const companyName = columns[2]!.trim().normalize('NFKC');
      if (!companyName) {
        throw new Error(`Activity import row ${rowIndex + 1} has no company`);
      }
      const activityType = columns[3]!.trim() as CompletedActivityType;
      if (!COMPLETED_ACTIVITY_TYPES.includes(activityType)) {
        throw new Error(
          `Activity import row ${rowIndex + 1} has an invalid activity type`,
        );
      }
      const outcome = columns[4]!.trim() as CanonicalActivityOutcome;
      if (!CANONICAL_ACTIVITY_OUTCOMES.includes(outcome)) {
        throw new Error(
          `Activity import row ${rowIndex + 1} has an invalid outcome`,
        );
      }
      if (!isCompatibleActivityTypeAndOutcome(activityType, outcome)) {
        throw new Error(
          `Activity import row ${rowIndex + 1} has an incompatible activity type and outcome`,
        );
      }
      const notes = columns[5]!.trim().normalize('NFKC') || null;

      return {
        rowNumber: rowIndex + 1,
        sourceRowNumber,
        actionOrdinal,
        companyName,
        activityType,
        outcome,
        notes,
        occurredAt,
      };
    });
    const receipt = options.normalizationReceipt!;
    const phoneCallCount = completedRows.filter(
      ({ activityType }) => activityType === 'phone_call',
    ).length;
    const emailCount = completedRows.filter(
      ({ activityType }) => activityType === 'email',
    ).length;
    const voicemailCount = completedRows.filter(
      ({ activityType, outcome }) =>
        activityType === 'phone_call' && outcome === 'left_voicemail',
    ).length;
    if (
      receipt.sourceRowCount < previousSourceRow ||
      receipt.activityCount !== completedRows.length ||
      receipt.phoneCallCount !== phoneCallCount ||
      receipt.voicemailCount !== voicemailCount ||
      receipt.emailCount !== emailCount
    ) {
      throw new Error('Activity import normalization receipt count mismatch');
    }

    return completedRows;
  }

  return rows.map((columns, rowIndex) => {
    if (columns.length !== 10) {
      throw new Error(
        `Activity import row ${rowIndex + 1} must have exactly 10 columns`,
      );
    }
    const companyName = columns[0]!.trim().normalize('NFKC');
    if (!companyName) {
      throw new Error(`Activity import row ${rowIndex + 1} has no company`);
    }
    const optionalColumn = (index: number): string | null => {
      const normalized = columns[index]!.trim().normalize('NFKC');

      return normalized || null;
    };
    const phone = optionalColumn(1);
    const websiteEvidence = optionalColumn(2);
    const linkedInEvidence = optionalColumn(3);
    const contactEmail = optionalColumn(4);
    const contactName = optionalColumn(5);
    const assetsUnderManagement = optionalColumn(6);
    const primaryNotes = optionalColumn(7);
    const additionalDetailOne = optionalColumn(8);
    const additionalDetailTwo = optionalColumn(9);
    const notes = [primaryNotes, additionalDetailOne, additionalDetailTwo]
      .filter((value): value is string => value !== null)
      .join('\n');

    return {
      rowNumber: rowIndex + 1,
      companyName,
      phone,
      websiteEvidence,
      linkedInEvidence,
      contactEmail,
      contactName,
      assetsUnderManagement,
      primaryNotes,
      additionalDetailOne,
      additionalDetailTwo,
      notes: notes || null,
      occurredAt,
    };
  });
};

export const assertTerritoryIdentityArtifact = (
  value: unknown,
): TerritoryIdentityArtifact => {
  const artifact = value as TerritoryIdentityArtifact;
  // Derived from the owner label list rather than spelled out, so this copy of
  // the identity contract cannot drift from corgi-crm-workspace-config.
  const workspaceMemberIds = Object.fromEntries(
    ACTIVITY_OWNER_LABELS.map((label) => [
      label,
      artifact?.workspaceMemberIds?.[label],
    ]),
  ) as TerritoryIdentityArtifact['workspaceMemberIds'];
  const expectedHash = sha256(
    ACTIVITY_OWNER_LABELS.map(
      (label) => `${label}=${workspaceMemberIds[label]}`,
    ).join('\n'),
  );
  if (
    Object.keys((value as Record<string, unknown> | null) ?? {})
      .sort()
      .join(',') !== 'aggregateIdentityHash,workspaceMemberIds' ||
    Object.keys(artifact?.workspaceMemberIds ?? {})
      .sort()
      .join(',') !== CANONICAL_IDENTITY_KEYS ||
    !Object.values(workspaceMemberIds).every(
      (id) => typeof id === 'string' && UUID_PATTERN.test(id),
    ) ||
    new Set(Object.values(workspaceMemberIds)).size !==
      ACTIVITY_OWNER_LABELS.length ||
    artifact.aggregateIdentityHash !== expectedHash
  ) {
    throw new Error('Territory identity artifact is invalid');
  }

  return {
    workspaceMemberIds,
    aggregateIdentityHash: expectedHash,
  };
};

const uuidBytes = (uuid: string): Buffer =>
  Buffer.from(uuid.replace(/-/g, ''), 'hex');

const formatUuid = (bytes: Buffer): string => {
  const hex = bytes.toString('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const deterministicUuid = (seed: string): string => {
  const digest = createHash('sha1')
    .update(uuidBytes(ACTIVITY_IMPORT_UUID_NAMESPACE))
    .update(seed, 'utf8')
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;

  return formatUuid(digest);
};

export const deterministicActivityId = (
  importId: string,
  activityKey: number | string,
): string => {
  if (
    !IMPORT_ID_PATTERN.test(importId) ||
    !(
      (typeof activityKey === 'number' &&
        Number.isSafeInteger(activityKey) &&
        activityKey >= 1) ||
      (typeof activityKey === 'string' &&
        /^source-row:[1-9][0-9]*:action:[1-9][0-9]*$/.test(activityKey))
    )
  ) {
    throw new Error('Deterministic activity identity input is invalid');
  }
  return deterministicUuid(`${importId}:${activityKey}`);
};

export const deterministicCompletedActivityId = (input: {
  provenanceSha256: string;
  ownerWorkspaceMemberId: string;
  sourceRowNumber: number;
  actionOrdinal: number;
  activityType: CompletedActivityType;
  outcome: CanonicalActivityOutcome;
}): string => {
  if (
    !HASH_PATTERN.test(input.provenanceSha256) ||
    !UUID_PATTERN.test(input.ownerWorkspaceMemberId) ||
    !Number.isSafeInteger(input.sourceRowNumber) ||
    input.sourceRowNumber < 1 ||
    !Number.isSafeInteger(input.actionOrdinal) ||
    input.actionOrdinal < 1 ||
    !COMPLETED_ACTIVITY_TYPES.includes(input.activityType) ||
    !CANONICAL_ACTIVITY_OUTCOMES.includes(input.outcome) ||
    !isCompatibleActivityTypeAndOutcome(input.activityType, input.outcome)
  ) {
    throw new Error(
      'Deterministic completed activity identity input is invalid',
    );
  }

  return deterministicUuid(
    [
      'completed-actions-v2',
      input.provenanceSha256,
      input.ownerWorkspaceMemberId,
      input.sourceRowNumber,
      input.actionOrdinal,
    ].join(':'),
  );
};

const relationWorkspaceMemberId = (
  wholesaler: ActivityImportWholesaler,
): unknown => wholesaler.workspaceMemberId ?? wholesaler.workspaceMember?.id;

const personCompanyId = (person: ActivityImportPerson): unknown =>
  person.companyId ?? person.company?.id;

const normalizedName = (value: unknown): string | null => {
  let name: string | undefined;
  if (typeof value === 'string') {
    name = value;
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as { firstName?: unknown; lastName?: unknown };
    name = [candidate.firstName, candidate.lastName]
      .filter((part): part is string => typeof part === 'string')
      .join(' ');
  }
  const normalized = name?.trim().normalize('NFKC').replace(/\s+/g, ' ');

  return normalized ? normalized.toLocaleLowerCase('en-US') : null;
};

const normalizedEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().normalize('NFKC').toLocaleLowerCase('en-US');

  return normalized.includes('@') ? normalized : null;
};

const personEmails = (person: ActivityImportPerson): string[] => {
  if (!person.emails || typeof person.emails !== 'object') return [];
  const emails = person.emails as {
    primaryEmail?: unknown;
    additionalEmails?: unknown;
  };

  return [
    normalizedEmail(emails.primaryEmail),
    ...(Array.isArray(emails.additionalEmails)
      ? emails.additionalEmails.map(normalizedEmail)
      : []),
  ].filter((email): email is string => email !== null);
};

const resolveContactId = ({
  row,
  companyId,
  people,
}: {
  row: SourceActivity;
  companyId: string;
  people: readonly ActivityImportPerson[];
}): string | null => {
  const sourceName = normalizedName(row.contactName);
  const sourceEmail = normalizedEmail(row.contactEmail);
  if (!sourceName && !sourceEmail) return null;
  const evidenceMatches = people.filter((person) => {
    if (!UUID_PATTERN.test(person.id)) {
      throw new Error('Activity import person snapshot is invalid');
    }

    return (
      (sourceName !== null && normalizedName(person.name) === sourceName) ||
      (sourceEmail !== null && personEmails(person).includes(sourceEmail))
    );
  });
  if (
    evidenceMatches.length !== 1 ||
    personCompanyId(evidenceMatches[0]!) !== companyId
  ) {
    return null;
  }

  return evidenceMatches[0]!.id;
};

const collisionProjection = (record: OutreachActivityRecord) => ({
  id: record.id,
  name: record.name,
  companyId: record.companyId,
  wholesalerId: record.wholesalerId,
  activityType: record.activityType,
  occurredAt: record.occurredAt,
  notes: record.notes ?? null,
  contactId: record.contactId ?? null,
  outcome: record.outcome ?? null,
});

const ACTIVITY_TYPE_LABELS: Record<CompletedActivityType, string> = {
  phone_call: 'Phone call',
  email: 'Email',
};
const ACTIVITY_OUTCOME_LABELS: Record<CanonicalActivityOutcome, string> = {
  left_voicemail: 'Left voicemail',
  no_response: 'No response',
  connected: 'Connected',
  follow_up_scheduled: 'Follow-up scheduled',
  not_interested: 'Not interested',
  other: 'Other',
};

export const buildActivityImportPlan = (input: {
  rows: readonly SourceActivity[];
  csvOptions: ActivityImportCsvOptions;
  identityArtifact: unknown;
  companies: readonly ActivityImportCompany[];
  wholesalers: readonly ActivityImportWholesaler[];
  people: readonly ActivityImportPerson[];
  existingActivities: readonly OutreachActivityRecord[];
}): ActivityImportPlan => {
  assertCsvOptions(input.csvOptions);
  if (input.rows.length !== input.csvOptions.expectedRows) {
    throw new Error('Activity import plan row count mismatch');
  }
  const identityArtifact = assertTerritoryIdentityArtifact(
    input.identityArtifact,
  );
  const ownerWorkspaceMemberId =
    identityArtifact.workspaceMemberIds[input.csvOptions.ownerLabel];
  const matchingWholesalers = input.wholesalers.filter(
    (wholesaler) =>
      relationWorkspaceMemberId(wholesaler) === ownerWorkspaceMemberId,
  );
  if (matchingWholesalers.length !== 1) {
    throw new Error(
      `${input.csvOptions.ownerLabel} must match exactly one wholesaler`,
    );
  }
  const wholesalerId = matchingWholesalers[0]!.id;
  if (!UUID_PATTERN.test(wholesalerId)) {
    throw new Error('Matched Nash wholesaler ID is invalid');
  }

  const companiesByExactName = new Map<string, ActivityImportCompany[]>();
  for (const company of input.companies) {
    if (typeof company.name !== 'string' || !UUID_PATTERN.test(company.id)) {
      throw new Error('Activity import company snapshot is invalid');
    }
    const exactName = company.name.trim().normalize('NFKC');
    const matches = companiesByExactName.get(exactName) ?? [];
    matches.push(company);
    companiesByExactName.set(exactName, matches);
  }
  const existingById = new Map<string, OutreachActivityRecord[]>();
  for (const activity of input.existingActivities) {
    const matches = existingById.get(activity.id) ?? [];
    matches.push(activity);
    existingById.set(activity.id, matches);
  }

  const activities = input.rows.map((row): PlannedActivity => {
    const companyMatches = companiesByExactName.get(row.companyName) ?? [];
    if (companyMatches.length !== 1) {
      throw new Error(
        `Activity import row ${row.rowNumber} must match exactly one company`,
      );
    }
    const companyId = companyMatches[0]!.id;
    const completedActivity =
      input.csvOptions.sourceFormat === 'completed-actions-v2';
    const activityKey = completedActivity
      ? `source-row:${row.sourceRowNumber}:action:${row.actionOrdinal}`
      : row.rowNumber;
    const record: OutreachActivityRecord = completedActivity
      ? {
          id: deterministicCompletedActivityId({
            provenanceSha256: input.csvOptions.provenanceSha256,
            ownerWorkspaceMemberId,
            sourceRowNumber: row.sourceRowNumber!,
            actionOrdinal: row.actionOrdinal!,
            activityType: row.activityType!,
            outcome: row.outcome!,
          }),
          name: `${ACTIVITY_TYPE_LABELS[row.activityType!]} · ${ACTIVITY_OUTCOME_LABELS[row.outcome!]}`,
          companyId,
          wholesalerId,
          activityType: row.activityType,
          outcome: row.outcome,
          occurredAt: row.occurredAt,
          notes: row.notes,
          contactId: null,
        }
      : {
          id: deterministicActivityId(input.csvOptions.importId, activityKey),
          name: 'Call',
          companyId,
          wholesalerId,
          activityType: 'call',
          occurredAt: row.occurredAt,
          notes: row.notes,
          contactId: resolveContactId({ row, companyId, people: input.people }),
        };
    const existingMatches = existingById.get(record.id) ?? [];
    if (
      existingMatches.length > 1 ||
      (existingMatches.length === 1 &&
        stableStringify(collisionProjection(existingMatches[0]!)) !==
          stableStringify(collisionProjection(record)))
    ) {
      throw new Error(
        `Activity import row ${row.rowNumber} has a deterministic activity ID collision`,
      );
    }

    return {
      rowNumber: row.rowNumber,
      state: existingMatches.length === 1 ? 'existing' : 'create',
      operationHash: sha256(stableStringify(record)),
      record,
    };
  });
  const activityIds = activities.map(({ record }) => record.id).sort();
  if (new Set(activityIds).size !== activityIds.length) {
    throw new Error('Activity import plan contains duplicate activity IDs');
  }
  const manifest: ActivityImportManifest = {
    schemaVersion: 2,
    sourceFormat: input.csvOptions.sourceFormat,
    ownerLabel: input.csvOptions.ownerLabel,
    sourceSha256: input.csvOptions.sourceSha256,
    provenanceSha256: input.csvOptions.provenanceSha256,
    rowSequenceSha256:
      input.csvOptions.expectedRowSequenceSha256 ??
      sha256(stableStringify(input.rows)),
    importIdHash: sha256(input.csvOptions.importId),
    expectedRows: input.csvOptions.expectedRows,
    activityDate: input.csvOptions.activityDate,
    timeZone: input.csvOptions.timeZone,
    rowCount: activities.length,
    blankNoteCount: input.rows.filter(({ notes }) => notes === null).length,
    distinctCompanyCount: new Set(
      activities.map(({ record }) => record.companyId),
    ).size,
    activityIdSetHash: sha256(activityIds.join('\n')),
    planHash: sha256(
      stableStringify(activities.map(({ operationHash }) => operationHash)),
    ),
    normalizationReceipt: input.csvOptions.normalizationReceipt
      ? { ...input.csvOptions.normalizationReceipt }
      : null,
  };

  return { manifest, activities };
};

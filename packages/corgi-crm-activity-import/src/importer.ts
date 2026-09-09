export type ActivityImportCsvOptions = {
  sourceSha256: string;
  expectedRows: number;
  activityDate: string;
  timeZone: string;
  importId: string;
};

export type SourceActivity = {
  rowNumber: number;
  companyName: string;
  notes: string | null;
  occurredAt: string;
};

export type ActivityImportCompany = { id: string; name: unknown };
export type ActivityImportWholesaler = {
  id: string;
  workspaceMemberId?: unknown;
  workspaceMember?: { id?: unknown } | null;
};
export type OutreachActivityRecord = Record<string, unknown> & { id: string };

export type TerritoryIdentityArtifact = {
  workspaceMemberIds: { Grace: string; Kelly: string; Nash: string };
  aggregateIdentityHash: string;
};

export type ActivityImportManifest = {
  schemaVersion: 1;
  sourceSha256: string;
  importIdHash: string;
  expectedRows: number;
  activityDate: string;
  timeZone: string;
  rowCount: number;
  blankNoteCount: number;
  distinctCompanyCount: number;
  activityIdSetHash: string;
  planHash: string;
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
const ACTIVITY_IMPORT_UUID_NAMESPACE = 'c0671000-75d5-5df7-a950-50da7105b2dd';

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
  if (!HASH_PATTERN.test(options.sourceSha256)) {
    throw new Error('Activity import source SHA-256 is invalid');
  }
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

const localNoonForRow = (
  activityDate: string,
  timeZone: string,
  rowIndex: number,
): string => {
  const [year, month, day] = activityDate.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const requestedLocal = Date.UTC(year, month - 1, day, 12, 0, rowIndex);
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
    verification.minute !== Math.floor(rowIndex / 60) % 60 ||
    verification.second !== rowIndex % 60
  ) {
    throw new Error('Activity import date could not be represented safely');
  }

  return instant.toISOString();
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
    const normalizedNotes = columns[7]!.trim().normalize('NFKC');

    return {
      rowNumber: rowIndex + 1,
      companyName,
      notes: normalizedNotes || null,
      occurredAt: localNoonForRow(
        options.activityDate,
        options.timeZone,
        rowIndex,
      ),
    };
  });
};

export const assertTerritoryIdentityArtifact = (
  value: unknown,
): TerritoryIdentityArtifact => {
  const artifact = value as TerritoryIdentityArtifact;
  const workspaceMemberIds = {
    Grace: artifact?.workspaceMemberIds?.Grace,
    Kelly: artifact?.workspaceMemberIds?.Kelly,
    Nash: artifact?.workspaceMemberIds?.Nash,
  };
  const expectedHash = sha256(
    `Grace=${workspaceMemberIds.Grace}\nKelly=${workspaceMemberIds.Kelly}\nNash=${workspaceMemberIds.Nash}`,
  );
  if (
    Object.keys((value as Record<string, unknown> | null) ?? {})
      .sort()
      .join(',') !== 'aggregateIdentityHash,workspaceMemberIds' ||
    Object.keys(artifact?.workspaceMemberIds ?? {})
      .sort()
      .join(',') !== 'Grace,Kelly,Nash' ||
    !Object.values(workspaceMemberIds).every(
      (id) => typeof id === 'string' && UUID_PATTERN.test(id),
    ) ||
    new Set(Object.values(workspaceMemberIds)).size !== 3 ||
    artifact.aggregateIdentityHash !== expectedHash
  ) {
    throw new Error('Territory identity artifact is invalid');
  }

  return {
    workspaceMemberIds:
      workspaceMemberIds as TerritoryIdentityArtifact['workspaceMemberIds'],
    aggregateIdentityHash: expectedHash,
  };
};

const uuidBytes = (uuid: string): Buffer =>
  Buffer.from(uuid.replace(/-/g, ''), 'hex');

const formatUuid = (bytes: Buffer): string => {
  const hex = bytes.toString('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

export const deterministicActivityId = (
  importId: string,
  rowNumber: number,
): string => {
  if (
    !IMPORT_ID_PATTERN.test(importId) ||
    !Number.isSafeInteger(rowNumber) ||
    rowNumber < 1
  ) {
    throw new Error('Deterministic activity identity input is invalid');
  }
  const digest = createHash('sha1')
    .update(uuidBytes(ACTIVITY_IMPORT_UUID_NAMESPACE))
    .update(`${importId}:${rowNumber}`, 'utf8')
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;

  return formatUuid(digest);
};

const relationWorkspaceMemberId = (
  wholesaler: ActivityImportWholesaler,
): unknown => wholesaler.workspaceMemberId ?? wholesaler.workspaceMember?.id;

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

export const buildActivityImportPlan = (input: {
  rows: readonly SourceActivity[];
  csvOptions: ActivityImportCsvOptions;
  identityArtifact: unknown;
  companies: readonly ActivityImportCompany[];
  wholesalers: readonly ActivityImportWholesaler[];
  existingActivities: readonly OutreachActivityRecord[];
}): ActivityImportPlan => {
  assertCsvOptions(input.csvOptions);
  if (input.rows.length !== input.csvOptions.expectedRows) {
    throw new Error('Activity import plan row count mismatch');
  }
  const identityArtifact = assertTerritoryIdentityArtifact(
    input.identityArtifact,
  );
  const matchingWholesalers = input.wholesalers.filter(
    (wholesaler) =>
      relationWorkspaceMemberId(wholesaler) ===
      identityArtifact.workspaceMemberIds.Nash,
  );
  if (matchingWholesalers.length !== 1) {
    throw new Error('Nash must match exactly one wholesaler');
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
    const record: OutreachActivityRecord = {
      id: deterministicActivityId(input.csvOptions.importId, row.rowNumber),
      name: 'Call',
      companyId: companyMatches[0]!.id,
      wholesalerId,
      activityType: 'call',
      occurredAt: row.occurredAt,
      notes: row.notes,
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
    schemaVersion: 1,
    sourceSha256: input.csvOptions.sourceSha256,
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
  };

  return { manifest, activities };
};
import { createHash } from 'node:crypto';

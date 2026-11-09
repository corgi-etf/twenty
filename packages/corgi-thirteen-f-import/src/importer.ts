import { createHash } from 'node:crypto';

import {
  SOURCE_DRIVE_ID,
  SOURCE_FOLDER_URL,
  SOURCE_LINK_LABEL,
} from './constants.ts';
import type { ValidatedExportFile } from './manifest.ts';

export type DownloadedSourceFile = Omit<ValidatedExportFile, 'downloadUrl'> & {
  bytes: Uint8Array;
  contentSha256: string;
};

export type CrmFileValue = {
  fileId: string;
  label: string;
  extension?: string;
  url?: string;
};

export type ThirteenFFilingRecord = {
  id: string;
  name?: string | null;
  ticker?: string | null;
  managerName?: string | null;
  reportPeriod?: string | null;
  file?: CrmFileValue[] | null;
  sourceDriveId?: string | null;
  sourceNodeId?: string | null;
  sourceVersionId?: string | null;
  sourceUpdatedAt?: string | null;
  sourceLink?: {
    primaryLinkUrl?: string | null;
    primaryLinkLabel?: string | null;
    secondaryLinks?: unknown[] | null;
  } | null;
  importPendingFileId?: string | null;
};

export type FilingCreateInput = Omit<ThirteenFFilingRecord, 'id'>;

export type UploadReservation = {
  fileId: string;
  uploadUrl: string;
  contentType: string;
  expiresAt: string;
};

export type ThirteenFImportApi = {
  listFilings(): Promise<ThirteenFFilingRecord[]>;
  createFiling(data: FilingCreateInput): Promise<ThirteenFFilingRecord>;
  patchFiling(
    recordId: string,
    data: Partial<FilingCreateInput>,
  ): Promise<void>;
  createFileUpload(input: {
    filename: string;
    sizeBytes: number;
  }): Promise<UploadReservation>;
  putFile(reservation: UploadReservation, bytes: Uint8Array): Promise<void>;
  completeFileUpload(
    fileId: string,
  ): Promise<'ready' | 'incomplete' | 'unknown'>;
  attachFile(input: {
    recordId: string;
    fileId: string;
    label: string;
  }): Promise<'attached' | 'pending' | 'missing'>;
  downloadAttachedFile(file: CrmFileValue): Promise<Uint8Array>;
};

export type ThirteenFImportResult = {
  created: number;
  metadataUpdated: number;
  repaired: number;
  skipped: number;
  verified: number;
};

const sourceLink = () => ({
  primaryLinkUrl: SOURCE_FOLDER_URL,
  primaryLinkLabel: SOURCE_LINK_LABEL,
  secondaryLinks: [],
});

const expectedMetadata = (source: DownloadedSourceFile): FilingCreateInput => ({
  name: source.name,
  ticker: source.ticker,
  sourceDriveId: SOURCE_DRIVE_ID,
  sourceNodeId: source.id,
  sourceVersionId: source.sourceVersionId,
  sourceUpdatedAt: source.updatedAt,
  sourceLink: sourceLink(),
});

const createInput = (source: DownloadedSourceFile): FilingCreateInput => ({
  ...expectedMetadata(source),
  managerName: null,
  reportPeriod: null,
  file: [],
  importPendingFileId: null,
});

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
};

const valuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));

const metadataPatch = (
  record: ThirteenFFilingRecord,
  source: DownloadedSourceFile,
): Partial<FilingCreateInput> => {
  const expected = expectedMetadata(source);
  const patch: Partial<FilingCreateInput> = {};
  for (const [name, value] of Object.entries(expected)) {
    const actual = record[name as keyof ThirteenFFilingRecord];
    const normalizedActual = value === null && actual === '' ? null : actual;
    if (!valuesEqual(normalizedActual, value)) {
      Object.assign(patch, { [name]: value });
    }
  }

  return patch;
};

const findRecord = async (
  api: ThirteenFImportApi,
  sourceNodeId: string,
): Promise<ThirteenFFilingRecord | undefined> => {
  const matches = (await api.listFilings()).filter(
    (record) => record.sourceNodeId === sourceNodeId,
  );
  if (matches.length > 1) {
    throw new Error('13F import conflict: duplicate source node');
  }

  return matches[0];
};

const assertSourceIdentity = (
  record: ThirteenFFilingRecord,
  source: DownloadedSourceFile,
): void => {
  if (
    record.sourceNodeId !== source.id ||
    record.sourceVersionId !== source.sourceVersionId
  ) {
    throw new Error('13F import conflict: source version changed');
  }
};

const verifyFileBytes = async (
  api: ThirteenFImportApi,
  file: CrmFileValue,
  source: DownloadedSourceFile,
): Promise<void> => {
  const bytes = await api.downloadAttachedFile(file);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (
    bytes.byteLength !== source.sizeBytes ||
    digest !== source.contentSha256
  ) {
    throw new Error('13F import verification failed for attached file');
  }
};

const verifyRecord = async (
  api: ThirteenFImportApi,
  record: ThirteenFFilingRecord,
  source: DownloadedSourceFile,
): Promise<void> => {
  assertSourceIdentity(record, source);
  const drift = metadataPatch(record, source);
  const files = record.file ?? [];
  if (
    Object.keys(drift).length > 0 ||
    files.length !== 1 ||
    Boolean(record.importPendingFileId?.trim()) ||
    files[0]?.label !== source.name
  ) {
    throw new Error('13F import verification failed for record state');
  }
  await verifyFileBytes(api, files[0]!, source);
};

const attachWithRetries = async (
  api: ThirteenFImportApi,
  input: { recordId: string; fileId: string; label: string },
): Promise<'attached' | 'pending' | 'missing'> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await api.attachFile(input);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? new Error('13F import attachment failed after bounded retries')
    : new Error('13F import attachment failed');
};

const reserveAndAttach = async (
  api: ThirteenFImportApi,
  record: ThirteenFFilingRecord,
  source: DownloadedSourceFile,
): Promise<void> => {
  const reservation = await api.createFileUpload({
    filename: source.name,
    sizeBytes: source.sizeBytes,
  });
  try {
    await api.patchFiling(record.id, {
      importPendingFileId: reservation.fileId,
    });
  } catch {
    const recovered = await findRecord(api, source.id);
    if (!recovered || recovered.importPendingFileId !== reservation.fileId) {
      throw new Error('13F import checkpoint failed');
    }
  }
  await api.putFile(reservation, source.bytes);
  const completion = await api.completeFileUpload(reservation.fileId);
  if (completion === 'incomplete') {
    throw new Error('13F import upload did not complete');
  }
  const outcome = await attachWithRetries(api, {
    recordId: record.id,
    fileId: reservation.fileId,
    label: source.name,
  });
  if (outcome !== 'attached') {
    throw new Error('13F import upload could not be attached');
  }
};

const repairMissingFile = async (
  api: ThirteenFImportApi,
  record: ThirteenFFilingRecord,
  source: DownloadedSourceFile,
): Promise<void> => {
  const pendingFileId = record.importPendingFileId?.trim();
  if (pendingFileId) {
    await api.completeFileUpload(pendingFileId);
    const outcome = await attachWithRetries(api, {
      recordId: record.id,
      fileId: pendingFileId,
      label: source.name,
    });
    if (outcome === 'attached') return;
    if (!['pending', 'missing'].includes(outcome)) {
      throw new Error('13F import pending-file recovery conflict');
    }
  }
  await reserveAndAttach(api, record, source);
};

const ensureRecord = async (
  api: ThirteenFImportApi,
  source: DownloadedSourceFile,
): Promise<{ record: ThirteenFFilingRecord; created: boolean }> => {
  const existing = await findRecord(api, source.id);
  if (existing) {
    assertSourceIdentity(existing, source);

    return { record: existing, created: false };
  }
  try {
    const record = await api.createFiling(createInput(source));
    assertSourceIdentity(record, source);

    return { record, created: true };
  } catch {
    const recovered = await findRecord(api, source.id);
    if (!recovered) throw new Error('13F import record creation failed');
    assertSourceIdentity(recovered, source);

    return { record: recovered, created: true };
  }
};

export const runConvergentImport = async (
  api: ThirteenFImportApi,
  sources: readonly DownloadedSourceFile[],
): Promise<ThirteenFImportResult> => {
  if (
    new Set(sources.map(({ id }) => id)).size !== sources.length ||
    new Set(sources.map(({ name }) => name.toLowerCase())).size !==
      sources.length
  ) {
    throw new Error('13F import conflict: duplicate source input');
  }
  const result: ThirteenFImportResult = {
    created: 0,
    metadataUpdated: 0,
    repaired: 0,
    skipped: 0,
    verified: 0,
  };
  for (const source of [...sources].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )) {
    const ensured = await ensureRecord(api, source);
    let record = ensured.record;
    if (ensured.created) result.created += 1;

    const patch = metadataPatch(record, source);
    if (Object.keys(patch).length > 0) {
      await api.patchFiling(record.id, patch);
      result.metadataUpdated += 1;
      record = { ...record, ...patch };
    }

    const files = record.file ?? [];
    if (files.length > 1) {
      throw new Error('13F import conflict: record has multiple files');
    }
    if (files.length === 1) {
      const file = files[0]!;
      if (
        record.importPendingFileId &&
        record.importPendingFileId !== file.fileId
      ) {
        throw new Error('13F import conflict: stale completed-file checkpoint');
      }
      if (file.label !== source.name || record.importPendingFileId) {
        const outcome = await attachWithRetries(api, {
          recordId: record.id,
          fileId: file.fileId,
          label: source.name,
        });
        if (outcome !== 'attached') {
          throw new Error(
            '13F import conflict: attached file could not converge',
          );
        }
        result.repaired += 1;
      } else if (!ensured.created && Object.keys(patch).length === 0) {
        result.skipped += 1;
      }
    } else {
      await repairMissingFile(api, record, source);
      result.repaired += 1;
    }

    const verified = await findRecord(api, source.id);
    if (!verified) throw new Error('13F import verification record is missing');
    await verifyRecord(api, verified, source);
    result.verified += 1;
  }

  const finalRecords = await api.listFilings();
  for (const source of sources) {
    const matches = finalRecords.filter(
      ({ sourceNodeId }) => sourceNodeId === source.id,
    );
    if (matches.length !== 1) {
      throw new Error('13F import verification source coverage mismatch');
    }
  }

  return result;
};

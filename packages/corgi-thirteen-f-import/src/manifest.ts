import { createHash } from 'node:crypto';

import {
  EXPECTED_FILE_COUNT,
  EXPECTED_MANIFEST_SHA256,
  EXPECTED_PDF_COUNT,
  EXPECTED_TICKER_COUNT,
  EXPECTED_TOTAL_BYTES,
  EXPECTED_XLSX_COUNT,
  MAX_EXPORT_URL_TTL_SECONDS,
  MAX_SOURCE_FILE_BYTES,
} from './constants.ts';

export type ExportSourceFile = {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  sourceVersionId: string;
  updatedAt: string;
  downloadUrl: string;
};

export type ValidatedExportFile = ExportSourceFile & { ticker: string | null };

export type ValidatedExportManifest = {
  returned: number;
  totalBytes: number;
  manifestSha256: string;
  expiresInSeconds: number;
  expiresAt: string;
  files: ValidatedExportFile[];
};

export type ExportManifestContract = {
  fileCount: number;
  totalBytes: number;
  manifestSha256: string;
  xlsxCount: number;
  pdfCount: number;
  tickerCount: number;
  maximumFileBytes: number;
};

const DEFAULT_CONTRACT: ExportManifestContract = {
  fileCount: EXPECTED_FILE_COUNT,
  totalBytes: EXPECTED_TOTAL_BYTES,
  manifestSha256: EXPECTED_MANIFEST_SHA256,
  xlsxCount: EXPECTED_XLSX_COUNT,
  pdfCount: EXPECTED_PDF_COUNT,
  tickerCount: EXPECTED_TICKER_COUNT,
  maximumFileBytes: MAX_SOURCE_FILE_BYTES,
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireString = (
  value: unknown,
  name: string,
  pattern?: RegExp,
): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    (pattern && !pattern.test(value))
  ) {
    throw new Error(`Export manifest has an invalid ${name}`);
  }

  return value;
};

const requireInteger = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`Export manifest has an invalid ${name}`);
  }

  return value;
};

export const deriveTicker = (name: string): string | null => {
  const match = name.match(/^(.+?) competitor holders\.xlsx$/i);
  if (!match) return null;
  const ticker = match[1]?.trim().toUpperCase() ?? '';

  return TICKER_PATTERN.test(ticker) ? ticker : null;
};

export const computeManifestSha256 = (
  files: readonly ExportSourceFile[],
): string => {
  const canonical = files
    .map(
      ({ id, name, contentType, sizeBytes, sourceVersionId, updatedAt }) => ({
        id,
        name,
        contentType,
        sizeBytes,
        s3VersionId: sourceVersionId,
        updatedAt,
      }),
    )
    .sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
};

const parseSourceFile = (
  value: unknown,
  maximumFileBytes: number,
): ValidatedExportFile => {
  if (!isRecord(value)) {
    throw new Error('Export manifest contains an invalid file');
  }
  const id = requireString(value.id, 'file ID', UUID_PATTERN);
  const name = requireString(value.name, 'file name');
  if (
    name.length > 255 ||
    name.includes('/') ||
    name.includes('\\') ||
    name === '.' ||
    name === '..' ||
    !/\.(xlsx|pdf)$/i.test(name)
  ) {
    throw new Error('Export manifest has an invalid file name');
  }
  const contentType = requireString(value.contentType, 'content type');
  const expectedContentType = name.toLowerCase().endsWith('.pdf')
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (contentType !== expectedContentType) {
    throw new Error('Export manifest has an invalid content type');
  }
  const sizeBytes = requireInteger(value.sizeBytes, 'file size');
  if (sizeBytes < 1 || sizeBytes > maximumFileBytes) {
    throw new Error('Export manifest has an invalid file size');
  }
  const sourceVersionId = requireString(
    value.sourceVersionId,
    'source version',
  );
  if (sourceVersionId.length > 1024) {
    throw new Error('Export manifest has an invalid source version');
  }
  const updatedAt = requireString(value.updatedAt, 'source timestamp');
  if (Number.isNaN(Date.parse(updatedAt))) {
    throw new Error('Export manifest has an invalid source timestamp');
  }
  const downloadUrl = requireString(value.downloadUrl, 'download URL');
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(downloadUrl);
  } catch {
    throw new Error('Export manifest has an invalid download URL');
  }
  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error('Export manifest has an invalid download URL');
  }

  return {
    id,
    name,
    contentType,
    sizeBytes,
    sourceVersionId,
    updatedAt,
    downloadUrl,
    ticker: deriveTicker(name),
  };
};

export const assertExportManifest = (
  value: unknown,
  options: { now?: Date; contract?: ExportManifestContract } = {},
): ValidatedExportManifest => {
  if (!isRecord(value)) {
    throw new Error('Export manifest is invalid');
  }
  const now = options.now ?? new Date();
  const contract = options.contract ?? DEFAULT_CONTRACT;
  const returned = requireInteger(value.returned, 'returned count');
  const totalBytes = requireInteger(value.totalBytes, 'total size');
  const manifestSha256 = requireString(
    value.manifestSha256,
    'manifest digest',
    SHA256_PATTERN,
  );
  const expiresInSeconds = requireInteger(
    value.expiresInSeconds,
    'URL lifetime',
  );
  const expiresAt = requireString(value.expiresAt, 'expiry');
  const expiresAtMilliseconds = Date.parse(expiresAt);
  if (
    expiresInSeconds < 1 ||
    expiresInSeconds > MAX_EXPORT_URL_TTL_SECONDS ||
    Number.isNaN(expiresAtMilliseconds) ||
    expiresAtMilliseconds <= now.getTime() ||
    expiresAtMilliseconds > now.getTime() + (expiresInSeconds + 30) * 1000
  ) {
    throw new Error('Export manifest is expired or has an invalid expiry');
  }
  if (!Array.isArray(value.files)) {
    throw new Error('Export manifest files are invalid');
  }
  const files = value.files.map((file) =>
    parseSourceFile(file, contract.maximumFileBytes),
  );
  const canonicalDigest = computeManifestSha256(files);
  const calculatedTotal = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const xlsxCount = files.filter(({ name }) =>
    name.toLowerCase().endsWith('.xlsx'),
  ).length;
  const pdfCount = files.filter(({ name }) =>
    name.toLowerCase().endsWith('.pdf'),
  ).length;
  const tickerCount = files.filter(({ ticker }) => ticker !== null).length;
  const uniqueIds = new Set(files.map(({ id }) => id));
  const uniqueNames = new Set(files.map(({ name }) => name.toLowerCase()));

  if (
    returned !== contract.fileCount ||
    files.length !== contract.fileCount ||
    totalBytes !== contract.totalBytes ||
    calculatedTotal !== contract.totalBytes ||
    manifestSha256 !== contract.manifestSha256 ||
    canonicalDigest !== contract.manifestSha256 ||
    xlsxCount !== contract.xlsxCount ||
    pdfCount !== contract.pdfCount ||
    tickerCount !== contract.tickerCount ||
    uniqueIds.size !== files.length ||
    uniqueNames.size !== files.length
  ) {
    throw new Error('Export manifest contract mismatch');
  }

  return {
    returned,
    totalBytes,
    manifestSha256,
    expiresInSeconds,
    expiresAt,
    files: files.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    ),
  };
};

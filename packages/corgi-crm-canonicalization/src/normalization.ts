import { createHash } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

type SourceLocatedRow = {
  sourceFile?: unknown;
  sourceSheet?: unknown;
  sourceRow?: unknown;
  rawData: unknown;
};

const normalizeForSerialization = (value: unknown): unknown => {
  if (value === undefined) {
    throw new Error('Cannot serialize undefined');
  }
  if (Array.isArray(value)) {
    return value.map(normalizeForSerialization);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [
          key,
          normalizeForSerialization(nestedValue),
        ]),
    );
  }

  return value;
};

export const stableStringify = (value: unknown): string =>
  JSON.stringify(normalizeForSerialization(value));

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export const parseRawData = (rawData: unknown): Record<string, unknown> => {
  let parsed = rawData;

  if (typeof rawData === 'string') {
    try {
      parsed = JSON.parse(rawData) as unknown;
    } catch {
      throw new Error('CRM row rawData must contain valid JSON');
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('CRM row rawData must be a JSON object');
  }

  return parsed as Record<string, unknown>;
};

const normalizeSemanticValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  }
  if (Array.isArray(value)) return value.map(normalizeSemanticValue);
  if (value !== null && typeof value === 'object') {
    return canonicalizeRawObject(value as Record<string, unknown>);
  }

  return value;
};

const canonicalizeRawObject = (
  rawData: Record<string, unknown>,
): Record<string, unknown> => {
  const entries = new Map<string, unknown>();

  for (const [rawKey, rawValue] of Object.entries(rawData)) {
    const key = normalizeKey(rawKey).normalize('NFC');
    const value = normalizeSemanticValue(rawValue);
    if (
      entries.has(key) &&
      stableStringify(entries.get(key)) !== stableStringify(value)
    ) {
      throw new Error(`Canonical rawData key collision for ${key}`);
    }
    entries.set(key, value);
  }

  return Object.fromEntries(
    [...entries].sort(([left], [right]) => left.localeCompare(right)),
  );
};

export const rawAuditKey = (rawData: unknown): string =>
  sha256(typeof rawData === 'string' ? rawData : stableStringify(rawData));

export const canonicalContentKey = (rawData: unknown): string =>
  sha256(stableStringify(canonicalizeRawObject(parseRawData(rawData))));

export const canonicalRowKey = (row: SourceLocatedRow): string =>
  sha256(
    stableStringify({
      sourceFile:
        typeof row.sourceFile === 'string'
          ? row.sourceFile.normalize('NFC').trim()
          : null,
      sourceSheet:
        typeof row.sourceSheet === 'string'
          ? row.sourceSheet.normalize('NFC').trim()
          : null,
      sourceRow: normalizeSourceRow(row.sourceRow),
      contentKey: canonicalContentKey(row.rawData),
    }),
  );

const normalizeSourceRow = (sourceRow: unknown): number | null => {
  if (sourceRow === null || sourceRow === undefined || sourceRow === '') {
    return null;
  }
  if (
    (typeof sourceRow !== 'number' && typeof sourceRow !== 'string') ||
    (typeof sourceRow === 'string' && !/^-?\d+$/.test(sourceRow.trim()))
  ) {
    throw new Error('CRM sourceRow must be a safe integer');
  }

  const numericSourceRow = Number(sourceRow);
  if (!Number.isSafeInteger(numericSourceRow)) {
    throw new Error('CRM sourceRow must be a safe integer');
  }

  return numericSourceRow;
};

export const normalizeEmail = (rawEmail: unknown): string | null => {
  if (typeof rawEmail !== 'string') return null;

  const email = rawEmail.trim().toLowerCase();

  return email.length <= 255 && /^[^\s@"]{1,64}@[^\s@]{1,255}$/u.test(email)
    ? email
    : null;
};

export type NormalizedPhone = {
  number: string;
  countryCode: string;
  callingCode: string;
  extension: string | null;
};

export const normalizePhone = (rawPhone: unknown): NormalizedPhone | null => {
  if (typeof rawPhone !== 'string') return null;

  const trimmedPhone = rawPhone.trim();
  const extensionMatch = trimmedPhone.match(
    /[\s,;]*(?:(?:ext(?:ension)?\.?|x|#)\s*(\d+))\s*$/i,
  );
  const withoutExtension = extensionMatch
    ? trimmedPhone.slice(0, extensionMatch.index).trim()
    : trimmedPhone;

  const parsedPhone = parsePhoneNumberFromString(
    withoutExtension,
    withoutExtension.startsWith('+') ? undefined : 'US',
  );
  if (!parsedPhone?.isValid() || !parsedPhone.country) return null;

  return {
    number: parsedPhone.nationalNumber,
    countryCode: parsedPhone.country,
    callingCode: `+${parsedPhone.countryCallingCode}`,
    extension: extensionMatch?.[1] ?? null,
  };
};

export const normalizeLinkedIn = (rawUrl: unknown): string | null => {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;

  const trimmedUrl = rawUrl.trim();
  const candidate = /^(?:www\.)?linkedin\.com(?:[/?#]|$)/i.test(trimmedUrl)
    ? `https://${trimmedUrl}`
    : trimmedUrl;

  try {
    const parsedUrl = new URL(candidate);
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');

    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      (hostname !== 'linkedin.com' && !hostname.endsWith('.linkedin.com')) ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      return null;
    }

    parsedUrl.protocol = 'https:';
    parsedUrl.hostname = hostname;
    parsedUrl.search = '';
    parsedUrl.hash = '';
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');

    return parsedUrl.href.replace(/\/$/, '');
  } catch {
    return null;
  }
};

export const normalizeDomain = (rawWebsite: unknown): string | null => {
  if (typeof rawWebsite !== 'string' || !rawWebsite.trim()) return null;

  try {
    const parsedUrl = new URL(
      rawWebsite.includes('://')
        ? rawWebsite.trim()
        : `https://${rawWebsite.trim()}`,
    );

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return null;
    if (parsedUrl.username || parsedUrl.password) return null;

    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');

    return hostname.includes('.') && /^[a-z0-9.-]+$/i.test(hostname)
      ? hostname
      : null;
  } catch {
    return null;
  }
};

export const normalizeKey = (key: string): string =>
  key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const textValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? stableStringify(value) : null;
  }

  return stableStringify(value);
};

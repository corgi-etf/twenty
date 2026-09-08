import { createHash } from 'node:crypto';

type SourceLocatedRow = {
  sourceFile?: unknown;
  sourceSheet?: unknown;
  sourceRow?: unknown;
  rawData: unknown;
};

const normalizeForSerialization = (value: unknown): unknown => {
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

export const canonicalContentKey = (rawData: unknown): string =>
  sha256(stableStringify(rawData));

export const canonicalRowKey = (row: SourceLocatedRow): string =>
  sha256(
    stableStringify({
      sourceFile: typeof row.sourceFile === 'string' ? row.sourceFile : null,
      sourceSheet: typeof row.sourceSheet === 'string' ? row.sourceSheet : null,
      sourceRow:
        typeof row.sourceRow === 'number' || typeof row.sourceRow === 'string'
          ? row.sourceRow
          : null,
      rawData: row.rawData,
    }),
  );

export const normalizeEmail = (rawEmail: unknown): string | null => {
  if (typeof rawEmail !== 'string') return null;

  const email = rawEmail.trim().toLowerCase();

  return email.length <= 255 && /^[^\s@"]{1,64}@[^\s@]{1,255}$/u.test(email)
    ? email
    : null;
};

export type NormalizedPhone = {
  number: string;
  countryCode: 'US';
  callingCode: '+1';
};

export const normalizePhone = (rawPhone: unknown): NormalizedPhone | null => {
  if (typeof rawPhone !== 'string') return null;

  const withoutExtension = rawPhone
    .trim()
    .replace(/[\s,;]*(?:(?:ext(?:ension)?\.?|x|#)\s*\d+)\s*$/i, '');

  if (!/^[+()\d.\s-]+$/.test(withoutExtension)) return null;

  const compactPhone = withoutExtension.replace(/[().\s-]/g, '');
  const nationalNumber = compactPhone.startsWith('+1')
    ? compactPhone.slice(2)
    : compactPhone.length === 11 && compactPhone.startsWith('1')
      ? compactPhone.slice(1)
      : compactPhone;

  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(nationalNumber)) return null;

  return { number: nationalNumber, countryCode: 'US', callingCode: '+1' };
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

    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');

    return hostname || null;
  } catch {
    return null;
  }
};

export const normalizeKey = (key: string): string =>
  key
    .trim()
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
    const values = value
      .map(textValue)
      .filter((item): item is string => !!item);

    return values.length > 0 ? values.join(', ') : null;
  }

  return stableStringify(value);
};

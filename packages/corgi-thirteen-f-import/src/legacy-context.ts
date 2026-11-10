import type { LegacyHoldingContext } from './ingestion-contract.ts';

const MAX_CONTEXT_TEXT_LENGTH = 500;
const MAX_RAW_DATA_BYTES = 64 * 1024;
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;

const contextText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  return normalized && normalized.length <= MAX_CONTEXT_TEXT_LENGTH
    ? normalized
    : undefined;
};

export const legacyDecimalString = (
  value: unknown,
  options: { nonnegative?: boolean } = {},
): string | undefined => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    const result = Object.is(value, -0) ? '0' : String(value);
    if (!/^-?\d+(?:\.\d+)?$/.test(result)) return undefined;

    return options.nonnegative && result.startsWith('-') ? undefined : result;
  }
  if (typeof value !== 'string' || value.length > 100) return undefined;
  let normalized = value.normalize('NFKC').trim();
  let parentheticalNegative = false;
  if (normalized.startsWith('(') && normalized.endsWith(')')) {
    parentheticalNegative = true;
    normalized = normalized.slice(1, -1);
  }
  normalized = normalized.replace(/[$,%\s,]/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return undefined;
  }
  let negative = normalized.startsWith('-') || parentheticalNegative;
  if (parentheticalNegative && /^[+-]/.test(normalized)) return undefined;
  normalized = normalized.replace(/^[+-]/, '');
  const [rawInteger = '', rawFraction] = normalized.split('.');
  const fraction = rawFraction || undefined;
  const integer = (rawInteger || '0').replace(/^0+(?=\d)/, '');
  const magnitude = fraction === undefined ? integer : `${integer}.${fraction}`;
  if (/^0(?:\.0*)?$/.test(magnitude)) negative = false;

  const result = `${negative ? '-' : ''}${magnitude}`;

  return options.nonnegative && result.startsWith('-') ? undefined : result;
};

const ticker = (value: unknown): string | undefined => {
  const normalized = contextText(value)?.toUpperCase();

  return normalized && TICKER_PATTERN.test(normalized) ? normalized : undefined;
};

const rawDataMetrics = (
  value: unknown,
): Pick<
  LegacyHoldingContext,
  'estimatedValue' | 'changeValue' | 'changePercent'
> => {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') > MAX_RAW_DATA_BYTES
  ) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};

  return compact({
    estimatedValue: legacyDecimalString(parsed['estimated value'], {
      nonnegative: true,
    }),
    changeValue: legacyDecimalString(parsed['change value']),
    changePercent: legacyDecimalString(parsed['change percent']),
  });
};

export const legacyHoldingContext = (values: {
  portfolioName?: unknown;
  targetTicker?: unknown;
  latestChange?: unknown;
  ownershipPercent?: unknown;
  portfolioPercent?: unknown;
  estimatedValue?: unknown;
  changeValue?: unknown;
  changePercent?: unknown;
  rawData?: unknown;
}): LegacyHoldingContext | undefined => {
  const fromRawData = rawDataMetrics(values.rawData);
  const context = compact({
    portfolioName: contextText(values.portfolioName),
    targetTicker: ticker(values.targetTicker),
    latestChange: legacyDecimalString(values.latestChange),
    ownershipPercent: legacyDecimalString(values.ownershipPercent, {
      nonnegative: true,
    }),
    portfolioPercent: legacyDecimalString(values.portfolioPercent, {
      nonnegative: true,
    }),
    estimatedValue:
      legacyDecimalString(values.estimatedValue, { nonnegative: true }) ??
      fromRawData.estimatedValue,
    changeValue:
      legacyDecimalString(values.changeValue) ?? fromRawData.changeValue,
    changePercent:
      legacyDecimalString(values.changePercent) ?? fromRawData.changePercent,
  });

  return Object.keys(context).length > 0 ? context : undefined;
};

const compact = <T extends Record<string, unknown>>(
  value: T,
): { [Key in keyof T]?: Exclude<T[Key], undefined> } =>
  Object.fromEntries(
    Object.entries(value).filter(([, child]) => child !== undefined),
  ) as { [Key in keyof T]?: Exclude<T[Key], undefined> };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

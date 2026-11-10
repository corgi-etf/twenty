import type { LegacyHoldingContext } from './ingestion-contract.ts';
import { canonicalDecimal } from './decimal.ts';

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

const quantityDecimal = (
  value: unknown,
  field: string,
  signed: boolean,
): string | undefined =>
  canonicalDecimal(value, { field, precision: 30, scale: 6, signed });

const percentageDecimal = (
  value: unknown,
  field: string,
  signed: boolean,
): string | undefined =>
  canonicalDecimal(value, { field, precision: 18, scale: 8, signed });

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
    estimatedValue: quantityDecimal(
      parsed['estimated value'],
      'estimatedValue',
      false,
    ),
    changeValue: quantityDecimal(parsed['change value'], 'changeValue', true),
    changePercent: percentageDecimal(
      parsed['change percent'],
      'changePercent',
      true,
    ),
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
    latestChange: quantityDecimal(values.latestChange, 'latestChange', true),
    ownershipPercent: percentageDecimal(
      values.ownershipPercent,
      'ownershipPercent',
      false,
    ),
    portfolioPercent: percentageDecimal(
      values.portfolioPercent,
      'portfolioPercent',
      false,
    ),
    estimatedValue:
      quantityDecimal(values.estimatedValue, 'estimatedValue', false) ??
      fromRawData.estimatedValue,
    changeValue:
      quantityDecimal(values.changeValue, 'changeValue', true) ??
      fromRawData.changeValue,
    changePercent:
      percentageDecimal(values.changePercent, 'changePercent', true) ??
      fromRawData.changePercent,
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

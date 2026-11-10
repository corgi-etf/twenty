export const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Not available';
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};

type DecimalParts = {
  isNegative: boolean;
  integer: string;
  fraction: string;
};

const parseDecimal = (
  value: string | null | undefined,
): DecimalParts | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return undefined;
  const integer = match[2]!.replace(/^0+(?=\d)/, '');
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  const isZero = /^0+$/.test(integer) && !/[1-9]/.test(fraction);
  return {
    isNegative: match[1] === '-' && !isZero,
    integer,
    fraction,
  };
};

const groupInteger = (integer: string) =>
  integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const renderUnsignedDecimal = (parts: DecimalParts) =>
  `${groupInteger(parts.integer)}${parts.fraction ? `.${parts.fraction}` : ''}`;

export const formatDecimal = (value: string | null | undefined) => {
  const parts = parseDecimal(value);
  if (!parts) return '—';
  return `${parts.isNegative ? '-' : ''}${renderUnsignedDecimal(parts)}`;
};

export const formatMoney = (value: string | null | undefined) => {
  const parts = parseDecimal(value);
  if (!parts) return '—';
  return `${parts.isNegative ? '-' : ''}$${renderUnsignedDecimal(parts)}`;
};

export const formatCount = (value: number | null | undefined) =>
  value === null ||
  value === undefined ||
  !Number.isSafeInteger(value) ||
  value < 0
    ? '—'
    : new Intl.NumberFormat('en-US').format(value);

export const formatChange = (value: string | null | undefined) => {
  const parts = parseDecimal(value);
  if (!parts) return '—';
  const unsigned = renderUnsignedDecimal(parts);
  const isZero = /^0(?:\.0*)?$/.test(unsigned);
  return `${parts.isNegative ? '-' : isZero ? '' : '+'}${unsigned}`;
};

export const formatPercent = (value: string | null | undefined) => {
  const formatted = formatDecimal(value);
  return formatted === '—' ? formatted : `${formatted}%`;
};

export const formatPercentChange = (value: string | null | undefined) => {
  const formatted = formatChange(value);
  return formatted === '—' ? formatted : `${formatted}%`;
};

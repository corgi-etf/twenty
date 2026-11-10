export type DecimalShape = {
  field: string;
  precision: number;
  scale: number;
  signed: boolean;
};

const DECIMAL_PATTERN =
  /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

export const canonicalDecimal = (
  value: unknown,
  shape: DecimalShape,
): string | undefined => {
  let source: string;
  let parentheticalNegative = false;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    source = Object.is(value, -0) ? '0' : String(value);
  } else if (typeof value === 'string' && value.length <= 100) {
    source = value.normalize('NFKC').trim();
    if (source.startsWith('(') && source.endsWith(')')) {
      parentheticalNegative = true;
      source = source.slice(1, -1);
    }
    source = source.replace(/[$,%\s,]/g, '');
  } else {
    return undefined;
  }

  const match = DECIMAL_PATTERN.exec(source);
  if (!match || (parentheticalNegative && match[1])) return undefined;
  const negative = parentheticalNegative || match[1] === '-';
  if (negative && !shape.signed) return undefined;
  const integer = match[2] ?? '';
  const fraction = match[3] ?? match[4] ?? '';
  const exponentText = match[5] ?? '0';
  if (exponentText.replace(/^[+-]/, '').length > 6) {
    throw precisionError(shape);
  }
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent)) throw precisionError(shape);

  let digits = `${integer || '0'}${fraction}`;
  let decimalPosition = (integer || '0').length + exponent;
  while (digits.startsWith('0')) {
    digits = digits.slice(1);
    decimalPosition -= 1;
  }
  while (digits.endsWith('0')) digits = digits.slice(0, -1);
  if (!digits) return '0';

  const integerDigits = Math.max(decimalPosition, 0);
  const fractionDigits =
    decimalPosition < 0
      ? -decimalPosition + digits.length
      : Math.max(0, digits.length - decimalPosition);
  if (
    integerDigits > shape.precision - shape.scale ||
    fractionDigits > shape.scale
  ) {
    throw precisionError(shape);
  }

  let magnitude: string;
  if (decimalPosition <= 0) {
    magnitude = `0.${'0'.repeat(-decimalPosition)}${digits}`;
  } else if (decimalPosition >= digits.length) {
    magnitude = `${digits}${'0'.repeat(decimalPosition - digits.length)}`;
  } else {
    magnitude = `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
  }

  return `${negative ? '-' : ''}${magnitude}`;
};

const precisionError = (shape: DecimalShape): Error =>
  new Error(
    `${shape.field} exceeds decimal precision ${shape.precision}, scale ${shape.scale}`,
  );

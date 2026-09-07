import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }

  return value;
};

export const canonicalJson = (value: unknown): string => {
  const serialized = JSON.stringify(canonicalize(value));

  if (serialized === undefined) {
    throw new Error('Cannot canonicalize undefined');
  }

  return serialized;
};

export const sourceRowHmac = (value: unknown, key: string): string => {
  if (key.length < 1) {
    throw new Error('A source row HMAC key is required');
  }

  return createHmac('sha256', key).update(canonicalJson(value)).digest('hex');
};

const hashPlan = (plan: object): string =>
  createHash('sha256').update(canonicalJson(plan)).digest('hex');

export const sealPlan = <T extends object>(plan: T): T & { planHash: string } => {
  return { ...plan, planHash: hashPlan(plan) };
};

export const assertPlanIntegrity = (plan: object & { planHash: string }) => {
  const { planHash, ...body } = plan;
  const expected = Buffer.from(hashPlan(body), 'hex');
  const actual = Buffer.from(planHash, 'hex');

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('Migration plan hash mismatch; the frozen plan was modified');
  }
};

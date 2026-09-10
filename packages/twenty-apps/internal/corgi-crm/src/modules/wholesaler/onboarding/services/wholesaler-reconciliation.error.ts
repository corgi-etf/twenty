export const WHOLESALER_RECONCILIATION_STAGES = [
  'validate_identity',
  'lookup_member_relation',
  'lookup_email',
  'resolve_identity',
  'create',
  'update',
] as const;

export type WholesalerReconciliationStage =
  (typeof WHOLESALER_RECONCILIATION_STAGES)[number];

export const WHOLESALER_RECONCILIATION_CODES = [
  'invalid_identity',
  'ambiguous_identity',
  'conflicting_link',
  'permission_denied',
  'schema_mismatch',
  'constraint_conflict',
  'transport',
  'unexpected',
] as const;

export type WholesalerReconciliationCode =
  (typeof WHOLESALER_RECONCILIATION_CODES)[number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const errorCodes = (error: unknown): string[] => {
  if (!isRecord(error)) return [];
  const directCode = isRecord(error.extensions)
    ? error.extensions.code
    : undefined;
  const nestedCodes = Array.isArray(error.errors)
    ? error.errors.flatMap((entry) => errorCodes(entry))
    : [];
  return [directCode, ...nestedCodes].filter(
    (code): code is string => typeof code === 'string',
  );
};

export const classifyWholesalerReconciliationError = (
  error: unknown,
): WholesalerReconciliationCode => {
  const codes = errorCodes(error).map((code) => code.toUpperCase());
  if (
    codes.some((code) =>
      ['FORBIDDEN', 'UNAUTHENTICATED', 'PERMISSION_DENIED'].includes(code),
    )
  ) {
    return 'permission_denied';
  }
  if (codes.includes('GRAPHQL_VALIDATION_FAILED')) return 'schema_mismatch';
  if (
    codes.some((code) =>
      [
        'CONFLICT',
        'QUERY_VIOLATES_UNIQUE_CONSTRAINT',
        'CONNECT_UNIQUE_CONSTRAINT_ERROR',
      ].includes(code),
    )
  ) {
    return 'constraint_conflict';
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (/permission|forbidden|unauthori[sz]ed/.test(message)) {
    return 'permission_denied';
  }
  if (/cannot query field|unknown (argument|field)|graphql validation/.test(message)) {
    return 'schema_mismatch';
  }
  if (/duplicate|unique constraint|conflict/.test(message)) {
    return 'constraint_conflict';
  }
  if (
    /fetch|network|timeout|timed out|socket|econn/.test(message)
  ) {
    return 'transport';
  }
  return 'unexpected';
};

export class WholesalerReconciliationError extends Error {
  public constructor(
    public readonly stage: WholesalerReconciliationStage,
    public readonly code: WholesalerReconciliationCode,
  ) {
    super(`Wholesaler reconciliation failed at ${stage} (${code})`);
    this.name = 'WholesalerReconciliationError';
  }
}

export const asWholesalerReconciliationError = (
  stage: WholesalerReconciliationStage,
  error: unknown,
): WholesalerReconciliationError =>
  error instanceof WholesalerReconciliationError
    ? error
    : new WholesalerReconciliationError(
        stage,
        classifyWholesalerReconciliationError(error),
      );

export const runWholesalerReconciliationStage = async <T>(
  stage: WholesalerReconciliationStage,
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    throw asWholesalerReconciliationError(stage, error);
  }
};

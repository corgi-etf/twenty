import { randomUUID } from 'node:crypto';

import type { FrozenMigrationPlan } from './execution.ts';
import { sealPlan, sourceRowHmac } from './integrity.ts';
import { buildPlan, type MinimalSnapshot } from './planner.ts';
import { buildMigrationSchema, type MigrationSchema } from './schema.ts';

export type CompleteMigrationPlan = FrozenMigrationPlan & {
  sourceFingerprint: string;
  schema: MigrationSchema;
};

export const createMigrationPlan = (
  snapshot: MinimalSnapshot,
  options: {
    hmacKey: string;
    migrationRunId?: string;
    createdAt?: Date;
  },
): CompleteMigrationPlan => {
  const migrationRunId = options.migrationRunId ?? randomUUID();
  const transformed = buildPlan(snapshot, {
    migrationRunId,
    hmacKey: options.hmacKey,
  });
  const body = {
    formatVersion: 1 as const,
    migrationRunId,
    createdAt: (options.createdAt ?? new Date()).toISOString(),
    sourceFingerprint: sourceRowHmac(snapshot, options.hmacKey),
    schema: buildMigrationSchema(snapshot.tags ?? []),
    ...transformed,
  };

  return sealPlan(body);
};

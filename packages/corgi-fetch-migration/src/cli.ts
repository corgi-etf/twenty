#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import {
  applyPlan,
  rollback,
  verifyPlan,
  type FrozenMigrationPlan,
  type RollbackManifest,
} from './execution.ts';
import { assertPlanIntegrity } from './integrity.ts';
import { createMigrationPlan, type CompleteMigrationPlan } from './plan.ts';
import { bootstrapSchema } from './schema-bootstrap.ts';
import { readSourceSnapshot } from './source-reader.ts';
import { TwentyClient } from './twenty-client.ts';

const argv = process.argv.slice(2);
const command = argv[0] ?? 'plan';

const option = (name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
};

const requiredOption = (name: string): string => {
  const value = option(name);
  if (!value) throw new Error(`Missing required option ${name}`);
  return value;
};

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};

const isMissingFileError = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const gitRoot = (): string | undefined => {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
};

export const assertExternalStatePath = (path: string): string => {
  if (!isAbsolute(path)) {
    throw new Error('Migration plans and manifests require an absolute path');
  }
  const resolved = resolve(path);
  const root = gitRoot();

  if (root) {
    const fromRoot = relative(root, resolved);
    if (
      fromRoot === '' ||
      (!fromRoot.startsWith('..') && !isAbsolute(fromRoot))
    ) {
      throw new Error(
        'Migration plans and manifests must be stored outside the Git worktree',
      );
    }
  }

  return resolved;
};

const readPlan = async (path: string): Promise<CompleteMigrationPlan> => {
  const plan = JSON.parse(
    await readFile(assertExternalStatePath(path), 'utf8'),
  ) as CompleteMigrationPlan;
  if (
    plan.formatVersion !== 1 ||
    !Array.isArray(plan.records) ||
    !plan.schema
  ) {
    throw new Error('Unsupported or malformed migration plan');
  }
  assertPlanIntegrity(plan);
  return plan;
};

const readManifest = async (path: string): Promise<RollbackManifest> => {
  const manifest = JSON.parse(
    await readFile(assertExternalStatePath(path), 'utf8'),
  ) as RollbackManifest;
  if (manifest.formatVersion !== 1 || !Array.isArray(manifest.mutations)) {
    throw new Error('Unsupported or malformed rollback manifest');
  }
  return manifest;
};

const writePrivateJson = async (path: string, value: unknown) => {
  await writeFile(
    assertExternalStatePath(path),
    `${JSON.stringify(value, null, 2)}\n`,
    {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    },
  );
};

const assertNewStatePath = async (path: string): Promise<string> => {
  const externalPath = assertExternalStatePath(path);

  try {
    await stat(externalPath);
    throw new Error(
      `Refusing to overwrite existing migration state: ${externalPath}`,
    );
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }

  return externalPath;
};

const client = () =>
  new TwentyClient(
    requiredEnv('TWENTY_BASE_URL'),
    requiredEnv('TWENTY_API_KEY'),
  );

const printPlanSummary = (plan: CompleteMigrationPlan) => {
  const counts = Object.fromEntries(
    [...new Set(plan.records.map(({ objectPlural }) => objectPlural))].map(
      (objectPlural) => [
        objectPlural,
        plan.records.filter((record) => record.objectPlural === objectPlural)
          .length,
      ],
    ),
  );
  process.stdout.write(
    `${JSON.stringify({
      mode: 'dry-run',
      migrationRunId: plan.migrationRunId,
      sourceFingerprint: plan.sourceFingerprint,
      counts,
      invitationsPlanned: plan.invitationPlan.length,
      warnings: plan.warnings.length,
    })}\n`,
  );
};

const main = async () => {
  if (command === 'plan') {
    const hmacKey = requiredEnv('FETCH_MIGRATION_HMAC_KEY');
    if (hmacKey.length < 32) {
      throw new Error(
        'FETCH_MIGRATION_HMAC_KEY must contain at least 32 characters',
      );
    }
    const plan = createMigrationPlan(
      await readSourceSnapshot(requiredEnv('FETCH_DATABASE_URL')),
      {
        hmacKey,
        migrationRunId: option('--run-id'),
      },
    );
    printPlanSummary(plan);
    const output = option('--out');
    if (output) await writePrivateJson(output, plan);
    return;
  }

  if (command === 'rollback') {
    if (requiredOption('--confirm') !== 'ROLLBACK_FETCH_MIGRATION') {
      throw new Error('Rollback confirmation phrase is incorrect');
    }
    process.stdout.write(
      `${JSON.stringify(
        await rollback(
          await readManifest(requiredOption('--manifest')),
          client(),
        ),
      )}\n`,
    );
    return;
  }

  const planPath = requiredOption('--plan');
  const plan = await readPlan(planPath);

  if (command === 'bootstrap') {
    if (requiredOption('--confirm') !== 'BOOTSTRAP_FETCH_SCHEMA') {
      throw new Error('Schema bootstrap confirmation phrase is incorrect');
    }
    const result = await bootstrapSchema(plan.schema, client());
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === 'apply') {
    if (requiredOption('--confirm') !== 'APPLY_FETCH_MIGRATION') {
      throw new Error('Apply confirmation phrase is incorrect');
    }
    const manifestPath = await assertNewStatePath(
      requiredOption('--manifest-out'),
    );
    const manifest = await applyPlan(plan as FrozenMigrationPlan, client());
    await writePrivateJson(manifestPath, manifest);
    process.stdout.write(
      `${JSON.stringify({ applied: manifest.mutations.length, manifestHash: manifest.manifestHash })}\n`,
    );
    return;
  }
  if (command === 'verify') {
    process.stdout.write(
      `${JSON.stringify(await verifyPlan(plan, client()))}\n`,
    );
    return;
  }
  throw new Error(
    'Usage: cli.ts plan|bootstrap|apply|verify|rollback [options]',
  );
};

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown migration error';
  process.stderr.write(`Migration failed: ${message}\n`);
  process.exitCode = 1;
});

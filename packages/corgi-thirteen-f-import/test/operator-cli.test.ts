import assert from 'node:assert/strict';
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { LegacyMigrationReceipt } from '../src/migration-runner.ts';
import {
  runOperatorImportCli,
  runOperatorImportCliMain,
} from '../src/operator-cli.ts';

const CRM_TOKEN = 'crm-read-token-example';
const BACKEND_TOKEN = 'backend-ingest-token-example';

const receipt: LegacyMigrationReceipt = {
  schemaVersion: 3,
  sourceSystem: 'LEGACY_NORMALIZED',
  coverage: 'PARTIAL',
  contentSha256: 'a'.repeat(64),
  sourceRows: 28_320,
  acceptedRows: 28_320,
  duplicateRows: 0,
  rejectedRows: 0,
  rejectionCounts: {},
  companyMappingCounts: { matched: 90, ambiguous: 0, unmatched: 10 },
  normalizedCounts: {
    managers: 100,
    filings: 100,
    securities: 500,
    holdings: 28_320,
  },
  backend: {
    batchId: 'batch-id',
    batchKey: `legacy-normalized-${'a'.repeat(64)}`,
    status: 'COMPLETED',
    receivedCounts: {
      managers: 100,
      filings: 100,
      securities: 500,
      holdings: 28_320,
      chunks: 73,
    },
    published: {
      managers: 100,
      filings: 100,
      securities: 500,
      holdings: 28_320,
    },
    completedAt: '2026-11-10T12:00:00.000Z',
  },
};

const credentialFile = async (
  directory: string,
  name: string,
  value: Record<string, unknown>,
): Promise<string> => {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(value), { mode: 0o600 });
  await chmod(path, 0o600);

  return path;
};

test('runs the existing lossless migration with separate operator credentials and fixed origins', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'corgi-13f-operator-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const crmCredentialPath = await credentialFile(directory, 'crm.json', {
    crmReadToken: CRM_TOKEN,
  });
  const backendCredentialPath = await credentialFile(
    directory,
    'backend.json',
    { backendIngestToken: BACKEND_TOKEN },
  );
  const receiptPath = join(directory, 'receipt.json');
  const created: Array<{ kind: string; origin: string; token: string }> = [];
  const output: string[] = [];
  let migrationCalls = 0;

  await runOperatorImportCli(
    [
      '--crm-credential-file',
      crmCredentialPath,
      '--backend-credential-file',
      backendCredentialPath,
      '--receipt-file',
      receiptPath,
    ],
    {
      createCrmClient: (options) => {
        created.push({ kind: 'crm', ...options });
        return {
          listCompanies: async () => [],
          listHoldings: async () => [],
        };
      },
      createBackendClient: (options) => {
        created.push({ kind: 'backend', ...options });
        return {
          ingestLegacyDataset: async () => {
            throw new Error('not called by the injected runner');
          },
        };
      },
      runMigration: async ({ crm, backend }) => {
        migrationCalls += 1;
        assert.ok(crm);
        assert.ok(backend);
        return receipt;
      },
      writeOutput: (value) => output.push(value),
    },
  );

  assert.equal(migrationCalls, 1);
  assert.deepEqual(created, [
    {
      kind: 'crm',
      origin: 'https://crm.corgiinvest.com',
      token: CRM_TOKEN,
    },
    {
      kind: 'backend',
      origin: 'https://admin.corgiinvest.com',
      token: BACKEND_TOKEN,
    },
  ]);
  assert.deepEqual(JSON.parse(await readFile(receiptPath, 'utf8')), receipt);
  assert.equal((await stat(receiptPath)).mode & 0o777, 0o600);
  assert.deepEqual(output, [
    'Migrated 28320 of 28320 normalized CRM holdings to the canonical 13F backend.\n',
  ]);
  assert.ok(!output.join('').includes(CRM_TOKEN));
  assert.ok(!output.join('').includes(BACKEND_TOKEN));
});

test('does not depend on workflow environment or GitHub OIDC identity', async () => {
  const source = await readFile(
    new URL('../src/operator-cli.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /github-oidc|ACTIONS_ID_TOKEN|GITHUB_/);
  assert.doesNotMatch(source, /process\.env/);
});

test('refuses missing, oversized, malformed, and non-0600 credential files', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'corgi-13f-operator-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const validBackend = await credentialFile(directory, 'backend.json', {
    backendIngestToken: BACKEND_TOKEN,
  });
  const receiptPath = join(directory, 'receipt.json');
  const base = [
    '--backend-credential-file',
    validBackend,
    '--receipt-file',
    receiptPath,
  ];

  const cases: Array<{ name: string; path: string; message: RegExp }> = [
    {
      name: 'missing',
      path: join(directory, 'missing.json'),
      message: /CRM read credential file is invalid/,
    },
    {
      name: 'oversized',
      path: await credentialFile(directory, 'oversized.json', {
        crmReadToken: 'x'.repeat(20_000),
      }),
      message: /CRM read credential file is invalid/,
    },
    {
      name: 'malformed',
      path: join(directory, 'malformed.json'),
      message: /CRM read credential file is invalid/,
    },
    {
      name: 'permissions',
      path: await credentialFile(directory, 'permissions.json', {
        crmReadToken: CRM_TOKEN,
      }),
      message: /CRM read credential file must use mode 0600/,
    },
  ];
  await writeFile(cases[2]!.path, '{not-json', { mode: 0o600 });
  await chmod(cases[3]!.path, 0o640);

  for (const item of cases) {
    await t.test(item.name, async () => {
      await assert.rejects(
        runOperatorImportCli(['--crm-credential-file', item.path, ...base], {
          runMigration: async () => receipt,
          writeOutput: () => undefined,
        }),
        item.message,
      );
    });
  }
});

test('requires distinct credential files and distinct scoped token values', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'corgi-13f-operator-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const samePath = await credentialFile(directory, 'same.json', {
    crmReadToken: CRM_TOKEN,
    backendIngestToken: BACKEND_TOKEN,
  });
  const crmCredentialPath = await credentialFile(directory, 'crm.json', {
    crmReadToken: CRM_TOKEN,
  });
  const backendCredentialPath = await credentialFile(
    directory,
    'backend.json',
    { backendIngestToken: CRM_TOKEN },
  );
  const receiptPath = join(directory, 'receipt.json');

  await assert.rejects(
    runOperatorImportCli(
      [
        '--crm-credential-file',
        samePath,
        '--backend-credential-file',
        samePath,
        '--receipt-file',
        receiptPath,
      ],
      { runMigration: async () => receipt, writeOutput: () => undefined },
    ),
    /separate credential files/,
  );
  await assert.rejects(
    runOperatorImportCli(
      [
        '--crm-credential-file',
        crmCredentialPath,
        '--backend-credential-file',
        backendCredentialPath,
        '--receipt-file',
        receiptPath,
      ],
      { runMigration: async () => receipt, writeOutput: () => undefined },
    ),
    /must be distinct/,
  );
});

test('top-level operator failure output never leaks credential values or nested errors', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'corgi-13f-operator-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const crmCredentialPath = await credentialFile(directory, 'crm.json', {
    crmReadToken: CRM_TOKEN,
  });
  const backendCredentialPath = await credentialFile(
    directory,
    'backend.json',
    { backendIngestToken: BACKEND_TOKEN },
  );
  const output: string[] = [];

  const exitCode = await runOperatorImportCliMain(
    [
      '--crm-credential-file',
      crmCredentialPath,
      '--backend-credential-file',
      backendCredentialPath,
      '--receipt-file',
      join(directory, 'receipt.json'),
    ],
    {
      runMigration: async () => {
        throw new Error(`${CRM_TOKEN}:${BACKEND_TOKEN}`);
      },
      writeOutput: () => undefined,
      writeError: (value) => output.push(value),
    },
  );

  assert.equal(exitCode, 1);
  assert.deepEqual(output, [
    'Corgi 13F operator migration failed; no credentials or row payloads were logged.\n',
  ]);
  assert.ok(!output.join('').includes(CRM_TOKEN));
  assert.ok(!output.join('').includes(BACKEND_TOKEN));
});

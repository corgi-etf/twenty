import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  preflightActivityImportArtifacts,
  writeActivityImportResult,
} from '../src/artifacts.ts';

test('confines source, identity, checkpoint, and result to RUNNER_TEMP', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'activity-import-artifacts-'));
  t.after(() => rm(root, { recursive: true }));
  const directory = join(root, 'import');
  await mkdir(directory);
  const sourcePath = join(directory, 'source.csv');
  const identityPath = join(directory, 'identity.json');
  await writeFile(sourcePath, 'Acme,,,,,,,,,\n');
  await writeFile(identityPath, '{}\n');

  const paths = await preflightActivityImportArtifacts({
    runnerTemp: root,
    sourcePath,
    identityPath,
    checkpointPath: join(directory, 'checkpoint.json'),
    resultPath: join(directory, 'result.json'),
  });

  assert.equal(paths.sourcePath, sourcePath);
  await assert.rejects(
    preflightActivityImportArtifacts({
      runnerTemp: root,
      sourcePath,
      identityPath,
      checkpointPath: join(directory, 'checkpoint.json'),
      resultPath: join(root, '..', 'escaped.json'),
    }),
    /must be below RUNNER_TEMP/,
  );
});

test('rejects symlinked PII source files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'activity-import-symlink-'));
  t.after(() => rm(root, { recursive: true }));
  const target = join(root, 'target.csv');
  const sourcePath = join(root, 'source.csv');
  const identityPath = join(root, 'identity.json');
  await writeFile(target, 'Acme,,,,,,,,,\n');
  await symlink(target, sourcePath);
  await writeFile(identityPath, '{}\n');

  await assert.rejects(
    preflightActivityImportArtifacts({
      runnerTemp: root,
      sourcePath,
      identityPath,
      checkpointPath: join(root, 'checkpoint.json'),
      resultPath: join(root, 'result.json'),
    }),
    /source file has an invalid type/,
  );
});

test('atomically writes only the PII-free result contract', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'activity-import-result-'));
  t.after(() => rm(root, { recursive: true }));
  const resultPath = join(root, 'result.json');
  await writeActivityImportResult(resultPath, {
    schemaVersion: 1,
    mode: 'dry-run',
    status: 'planned',
    manifest: {
      schemaVersion: 2,
      sourceFormat: 'completed-actions-v2',
      ownerLabel: 'Kelly',
      sourceSha256: '1'.repeat(64),
      provenanceSha256: '2'.repeat(64),
      rowSequenceSha256: '3'.repeat(64),
      importIdHash: '4'.repeat(64),
      expectedRows: 1,
      activityDate: '2026-09-09',
      timeZone: 'America/Chicago',
      rowCount: 1,
      blankNoteCount: 0,
      distinctCompanyCount: 1,
      activityIdSetHash: '5'.repeat(64),
      planHash: '6'.repeat(64),
      normalizationReceipt: {
        schemaVersion: 1,
        sourceFormat: 'completed-actions-v2',
        sourceDocumentSha256: '2'.repeat(64),
        normalizedCsvSha256: '1'.repeat(64),
        rowSequenceSha256: '3'.repeat(64),
        sourceRowCount: 1,
        activityCount: 1,
        phoneCallCount: 1,
        voicemailCount: 0,
        emailCount: 0,
      },
    },
    plannedCount: 1,
    createdCount: 0,
    alreadyPresentCount: 0,
  });
  const serialized = await readFile(resultPath, 'utf8');
  assert.match(serialized, /"sourceSha256"/);
  assert.doesNotMatch(serialized, /companyName|"notes"|"phone"|"email"/);
});

test('rejects v2 result manifests with mismatched normalization receipts', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'activity-import-receipt-'));
  t.after(() => rm(root, { recursive: true }));
  await assert.rejects(
    writeActivityImportResult(join(root, 'result.json'), {
      schemaVersion: 1,
      mode: 'dry-run',
      status: 'planned',
      manifest: {
        schemaVersion: 2,
        sourceFormat: 'completed-actions-v2',
        ownerLabel: 'Kelly',
        sourceSha256: '1'.repeat(64),
        provenanceSha256: '2'.repeat(64),
        rowSequenceSha256: '3'.repeat(64),
        importIdHash: '4'.repeat(64),
        expectedRows: 1,
        activityDate: '2026-09-09',
        timeZone: 'America/Chicago',
        rowCount: 1,
        blankNoteCount: 0,
        distinctCompanyCount: 1,
        activityIdSetHash: '5'.repeat(64),
        planHash: '6'.repeat(64),
        normalizationReceipt: {
          schemaVersion: 1,
          sourceFormat: 'completed-actions-v2',
          sourceDocumentSha256: '2'.repeat(64),
          normalizedCsvSha256: '0'.repeat(64),
          rowSequenceSha256: '3'.repeat(64),
          sourceRowCount: 1,
          activityCount: 2,
          phoneCallCount: 1,
          voicemailCount: 0,
          emailCount: 0,
        },
      },
      plannedCount: 1,
      createdCount: 0,
      alreadyPresentCount: 0,
    }),
    /manifest is invalid/,
  );
});

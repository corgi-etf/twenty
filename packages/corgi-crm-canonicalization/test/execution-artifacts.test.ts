import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { preflightCanonicalizationArtifacts } from '../src/execution-artifacts.ts';

test('artifact preflight proves distinct descendant file paths are writable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crm-artifacts-'));
  try {
    const paths = await preflightCanonicalizationArtifacts({
      runnerTemp: root,
      checkpointPath: join(root, 'canonicalization', 'checkpoint.json'),
      resultPath: join(root, 'canonicalization', 'result.json'),
    });

    assert.equal(paths.checkpointPath.endsWith('/checkpoint.json'), true);
    assert.equal(paths.resultPath.endsWith('/result.json'), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('artifact preflight rejects root, duplicate, existing result, and directory targets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crm-artifacts-'));
  const checkpoint = join(root, 'checkpoint.json');
  const result = join(root, 'result.json');
  try {
    await assert.rejects(
      preflightCanonicalizationArtifacts({
        runnerTemp: root,
        checkpointPath: root,
        resultPath: result,
      }),
      /below RUNNER_TEMP/,
    );
    await assert.rejects(
      preflightCanonicalizationArtifacts({
        runnerTemp: root,
        checkpointPath: checkpoint,
        resultPath: checkpoint,
      }),
      /distinct/,
    );
    await writeFile(result, 'stale', 'utf8');
    await assert.rejects(
      preflightCanonicalizationArtifacts({
        runnerTemp: root,
        checkpointPath: checkpoint,
        resultPath: result,
      }),
      /invalid type/,
    );
    await rm(result);
    await mkdir(result);
    await assert.rejects(
      preflightCanonicalizationArtifacts({
        runnerTemp: root,
        checkpointPath: checkpoint,
        resultPath: result,
      }),
      /invalid type/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('artifact preflight rejects a symlinked parent that escapes RUNNER_TEMP', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crm-artifacts-'));
  const outside = await mkdtemp(join(tmpdir(), 'crm-artifacts-outside-'));
  try {
    await symlink(outside, join(root, 'escaped'));
    await assert.rejects(
      preflightCanonicalizationArtifacts({
        runnerTemp: root,
        checkpointPath: join(root, 'escaped', 'checkpoint.json'),
        resultPath: join(root, 'result.json'),
      }),
      /escapes RUNNER_TEMP/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

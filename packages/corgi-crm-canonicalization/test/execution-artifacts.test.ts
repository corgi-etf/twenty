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

import { preflightCanonicalizationArtifacts } from '../src/execution-artifacts.ts';

const executionIdentity = {
  workflowRunId: '34312504637',
  workflowRunAttempt: '1',
  commitSha: '8c31abf86f5be2ee6b32f6ed8bb7f5daf8d0207a',
  mode: 'dry-run' as const,
};

test('artifact preflight proves distinct descendant file paths are writable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crm-artifacts-'));
  try {
    const paths = await preflightCanonicalizationArtifacts({
      runnerTemp: root,
      checkpointPath: join(root, 'canonicalization', 'checkpoint.json'),
      resultPath: join(root, 'canonicalization', 'result.json'),
      executionIdentity,
      playwrightRetry: 0,
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
        executionIdentity,
        playwrightRetry: 0,
      }),
      /below RUNNER_TEMP/,
    );
    await assert.rejects(
      preflightCanonicalizationArtifacts({
        runnerTemp: root,
        checkpointPath: checkpoint,
        resultPath: checkpoint,
        executionIdentity,
        playwrightRetry: 0,
      }),
      /distinct/,
    );
    await writeFile(result, 'stale', 'utf8');
    await assert.rejects(
      preflightCanonicalizationArtifacts({
        runnerTemp: root,
        checkpointPath: checkpoint,
        resultPath: result,
        executionIdentity,
        playwrightRetry: 0,
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
        executionIdentity,
        playwrightRetry: 0,
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
        executionIdentity,
        playwrightRetry: 0,
      }),
      /escapes RUNNER_TEMP/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('artifact preflight permits only a retry from the same workflow attempt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crm-artifacts-'));
  const checkpointPath = join(root, 'canonicalization', 'checkpoint.json');
  const resultPath = join(root, 'canonicalization', 'result.json');
  try {
    await preflightCanonicalizationArtifacts({
      runnerTemp: root,
      checkpointPath,
      resultPath,
      executionIdentity,
      playwrightRetry: 0,
    });
    await writeFile(resultPath, 'first attempt result', 'utf8');

    await preflightCanonicalizationArtifacts({
      runnerTemp: root,
      checkpointPath,
      resultPath,
      executionIdentity,
      playwrightRetry: 1,
    });
    assert.equal(await readFile(resultPath, 'utf8'), 'first attempt result');

    await assert.rejects(
      preflightCanonicalizationArtifacts({
        runnerTemp: root,
        checkpointPath,
        resultPath,
        executionIdentity: {
          ...executionIdentity,
          workflowRunAttempt: '2',
        },
        playwrightRetry: 1,
      }),
      /does not match this workflow attempt/,
    );
    await assert.rejects(
      preflightCanonicalizationArtifacts({
        runnerTemp: root,
        checkpointPath,
        resultPath,
        executionIdentity: { ...executionIdentity, mode: 'apply' },
        playwrightRetry: 1,
      }),
      /does not match this workflow attempt/,
    );
    await assert.rejects(
      preflightCanonicalizationArtifacts({
        runnerTemp: root,
        checkpointPath,
        resultPath,
        executionIdentity: { ...executionIdentity, mode: 'apply' },
        playwrightRetry: 0,
      }),
      /invalid type/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('artifact preflight rejects a retry without the same-attempt lease', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crm-artifacts-'));
  try {
    await writeFile(join(root, 'result.json'), 'stale', 'utf8');
    await assert.rejects(
      preflightCanonicalizationArtifacts({
        runnerTemp: root,
        checkpointPath: join(root, 'checkpoint.json'),
        resultPath: join(root, 'result.json'),
        executionIdentity,
        playwrightRetry: 1,
      }),
      /missing or invalid/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

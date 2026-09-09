import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  assertCompletedWorkspaceMetadataBootstrap,
  buildWorkspaceMetadataBootstrapArtifact,
  preflightWorkspaceMetadataBootstrapArtifact,
  writeWorkspaceMetadataBootstrapArtifact,
} from '../src/metadata-bootstrap-artifact.ts';

const deployedSha = 'a'.repeat(40);

test('writes and verifies PII-free exact-SHA metadata bootstrap evidence', async () => {
  const runnerTemp = await mkdtemp(join(tmpdir(), 'crm-metadata-bootstrap-'));
  try {
    const artifactPath = await preflightWorkspaceMetadataBootstrapArtifact({
      runnerTemp,
      artifactPath: join(runnerTemp, 'bootstrap', 'bootstrap.json'),
    });
    await writeWorkspaceMetadataBootstrapArtifact(
      artifactPath,
      buildWorkspaceMetadataBootstrapArtifact({ deployedSha }),
    );
    const raw = await readFile(artifactPath, 'utf8');
    assert.doesNotMatch(raw, /@|email|fullName|firstName|lastName/i);
    const verified = await assertCompletedWorkspaceMetadataBootstrap({
      artifactPath,
      expectedDeployedSha: deployedSha,
    });
    assert.equal(verified.deployedSha, deployedSha);
    assert.match(verified.metadataContractHash, /^[0-9a-f]{64}$/);

    await assert.rejects(
      assertCompletedWorkspaceMetadataBootstrap({
        artifactPath,
        expectedDeployedSha: 'b'.repeat(40),
      }),
      /artifact is invalid/,
    );
    await assert.rejects(
      writeWorkspaceMetadataBootstrapArtifact(artifactPath, {
        ...verified,
        email: 'forbidden@example.com',
      } as typeof verified),
      /artifact is invalid/,
    );
  } finally {
    await rm(runnerTemp, { recursive: true, force: true });
  }
});

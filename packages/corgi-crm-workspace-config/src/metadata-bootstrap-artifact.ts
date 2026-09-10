import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { WORKSPACE_METADATA_BOOTSTRAP_CONTRACT_HASH } from './execution.ts';
import { WORKSPACE_CONFIG_APPROVED_ORIGIN } from './twenty-api.ts';

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const WORKSPACE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkspaceMetadataBootstrapArtifact = {
  schemaVersion: 1;
  status: 'complete';
  origin: string;
  workspaceId: string;
  deployedSha: string;
  metadataContractHash: string;
};

type WorkspaceMetadataBootstrapArtifactEnvelope = {
  sha256: string;
  bootstrap: WorkspaceMetadataBootstrapArtifact;
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

const artifactHash = (artifact: WorkspaceMetadataBootstrapArtifact): string =>
  createHash('sha256').update(stableStringify(artifact), 'utf8').digest('hex');

export const buildWorkspaceMetadataBootstrapArtifact = ({
  deployedSha,
  workspaceId,
}: {
  deployedSha: string;
  workspaceId: string;
}): WorkspaceMetadataBootstrapArtifact => {
  if (
    !/^[0-9a-f]{40}$/.test(deployedSha) ||
    !WORKSPACE_ID_PATTERN.test(workspaceId)
  ) {
    throw new Error('Workspace metadata bootstrap deployed SHA is invalid');
  }

  return {
    schemaVersion: 1,
    status: 'complete',
    origin: WORKSPACE_CONFIG_APPROVED_ORIGIN,
    workspaceId,
    deployedSha,
    metadataContractHash: WORKSPACE_METADATA_BOOTSTRAP_CONTRACT_HASH,
  };
};

const assertArtifact = (
  value: unknown,
  expectedDeployedSha: string,
  expectedWorkspaceId: string,
): WorkspaceMetadataBootstrapArtifact => {
  const artifact = value as WorkspaceMetadataBootstrapArtifact;
  if (
    Object.keys(artifact ?? {})
      .sort()
      .join(',') !==
      'deployedSha,metadataContractHash,origin,schemaVersion,status,workspaceId' ||
    artifact?.schemaVersion !== 1 ||
    artifact.status !== 'complete' ||
    artifact.origin !== WORKSPACE_CONFIG_APPROVED_ORIGIN ||
    !WORKSPACE_ID_PATTERN.test(expectedWorkspaceId) ||
    artifact.workspaceId !== expectedWorkspaceId ||
    artifact.deployedSha !== expectedDeployedSha ||
    !/^[0-9a-f]{40}$/.test(artifact.deployedSha) ||
    artifact.metadataContractHash !== WORKSPACE_METADATA_BOOTSTRAP_CONTRACT_HASH
  ) {
    throw new Error('Workspace metadata bootstrap artifact is invalid');
  }

  return artifact;
};

export const preflightWorkspaceMetadataBootstrapArtifact = async ({
  runnerTemp,
  artifactPath,
}: {
  runnerTemp: string;
  artifactPath: string;
}): Promise<string> => {
  if (!runnerTemp || !artifactPath) {
    throw new Error('Workspace metadata bootstrap artifact path is required');
  }
  const lexicalRoot = resolve(runnerTemp);
  const physicalRoot = await realpath(lexicalRoot);
  const resolvedPath = resolve(artifactPath);
  if (!resolvedPath.startsWith(`${lexicalRoot}${sep}`)) {
    throw new Error(
      'Workspace metadata bootstrap artifact must be below RUNNER_TEMP',
    );
  }
  await mkdir(dirname(resolvedPath), { recursive: true });
  const physicalParent = await realpath(dirname(resolvedPath));
  if (
    physicalParent !== physicalRoot &&
    !physicalParent.startsWith(`${physicalRoot}${sep}`)
  ) {
    throw new Error(
      'Workspace metadata bootstrap artifact parent escapes RUNNER_TEMP',
    );
  }
  try {
    const status = await lstat(resolvedPath);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error(
        'Workspace metadata bootstrap artifact has an invalid type',
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  return resolvedPath;
};

export const writeWorkspaceMetadataBootstrapArtifact = async (
  artifactPath: string,
  artifact: WorkspaceMetadataBootstrapArtifact,
): Promise<void> => {
  const validated = assertArtifact(
    artifact,
    artifact.deployedSha,
    artifact.workspaceId,
  );
  const temporaryPath = `${artifactPath}.tmp-${randomUUID()}`;
  const envelope: WorkspaceMetadataBootstrapArtifactEnvelope = {
    sha256: artifactHash(validated),
    bootstrap: validated,
  };
  try {
    await writeFile(temporaryPath, `${JSON.stringify(envelope, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, artifactPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
};

export const assertCompletedWorkspaceMetadataBootstrap = async ({
  artifactPath,
  expectedDeployedSha,
  expectedWorkspaceId,
}: {
  artifactPath: string;
  expectedDeployedSha: string;
  expectedWorkspaceId: string;
}): Promise<WorkspaceMetadataBootstrapArtifact> => {
  let envelope: WorkspaceMetadataBootstrapArtifactEnvelope;
  try {
    envelope = JSON.parse(
      await readFile(artifactPath, 'utf8'),
    ) as WorkspaceMetadataBootstrapArtifactEnvelope;
  } catch {
    throw new Error('Workspace metadata bootstrap artifact is invalid JSON');
  }
  const artifact = assertArtifact(
    envelope.bootstrap,
    expectedDeployedSha,
    expectedWorkspaceId,
  );
  if (
    !HASH_PATTERN.test(envelope.sha256) ||
    envelope.sha256 !== artifactHash(artifact)
  ) {
    throw new Error(
      'Workspace metadata bootstrap artifact failed its integrity check',
    );
  }

  return artifact;
};

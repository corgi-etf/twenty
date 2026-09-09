import { randomUUID } from 'node:crypto';
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

export type CanonicalizationArtifactPaths = {
  checkpointPath: string;
  resultPath: string;
};

export type CanonicalizationArtifactExecutionIdentity = {
  workflowRunId: string;
  workflowRunAttempt: string;
  commitSha: string;
  mode: 'dry-run' | 'apply';
};

const strictDescendant = (root: string, candidate: string): string => {
  const resolved = resolve(candidate);
  if (!resolved.startsWith(`${root}${sep}`)) {
    throw new Error('Canonicalization artifact path must be below RUNNER_TEMP');
  }

  return resolved;
};

const assertTargetType = async (
  path: string,
  mayExist: boolean,
): Promise<void> => {
  try {
    const status = await lstat(path);
    if (!mayExist || !status.isFile() || status.isSymbolicLink()) {
      throw new Error('Canonicalization artifact target has an invalid type');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
};

const proveAtomicWrite = async (targetPath: string): Promise<void> => {
  const probe = `${targetPath}.preflight-${randomUUID()}`;
  const renamedProbe = `${probe}.renamed`;
  try {
    await writeFile(probe, 'canonicalization-preflight\n', {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(probe, renamedProbe);
    await unlink(renamedProbe);
  } catch {
    await unlink(probe).catch(() => undefined);
    await unlink(renamedProbe).catch(() => undefined);
    throw new Error(
      'Canonicalization artifact path is not atomically writable',
    );
  }
};

const assertExecutionIdentity = (
  identity: CanonicalizationArtifactExecutionIdentity,
): void => {
  if (
    !/^[1-9][0-9]*$/.test(identity.workflowRunId) ||
    !/^[1-9][0-9]*$/.test(identity.workflowRunAttempt) ||
    !/^[a-f0-9]{40}$/.test(identity.commitSha) ||
    (identity.mode !== 'dry-run' && identity.mode !== 'apply')
  ) {
    throw new Error('Canonicalization artifact execution identity is invalid');
  }
};

const assertRetryLease = async (
  leasePath: string,
  executionIdentity: CanonicalizationArtifactExecutionIdentity,
): Promise<void> => {
  await assertTargetType(leasePath, true);

  let lease: unknown;
  try {
    lease = JSON.parse(await readFile(leasePath, 'utf8'));
  } catch {
    throw new Error('Canonicalization retry lease is missing or invalid');
  }

  if (JSON.stringify(lease) !== JSON.stringify(executionIdentity)) {
    throw new Error(
      'Canonicalization retry lease does not match this workflow attempt',
    );
  }
};

export const preflightCanonicalizationArtifacts = async ({
  runnerTemp,
  checkpointPath,
  resultPath,
  executionIdentity,
  playwrightRetry,
}: {
  runnerTemp: string;
  checkpointPath: string;
  resultPath: string;
  executionIdentity: CanonicalizationArtifactExecutionIdentity;
  playwrightRetry: number;
}): Promise<CanonicalizationArtifactPaths> => {
  if (!runnerTemp || !checkpointPath || !resultPath) {
    throw new Error('Canonicalization artifact paths are required');
  }
  assertExecutionIdentity(executionIdentity);
  if (!Number.isSafeInteger(playwrightRetry) || playwrightRetry < 0) {
    throw new Error('Canonicalization Playwright retry index is invalid');
  }
  const lexicalRoot = resolve(runnerTemp);
  const physicalRoot = await realpath(lexicalRoot);
  const checkpoint = strictDescendant(lexicalRoot, checkpointPath);
  const result = strictDescendant(lexicalRoot, resultPath);
  const retryLease = `${result}.retry-lease.json`;
  if (checkpoint === result) {
    throw new Error('Canonicalization artifact paths must be distinct');
  }

  await mkdir(dirname(checkpoint), { recursive: true });
  await mkdir(dirname(result), { recursive: true });
  for (const parent of [dirname(checkpoint), dirname(result)]) {
    const resolvedParent = await realpath(parent);
    if (
      resolvedParent !== physicalRoot &&
      !resolvedParent.startsWith(`${physicalRoot}${sep}`)
    ) {
      throw new Error('Canonicalization artifact parent escapes RUNNER_TEMP');
    }
  }
  await assertTargetType(checkpoint, true);
  await assertTargetType(result, playwrightRetry > 0);
  await assertTargetType(retryLease, playwrightRetry > 0);
  await proveAtomicWrite(checkpoint);
  await proveAtomicWrite(result);

  if (playwrightRetry === 0) {
    await writeFile(retryLease, `${JSON.stringify(executionIdentity)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
  } else {
    await assertRetryLease(retryLease, executionIdentity);
  }

  return { checkpointPath: checkpoint, resultPath: result };
};

import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
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

export const preflightCanonicalizationArtifacts = async ({
  runnerTemp,
  checkpointPath,
  resultPath,
}: {
  runnerTemp: string;
  checkpointPath: string;
  resultPath: string;
}): Promise<CanonicalizationArtifactPaths> => {
  if (!runnerTemp || !checkpointPath || !resultPath) {
    throw new Error('Canonicalization artifact paths are required');
  }
  const lexicalRoot = resolve(runnerTemp);
  const physicalRoot = await realpath(lexicalRoot);
  const checkpoint = strictDescendant(lexicalRoot, checkpointPath);
  const result = strictDescendant(lexicalRoot, resultPath);
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
  await assertTargetType(result, false);
  await proveAtomicWrite(checkpoint);
  await proveAtomicWrite(result);

  return { checkpointPath: checkpoint, resultPath: result };
};

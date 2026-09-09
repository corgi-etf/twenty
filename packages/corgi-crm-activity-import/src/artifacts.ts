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

import { assertActivityImportManifest } from './execution.ts';
import type { ActivityImportRunResult } from './execution.ts';

export type ActivityImportArtifactPaths = {
  sourcePath: string;
  identityPath: string;
  checkpointPath: string;
  resultPath: string;
};

export const preflightActivityImportArtifacts = async (_input: {
  runnerTemp: string;
  sourcePath: string;
  identityPath: string;
  checkpointPath: string;
  resultPath: string;
}): Promise<ActivityImportArtifactPaths> => {
  const input = _input;
  if (
    !input.runnerTemp ||
    !input.sourcePath ||
    !input.identityPath ||
    !input.checkpointPath ||
    !input.resultPath
  ) {
    throw new Error('Activity import artifact paths are required');
  }
  const lexicalRoot = resolve(input.runnerTemp);
  const physicalRoot = await realpath(lexicalRoot);
  const paths: ActivityImportArtifactPaths = {
    sourcePath: resolve(input.sourcePath),
    identityPath: resolve(input.identityPath),
    checkpointPath: resolve(input.checkpointPath),
    resultPath: resolve(input.resultPath),
  };
  if (
    Object.values(paths).some(
      (candidate) => !candidate.startsWith(`${lexicalRoot}${sep}`),
    )
  ) {
    throw new Error('Activity import artifact must be below RUNNER_TEMP');
  }
  if (new Set(Object.values(paths)).size !== Object.values(paths).length) {
    throw new Error('Activity import artifact paths must be distinct');
  }

  for (const [label, path, maximumSize] of [
    ['source', paths.sourcePath, 5 * 1024 * 1024],
    ['identity', paths.identityPath, 64 * 1024],
  ] as const) {
    const status = await lstat(path);
    if (
      !status.isFile() ||
      status.isSymbolicLink() ||
      status.size < 1 ||
      status.size > maximumSize
    ) {
      throw new Error(`Activity import ${label} file has an invalid type`);
    }
    const physicalParent = await realpath(dirname(path));
    if (
      physicalParent !== physicalRoot &&
      !physicalParent.startsWith(`${physicalRoot}${sep}`)
    ) {
      throw new Error(`Activity import ${label} parent escapes RUNNER_TEMP`);
    }
  }
  for (const path of [paths.checkpointPath, paths.resultPath]) {
    await mkdir(dirname(path), { recursive: true });
    const physicalParent = await realpath(dirname(path));
    if (
      physicalParent !== physicalRoot &&
      !physicalParent.startsWith(`${physicalRoot}${sep}`)
    ) {
      throw new Error('Activity import artifact parent escapes RUNNER_TEMP');
    }
    try {
      const status = await lstat(path);
      if (!status.isFile() || status.isSymbolicLink()) {
        throw new Error('Activity import artifact target has an invalid type');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  return paths;
};

export const writeActivityImportResult = async (
  resultPath: string,
  result: ActivityImportRunResult,
): Promise<void> => {
  if (
    result?.schemaVersion !== 1 ||
    !['dry-run', 'apply'].includes(result.mode) ||
    !['planned', 'complete'].includes(result.status) ||
    ![result.plannedCount, result.createdCount, result.alreadyPresentCount].every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    ) ||
    (result.mode === 'apply' &&
      result.plannedCount !==
        result.createdCount + result.alreadyPresentCount) ||
    (result.mode === 'dry-run' && result.createdCount !== 0)
  ) {
    throw new Error('Activity import result is invalid');
  }
  assertActivityImportManifest(result.manifest);
  const temporaryPath = `${resultPath}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, resultPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
};

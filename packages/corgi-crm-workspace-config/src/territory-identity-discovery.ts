import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import type { WholesalerTerritoryRecord } from './planner.ts';

const WORKSPACE_MEMBER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const TERRITORY_IDENTITY_LABELS = ['Grace', 'Kelly', 'Nash'] as const;

type TerritoryIdentityLabel = (typeof TERRITORY_IDENTITY_LABELS)[number];

const aggregateIdentityHash = (
  workspaceMemberIds: TerritoryIdentityArtifact['workspaceMemberIds'],
): string => {
  const canonicalIdentities = TERRITORY_IDENTITY_LABELS.map(
    (label) => `${label}=${workspaceMemberIds[label]}`,
  ).join('\n');

  return createHash('sha256').update(canonicalIdentities, 'utf8').digest('hex');
};

export type TerritoryIdentityArtifact = {
  workspaceMemberIds: {
    Grace: string;
    Kelly: string;
    Nash: string;
  };
  aggregateIdentityHash: string;
};

export type TerritoryIdentityDiscoveryApi = {
  listWholesalers(): Promise<WholesalerTerritoryRecord[]>;
};

const normalizeFirstName = (name: unknown): string | null => {
  const candidate =
    typeof name === 'string'
      ? name.trim().split(/\s+/u)[0]
      : name !== null &&
          typeof name === 'object' &&
          !Array.isArray(name) &&
          typeof (name as { firstName?: unknown }).firstName === 'string'
        ? (name as { firstName: string }).firstName.trim()
        : undefined;

  return candidate
    ? candidate.normalize('NFKC').toLocaleLowerCase('en-US')
    : null;
};

export const buildTerritoryIdentityArtifact = (
  wholesalers: readonly WholesalerTerritoryRecord[],
): TerritoryIdentityArtifact => {
  const matches = new Map<TerritoryIdentityLabel, string[]>();
  const linkedWorkspaceMemberIds = new Set<string>();
  for (const label of TERRITORY_IDENTITY_LABELS) matches.set(label, []);

  for (const wholesaler of wholesalers) {
    const workspaceMember = wholesaler.workspaceMember;
    if (workspaceMember === null || workspaceMember === undefined) continue;
    const workspaceMemberId = workspaceMember.id;
    if (
      typeof workspaceMemberId !== 'string' ||
      !WORKSPACE_MEMBER_ID_PATTERN.test(workspaceMemberId)
    ) {
      throw new Error('A linked workspace member identity is invalid');
    }
    if (linkedWorkspaceMemberIds.has(workspaceMemberId)) {
      throw new Error('A linked workspace member identity is reused');
    }
    linkedWorkspaceMemberIds.add(workspaceMemberId);

    const normalizedFirstName = normalizeFirstName(wholesaler.name);
    if (!normalizedFirstName) {
      throw new Error('A linked Wholesaler name is invalid');
    }
    const label = TERRITORY_IDENTITY_LABELS.find(
      (candidate) =>
        candidate.toLocaleLowerCase('en-US') === normalizedFirstName,
    );
    if (label) matches.get(label)!.push(workspaceMemberId);
  }

  const workspaceMemberIds = Object.fromEntries(
    TERRITORY_IDENTITY_LABELS.map((label) => {
      const labelMatches = matches.get(label)!;
      if (labelMatches.length !== 1) {
        throw new Error(
          `${label} must resolve to exactly one current linked Wholesaler`,
        );
      }

      return [label, labelMatches[0]];
    }),
  ) as TerritoryIdentityArtifact['workspaceMemberIds'];
  if (new Set(Object.values(workspaceMemberIds)).size !== 3) {
    throw new Error('Discovered workspace member identities are not distinct');
  }
  return {
    workspaceMemberIds,
    aggregateIdentityHash: aggregateIdentityHash(workspaceMemberIds),
  };
};

export const runTerritoryIdentityDiscovery = async (
  api: TerritoryIdentityDiscoveryApi,
): Promise<TerritoryIdentityArtifact> => {
  return buildTerritoryIdentityArtifact(await api.listWholesalers());
};

export const preflightTerritoryIdentityArtifact = async ({
  runnerTemp,
  artifactPath,
}: {
  runnerTemp: string;
  artifactPath: string;
}): Promise<string> => {
  if (!runnerTemp || !artifactPath) {
    throw new Error('Territory identity artifact path is required');
  }
  const lexicalRoot = resolve(runnerTemp);
  const physicalRoot = await realpath(lexicalRoot);
  const resolvedPath = resolve(artifactPath);
  if (!resolvedPath.startsWith(`${lexicalRoot}${sep}`)) {
    throw new Error('Territory identity artifact must be below RUNNER_TEMP');
  }
  await mkdir(dirname(resolvedPath), { recursive: true });
  const physicalParent = await realpath(dirname(resolvedPath));
  if (
    physicalParent !== physicalRoot &&
    !physicalParent.startsWith(`${physicalRoot}${sep}`)
  ) {
    throw new Error('Territory identity artifact parent escapes RUNNER_TEMP');
  }
  try {
    const status = await lstat(resolvedPath);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error('Territory identity artifact has an invalid type');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  return resolvedPath;
};

export const writeTerritoryIdentityArtifact = async (
  artifactPath: string,
  artifact: TerritoryIdentityArtifact,
): Promise<void> => {
  const workspaceMemberIds = {
    Grace: artifact.workspaceMemberIds?.Grace,
    Kelly: artifact.workspaceMemberIds?.Kelly,
    Nash: artifact.workspaceMemberIds?.Nash,
  };
  if (
    !Object.values(workspaceMemberIds).every((workspaceMemberId) =>
      WORKSPACE_MEMBER_ID_PATTERN.test(workspaceMemberId),
    ) ||
    new Set(Object.values(workspaceMemberIds)).size !== 3 ||
    artifact.aggregateIdentityHash !== aggregateIdentityHash(workspaceMemberIds)
  ) {
    throw new Error('Territory identity artifact is invalid');
  }
  const safeArtifact: TerritoryIdentityArtifact = {
    workspaceMemberIds,
    aggregateIdentityHash: artifact.aggregateIdentityHash,
  };
  const temporaryPath = `${artifactPath}.tmp-${randomUUID()}`;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(safeArtifact, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
    await rename(temporaryPath, artifactPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
};

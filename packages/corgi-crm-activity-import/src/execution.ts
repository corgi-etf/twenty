import {
  buildActivityImportPlan,
  parseActivityCsv,
  type ActivityImportCompany,
  type ActivityImportCsvOptions,
  type ActivityImportManifest,
  type ActivityImportPerson,
  type ActivityImportWholesaler,
  type OutreachActivityRecord,
  type TerritoryIdentityArtifact,
} from './importer.ts';

const HASH_PATTERN = /^[a-f0-9]{64}$/;

export const assertActivityImportManifest = (
  value: unknown,
): ActivityImportManifest => {
  const manifest = value as ActivityImportManifest;
  if (
    manifest?.schemaVersion !== 1 ||
    ![
      manifest.sourceSha256,
      manifest.importIdHash,
      manifest.activityIdSetHash,
      manifest.planHash,
    ].every((hash) => typeof hash === 'string' && HASH_PATTERN.test(hash)) ||
    ![manifest.expectedRows, manifest.rowCount].every(
      (count) => Number.isSafeInteger(count) && count > 0,
    ) ||
    manifest.expectedRows !== manifest.rowCount ||
    ![manifest.blankNoteCount, manifest.distinctCompanyCount].every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    ) ||
    manifest.blankNoteCount > manifest.rowCount ||
    manifest.distinctCompanyCount > manifest.rowCount ||
    !/^\d{4}-\d{2}-\d{2}$/.test(manifest.activityDate) ||
    typeof manifest.timeZone !== 'string' ||
    !manifest.timeZone
  ) {
    throw new Error('Activity import manifest is invalid');
  }

  return manifest;
};

const sameManifest = (
  left: ActivityImportManifest,
  right: ActivityImportManifest,
): boolean =>
  Object.keys(left).length === Object.keys(right).length &&
  Object.entries(left).every(
    ([key, value]) => right[key as keyof ActivityImportManifest] === value,
  );

const assertCheckpoint = (
  value: ActivityImportCheckpoint,
  manifest: ActivityImportManifest,
): ActivityImportCheckpoint => {
  if (
    value?.schemaVersion !== 1 ||
    !['planned', 'applying', 'verifying', 'complete'].includes(value.status) ||
    !Array.isArray(value.completedOperationHashes) ||
    value.completedOperationHashes.some(
      (hash) => typeof hash !== 'string' || !HASH_PATTERN.test(hash),
    ) ||
    new Set(value.completedOperationHashes).size !==
      value.completedOperationHashes.length ||
    !sameManifest(assertActivityImportManifest(value.manifest), manifest)
  ) {
    throw new Error('Activity import checkpoint is invalid');
  }

  return value;
};

export type ActivityImportCheckpoint = {
  schemaVersion: 1;
  manifest: ActivityImportManifest;
  status: 'planned' | 'applying' | 'verifying' | 'complete';
  completedOperationHashes: string[];
};

export type ActivityImportApi = {
  listCompanies(): Promise<ActivityImportCompany[]>;
  listWholesalers(): Promise<ActivityImportWholesaler[]>;
  listPeople(): Promise<ActivityImportPerson[]>;
  listOutreachActivities(): Promise<OutreachActivityRecord[]>;
  createOutreachActivity(record: OutreachActivityRecord): Promise<void>;
  readCheckpoint(): Promise<ActivityImportCheckpoint | undefined>;
  writeCheckpoint(checkpoint: ActivityImportCheckpoint): Promise<void>;
};

export type ActivityImportRunResult = {
  schemaVersion: 1;
  mode: 'dry-run' | 'apply';
  status: 'planned' | 'complete';
  manifest: ActivityImportManifest;
  plannedCount: number;
  createdCount: number;
  alreadyPresentCount: number;
};

export const runActivityImport = async (
  api: ActivityImportApi,
  input: {
    source: Uint8Array;
    csvOptions: ActivityImportCsvOptions;
    identityArtifact: TerritoryIdentityArtifact;
    mode: 'dry-run' | 'apply';
    confirmation?: string;
    expectedManifest?: ActivityImportManifest;
  },
): Promise<ActivityImportRunResult> => {
  if (input.mode !== 'dry-run' && input.mode !== 'apply') {
    throw new Error('Activity import mode is invalid');
  }
  const rows = parseActivityCsv(input.source, input.csvOptions);
  const [companies, wholesalers, people, existingActivities] =
    await Promise.all([
      api.listCompanies(),
      api.listWholesalers(),
      api.listPeople(),
      api.listOutreachActivities(),
    ]);
  const plan = buildActivityImportPlan({
    rows,
    csvOptions: input.csvOptions,
    identityArtifact: input.identityArtifact,
    companies,
    wholesalers,
    people,
    existingActivities,
  });

  if (input.mode === 'apply') {
    if (input.confirmation !== 'IMPORT_CRM_OUTREACH_ACTIVITIES') {
      throw new Error('Activity import confirmation is invalid');
    }
    if (
      !input.expectedManifest ||
      !sameManifest(
        assertActivityImportManifest(input.expectedManifest),
        plan.manifest,
      )
    ) {
      throw new Error(
        'Activity import does not match the approved dry-run manifest',
      );
    }
  } else if (input.confirmation || input.expectedManifest) {
    throw new Error('Dry-run activity import cannot include apply approval');
  }

  const previousCheckpoint = await api.readCheckpoint();
  const completedOperationHashes = previousCheckpoint
    ? [
        ...assertCheckpoint(previousCheckpoint, plan.manifest)
          .completedOperationHashes,
      ]
    : [];
  const checkpoint: ActivityImportCheckpoint = {
    schemaVersion: 1,
    manifest: plan.manifest,
    status: input.mode === 'dry-run' ? 'planned' : 'applying',
    completedOperationHashes,
  };
  await api.writeCheckpoint(checkpoint);

  if (input.mode === 'dry-run') {
    return {
      schemaVersion: 1,
      mode: 'dry-run',
      status: 'planned',
      manifest: plan.manifest,
      plannedCount: plan.activities.length,
      createdCount: 0,
      alreadyPresentCount: plan.activities.filter(
        ({ state }) => state === 'existing',
      ).length,
    };
  }

  let createdCount = 0;
  for (const activity of plan.activities) {
    if (activity.state === 'existing') {
      if (!completedOperationHashes.includes(activity.operationHash)) {
        completedOperationHashes.push(activity.operationHash);
      }
      continue;
    }
    await api.createOutreachActivity(activity.record);
    createdCount += 1;
    if (!completedOperationHashes.includes(activity.operationHash)) {
      completedOperationHashes.push(activity.operationHash);
    }
    await api.writeCheckpoint({
      ...checkpoint,
      completedOperationHashes: [...completedOperationHashes],
    });
  }

  await api.writeCheckpoint({
    ...checkpoint,
    status: 'verifying',
    completedOperationHashes: [...completedOperationHashes],
  });
  const [
    verifiedCompanies,
    verifiedWholesalers,
    verifiedPeople,
    verifiedActivities,
  ] = await Promise.all([
    api.listCompanies(),
    api.listWholesalers(),
    api.listPeople(),
    api.listOutreachActivities(),
  ]);
  const verifiedPlan = buildActivityImportPlan({
    rows,
    csvOptions: input.csvOptions,
    identityArtifact: input.identityArtifact,
    companies: verifiedCompanies,
    wholesalers: verifiedWholesalers,
    people: verifiedPeople,
    existingActivities: verifiedActivities,
  });
  if (
    !sameManifest(verifiedPlan.manifest, plan.manifest) ||
    verifiedPlan.activities.some(({ state }) => state !== 'existing')
  ) {
    throw new Error('Activity import post-write verification failed');
  }
  await api.writeCheckpoint({
    ...checkpoint,
    status: 'complete',
    completedOperationHashes: plan.activities.map(
      ({ operationHash }) => operationHash,
    ),
  });

  return {
    schemaVersion: 1,
    mode: 'apply',
    status: 'complete',
    manifest: plan.manifest,
    plannedCount: plan.activities.length,
    createdCount,
    alreadyPresentCount: plan.activities.length - createdCount,
  };
};

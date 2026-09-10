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

const exactKeys = (value: unknown, keys: readonly string[]): boolean =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value as Record<string, unknown>)
    .sort()
    .join(',') === [...keys].sort().join(',');

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

const validNormalizationReceipt = (
  manifest: ActivityImportManifest,
): boolean => {
  const receipt = manifest.normalizationReceipt;
  if (manifest.sourceFormat === 'legacy-nash-outreach-v1') {
    return receipt === null;
  }

  return (
    exactKeys(receipt, [
      'schemaVersion',
      'sourceFormat',
      'sourceDocumentSha256',
      'normalizedCsvSha256',
      'rowSequenceSha256',
      'sourceRowCount',
      'activityCount',
      'phoneCallCount',
      'voicemailCount',
      'emailCount',
    ]) &&
    receipt?.schemaVersion === 1 &&
    receipt.sourceFormat === 'completed-actions-v2' &&
    receipt.sourceDocumentSha256 === manifest.provenanceSha256 &&
    receipt.normalizedCsvSha256 === manifest.sourceSha256 &&
    receipt.rowSequenceSha256 === manifest.rowSequenceSha256 &&
    [
      receipt.sourceRowCount,
      receipt.activityCount,
      receipt.phoneCallCount,
      receipt.voicemailCount,
      receipt.emailCount,
    ].every((count) => Number.isSafeInteger(count) && count >= 0) &&
    receipt.sourceRowCount > 0 &&
    receipt.activityCount === manifest.rowCount &&
    receipt.phoneCallCount + receipt.emailCount === receipt.activityCount &&
    receipt.voicemailCount <= receipt.phoneCallCount
  );
};

export const assertActivityImportManifest = (
  value: unknown,
): ActivityImportManifest => {
  const manifest = value as ActivityImportManifest;
  if (
    !exactKeys(manifest, [
      'schemaVersion',
      'sourceFormat',
      'ownerLabel',
      'sourceSha256',
      'provenanceSha256',
      'rowSequenceSha256',
      'importIdHash',
      'expectedRows',
      'activityDate',
      'timeZone',
      'rowCount',
      'blankNoteCount',
      'distinctCompanyCount',
      'activityIdSetHash',
      'planHash',
      'normalizationReceipt',
    ]) ||
    manifest?.schemaVersion !== 2 ||
    !['legacy-nash-outreach-v1', 'completed-actions-v2'].includes(
      manifest.sourceFormat,
    ) ||
    !['Grace', 'Kelly', 'Nash'].includes(manifest.ownerLabel) ||
    (manifest.sourceFormat === 'legacy-nash-outreach-v1' &&
      (manifest.ownerLabel !== 'Nash' ||
        manifest.provenanceSha256 !== manifest.sourceSha256)) ||
    ![
      manifest.sourceSha256,
      manifest.provenanceSha256,
      manifest.rowSequenceSha256,
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
    !manifest.timeZone ||
    !validNormalizationReceipt(manifest)
  ) {
    throw new Error('Activity import manifest is invalid');
  }

  return manifest;
};

const sameManifest = (
  left: ActivityImportManifest,
  right: ActivityImportManifest,
): boolean => stableStringify(left) === stableStringify(right);

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

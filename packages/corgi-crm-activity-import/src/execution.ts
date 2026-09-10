import {
  assertStableCompanyListing,
  buildActivityImportPlan,
  buildCompanyCreationPlan,
  buildDuplicateCompanyResolutionPlan,
  findDuplicateCompanyGroups,
  findSoftDeletedNamesakes,
  parseActivityCsv,
  summarizeCompanyLinks,
  type ActivityImportCompany,
  type ActivityImportCsvOptions,
  type ActivityImportManifest,
  type ActivityImportPerson,
  type ActivityImportWholesaler,
  type CompanyLinkProbeRecord,
  type DuplicateCompanyGroupReport,
  type SoftDeletedNamesake,
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
    !['Grace', 'Nash'].includes(manifest.ownerLabel) ||
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
  // Optional so an API that only imports activities still satisfies this
  // contract; company creation fails closed when it is absent.
  createCompany?(company: { name: string }): Promise<void>;
  // The default listing hides soft-deleted records, so the zero-match check
  // cannot see a namesake waiting to be restored. Creation fails closed
  // without this rather than creating over one it cannot see.
  listSoftDeletedCompanies?(): Promise<ActivityImportCompany[]>;
  // Same contract for duplicate resolution: without both of these the
  // operation cannot prove a record is empty, so it refuses to remove one.
  readCompanyLinks?(companyId: string): Promise<CompanyLinkProbeRecord>;
  deleteCompany?(companyId: string): Promise<void>;
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

export type CompanyCreationRunResult = {
  schemaVersion: 1;
  operation: 'create-companies';
  mode: 'dry-run' | 'apply';
  plannedCount: number;
  createdCount: number;
  alreadyPresentCount: number;
  plannedNames: string[];
  softDeletedNamesakes: SoftDeletedNamesake[];
};

export type DuplicateCompanyResolutionRunResult = {
  schemaVersion: 1;
  operation: 'resolve-duplicate-companies';
  mode: 'dry-run' | 'apply';
  duplicateGroupCount: number;
  plannedRemovalCount: number;
  removedCount: number;
  blockedGroupCount: number;
  groups: DuplicateCompanyGroupReport[];
};

// Deliberately separate from runActivityImport rather than a flag inside it:
// company creation cannot produce an activity manifest while the companies are
// still missing, so it is its own operation and the import path stays untouched.
export const runActivityImportCompanyCreation = async (
  api: ActivityImportApi,
  input: {
    source: Uint8Array;
    csvOptions: ActivityImportCsvOptions;
    mode: 'dry-run' | 'apply';
    confirmation?: string;
  },
): Promise<CompanyCreationRunResult> => {
  if (input.mode !== 'dry-run' && input.mode !== 'apply') {
    throw new Error('Activity import company creation mode is invalid');
  }
  // Bound rather than detached: an API implemented as a class would lose
  // its receiver through a bare method reference.
  const createCompany = api.createCompany?.bind(api);
  if (input.mode === 'apply') {
    if (input.confirmation !== 'CREATE_CRM_IMPORT_COMPANIES') {
      throw new Error(
        'Activity import company creation confirmation is invalid',
      );
    }
    if (!createCompany) {
      throw new Error('Activity import API cannot create companies');
    }
  } else if (input.confirmation) {
    throw new Error('Dry-run company creation cannot include apply approval');
  }

  const listSoftDeletedCompanies = api.listSoftDeletedCompanies?.bind(api);
  if (input.mode === 'apply' && !listSoftDeletedCompanies) {
    throw new Error(
      'Activity import API cannot see soft-deleted companies',
    );
  }

  const rows = parseActivityCsv(input.source, input.csvOptions);
  // Two independent walks, compared. The whole plan rests on this listing
  // being complete, and a paginated walk that silently dropped a record would
  // read as a zero match and mint a duplicate.
  const companies = await api.listCompanies();
  assertStableCompanyListing(companies, await api.listCompanies());
  const plan = buildCompanyCreationPlan({ rows, companies });
  // A row matching two or more companies stays fail-closed. The exact-match
  // contract is what surfaced the missing companies in the first place, and a
  // duplicate is a human decision rather than a reason to mint another record.
  if (plan.ambiguousRows.length > 0) {
    throw new Error(
      plan.ambiguousRows
        .map(
          ({ rowNumber, companyName, matchCount }) =>
            `Activity import row ${rowNumber} matched ${matchCount} companies ` +
            `("${companyName}"); resolve the duplicate before creating companies`,
        )
        .join('\n'),
    );
  }
  const plannedNames = plan.creations.map(({ name }) => name);
  // Only the names about to be created matter: a namesake behind a name that
  // already matches one live company is latent, not something this run would
  // act on, so it is reported rather than treated as a blocker.
  const softDeletedNamesakes = listSoftDeletedCompanies
    ? findSoftDeletedNamesakes({
        names: plannedNames,
        softDeletedCompanies: await listSoftDeletedCompanies(),
      })
    : [];

  if (input.mode === 'dry-run') {
    return {
      schemaVersion: 1,
      operation: 'create-companies',
      mode: 'dry-run',
      plannedCount: plannedNames.length,
      createdCount: 0,
      alreadyPresentCount: plan.alreadyPresentCount,
      plannedNames,
      softDeletedNamesakes,
    };
  }
  if (!createCompany) {
    throw new Error('Activity import API cannot create companies');
  }
  // Creating over a soft-deleted namesake builds the exact trap that produced
  // the BMG Advisors duplicate: invisible to the check now, a duplicate the
  // moment someone restores it. Restoring or purging it is a human decision.
  if (softDeletedNamesakes.length > 0) {
    throw new Error(
      softDeletedNamesakes
        .map(
          ({ name, companyIds }) =>
            `Activity import company creation refused "${name}": ` +
            `${companyIds.length} soft-deleted company already carries that name; ` +
            'restore or purge it instead of creating a second record',
        )
        .join('\n'),
    );
  }

  for (const creation of plan.creations) {
    // Name only, verbatim from the source row. The Company object carries no
    // phone or email field, so the source contact columns cannot land here.
    await createCompany({ name: creation.name });
  }

  // Re-read rather than trusting the writes: the next import matches on what
  // the CRM actually stored, not on what these requests claimed to store.
  const verified = buildCompanyCreationPlan({
    rows,
    companies: await api.listCompanies(),
  });
  if (verified.creations.length > 0 || verified.ambiguousRows.length > 0) {
    throw new Error(
      'Activity import company creation post-write verification failed',
    );
  }

  return {
    schemaVersion: 1,
    operation: 'create-companies',
    mode: 'apply',
    plannedCount: plannedNames.length,
    createdCount: plannedNames.length,
    alreadyPresentCount: plan.alreadyPresentCount,
    plannedNames,
    softDeletedNamesakes,
  };
};

// Removal is a soft delete, and deleteCompany MUST request one: Twenty's REST
// DELETE destroys by default, and destroying a company cascades into its
// companyAllocations and nulls the company on its meetingBookings. Every
// record this removes is provably empty so neither would bite today, but a
// soft delete stays reversible if the emptiness proof is ever wrong and a
// destroy does not. Twenty's default listing excludes soft-deleted records, so
// the exact-match count drops immediately and the blocked import proceeds.
export const runActivityImportDuplicateCompanyResolution = async (
  api: ActivityImportApi,
  input: {
    source: Uint8Array;
    csvOptions: ActivityImportCsvOptions;
    mode: 'dry-run' | 'apply';
    confirmation?: string;
  },
): Promise<DuplicateCompanyResolutionRunResult> => {
  if (input.mode !== 'dry-run' && input.mode !== 'apply') {
    throw new Error('Activity import duplicate resolution mode is invalid');
  }
  // Bound rather than detached: an API implemented as a class would lose
  // its receiver through a bare method reference.
  const readCompanyLinks = api.readCompanyLinks?.bind(api);
  const deleteCompany = api.deleteCompany?.bind(api);
  if (input.mode === 'apply') {
    if (input.confirmation !== 'RESOLVE_CRM_DUPLICATE_COMPANIES') {
      throw new Error(
        'Activity import duplicate resolution confirmation is invalid',
      );
    }
    if (!deleteCompany) {
      throw new Error('Activity import API cannot remove companies');
    }
  } else if (input.confirmation) {
    throw new Error('Dry-run duplicate resolution cannot include apply approval');
  }
  if (!readCompanyLinks) {
    throw new Error('Activity import API cannot inspect company links');
  }

  const rows = parseActivityCsv(input.source, input.csvOptions);
  const names = rows.map(({ companyName }) => companyName);
  const groups = findDuplicateCompanyGroups({
    companies: await api.listCompanies(),
    names,
  });

  const linkSummaries = [];
  for (const group of groups) {
    for (const company of group.companies) {
      linkSummaries.push(
        summarizeCompanyLinks({
          companyId: company.id,
          record: await readCompanyLinks(company.id),
        }),
      );
    }
  }
  const plan = buildDuplicateCompanyResolutionPlan({ groups, linkSummaries });

  const report = {
    schemaVersion: 1 as const,
    operation: 'resolve-duplicate-companies' as const,
    duplicateGroupCount: groups.length,
    plannedRemovalCount: plan.removals.length,
    blockedGroupCount: plan.blockedGroupCount,
    groups: plan.groups,
  };

  if (input.mode === 'dry-run') {
    return { ...report, mode: 'dry-run', removedCount: 0 };
  }
  if (!deleteCompany) {
    throw new Error('Activity import API cannot remove companies');
  }

  for (const removal of plan.removals) {
    await deleteCompany(removal.companyId);
  }

  // Re-read rather than trusting the writes: the next import matches on what
  // the CRM actually lists, not on what these requests claimed to remove.
  const verifiedCompanies = await api.listCompanies();
  const removedIds = new Set(plan.removals.map(({ companyId }) => companyId));
  const verifiedGroups = findDuplicateCompanyGroups({
    companies: verifiedCompanies,
    names,
  });
  // Blocked groups are still duplicated on purpose, so only the names this run
  // claimed to resolve have to come back unique.
  const stillDuplicated = new Set(verifiedGroups.map(({ name }) => name));
  if (
    verifiedCompanies.some(({ id }) => removedIds.has(id)) ||
    plan.resolvedNames.some((name) => stillDuplicated.has(name))
  ) {
    throw new Error(
      'Activity import duplicate resolution post-write verification failed',
    );
  }

  return { ...report, mode: 'apply', removedCount: plan.removals.length };
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

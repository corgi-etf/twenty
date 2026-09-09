import { createHash } from 'node:crypto';

import {
  buildTerritoryProjectionPlan,
  buildWorkspaceConfigPlan,
  type CompanyTerritoryRecord,
  type WorkspaceConfigPlan,
  type WorkspaceConfigSnapshot,
  type WorkspaceLayoutPlan,
  workspaceConfigOperationCount,
} from './planner.ts';

export const APPLY_WORKSPACE_CONFIG_CONFIRMATION =
  'APPLY_TERRITORY_FIRST_CRM_CONFIGURATION';

export type WorkspaceConfigCheckpoint = {
  schemaVersion: 1;
  origin: string;
  expectedCompanyCount: number;
  companyIdentityHash: string;
  sourceProjectionHash: string;
  expectedProjectionHash: string;
  status: 'preflight' | 'metadata' | 'projections' | 'layout' | 'complete';
  completedOperationHashes: string[];
};

export type WorkspaceConfigApi = {
  listWorkspaceConfigSnapshot(): Promise<WorkspaceConfigSnapshot>;
  listCompanies(): Promise<CompanyTerritoryRecord[]>;
  createMetadataField(
    input: WorkspaceConfigPlan['metadataFieldsToCreate'][number],
  ): Promise<void>;
  updateMetadataFieldLabel(id: string, label: string): Promise<void>;
  conditionalPatchCompany(
    id: string,
    expectedUpdatedAt: string,
    data: { stateRegion: string | null; postalCode: string | null },
  ): Promise<void>;
  createView(
    input: WorkspaceLayoutPlan['viewsToCreate'][number],
  ): Promise<void>;
  updateView(
    id: string,
    update: WorkspaceLayoutPlan['viewUpdates'][number]['update'],
  ): Promise<void>;
  createViewField(
    input: WorkspaceLayoutPlan['viewFieldsToCreate'][number],
  ): Promise<void>;
  updateViewField(
    id: string,
    update: WorkspaceLayoutPlan['viewFieldUpdates'][number]['update'],
  ): Promise<void>;
  createViewFilter(
    input: WorkspaceLayoutPlan['viewFiltersToCreate'][number],
  ): Promise<void>;
  deleteViewFilter(id: string): Promise<void>;
  deleteViewSort(id: string): Promise<void>;
  createViewSort(
    input: WorkspaceLayoutPlan['viewSortsToCreate'][number],
  ): Promise<void>;
  deleteNavigationItems(ids: string[]): Promise<void>;
  createNavigationItems(
    inputs: WorkspaceLayoutPlan['navigationItemsToCreate'],
  ): Promise<void>;
  updateNavigationItems(
    inputs: WorkspaceLayoutPlan['navigationItemUpdates'],
  ): Promise<void>;
  readCheckpoint(): Promise<WorkspaceConfigCheckpoint | undefined>;
  writeCheckpoint(checkpoint: WorkspaceConfigCheckpoint): Promise<void>;
};

export type WorkspaceConfigRunOptions = {
  origin: string;
  expectedOrigin: string;
  expectedCompanyCount: number;
  confirmation: string;
};

export type WorkspaceConfigRunResult = {
  companyCount: number;
  companyMutations: number;
  metadataMutations: number;
  layoutMutations: number;
  companyIdentityHash: string;
  sourceProjectionHash: string;
  expectedProjectionHash: string;
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

const operationHash = (value: unknown): string =>
  createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');

const HASH_PATTERN = /^[a-f0-9]{64}$/;

export const assertWorkspaceConfigCheckpoint = (
  value: unknown,
): WorkspaceConfigCheckpoint => {
  const checkpoint = value as WorkspaceConfigCheckpoint;
  if (
    checkpoint?.schemaVersion !== 1 ||
    typeof checkpoint.origin !== 'string' ||
    new URL(checkpoint.origin).origin !== checkpoint.origin ||
    !Number.isSafeInteger(checkpoint.expectedCompanyCount) ||
    checkpoint.expectedCompanyCount < 1 ||
    ![
      checkpoint.companyIdentityHash,
      checkpoint.sourceProjectionHash,
      checkpoint.expectedProjectionHash,
    ].every((hash) => typeof hash === 'string' && HASH_PATTERN.test(hash)) ||
    !['preflight', 'metadata', 'projections', 'layout', 'complete'].includes(
      checkpoint.status,
    ) ||
    !Array.isArray(checkpoint.completedOperationHashes) ||
    checkpoint.completedOperationHashes.some(
      (hash) => typeof hash !== 'string' || !HASH_PATTERN.test(hash),
    ) ||
    new Set(checkpoint.completedOperationHashes).size !==
      checkpoint.completedOperationHashes.length
  ) {
    throw new Error('Workspace configuration checkpoint is invalid');
  }

  return checkpoint;
};

const assertRunGate = (options: WorkspaceConfigRunOptions): void => {
  let origin = '';
  let expectedOrigin = '';
  try {
    origin = new URL(options.origin).origin;
    expectedOrigin = new URL(options.expectedOrigin).origin;
  } catch {
    throw new Error('Workspace configuration origin is invalid');
  }
  if (
    options.origin !== origin ||
    options.expectedOrigin !== expectedOrigin ||
    origin !== expectedOrigin ||
    origin !== 'https://crm.corgiinvest.com'
  ) {
    throw new Error('Workspace configuration origin is not approved');
  }
  if (options.confirmation !== APPLY_WORKSPACE_CONFIG_CONFIRMATION) {
    throw new Error('Workspace configuration confirmation is invalid');
  }
  if (
    !Number.isSafeInteger(options.expectedCompanyCount) ||
    options.expectedCompanyCount < 1
  ) {
    throw new Error(
      'Expected workspace configuration company count is invalid',
    );
  }
};

const recordCompletedOperation = async (
  api: WorkspaceConfigApi,
  checkpoint: WorkspaceConfigCheckpoint,
  operation: unknown,
): Promise<void> => {
  const hash = operationHash(operation);
  if (!checkpoint.completedOperationHashes.includes(hash)) {
    checkpoint.completedOperationHashes.push(hash);
    checkpoint.completedOperationHashes.sort();
  }
  await api.writeCheckpoint(checkpoint);
};

const applyMetadataPlan = async ({
  api,
  checkpoint,
  plan,
}: {
  api: WorkspaceConfigApi;
  checkpoint: WorkspaceConfigCheckpoint;
  plan: WorkspaceConfigPlan;
}): Promise<number> => {
  let applied = 0;
  checkpoint.status = 'metadata';
  await api.writeCheckpoint(checkpoint);
  for (const input of plan.metadataFieldsToCreate) {
    await api.createMetadataField(input);
    applied += 1;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'create-metadata-field',
      input,
    });
  }
  for (const update of plan.metadataFieldsToUpdate) {
    await api.updateMetadataFieldLabel(update.id, update.label);
    applied += 1;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'update-metadata-field-label',
      ...update,
    });
  }

  return applied;
};

export const applyWorkspaceLayoutPlan = async ({
  api,
  checkpoint,
  plan,
}: {
  api: WorkspaceConfigApi;
  checkpoint: WorkspaceConfigCheckpoint;
  plan: WorkspaceLayoutPlan;
}): Promise<number> => {
  let applied = 0;
  checkpoint.status = 'layout';
  await api.writeCheckpoint(checkpoint);
  for (const input of plan.viewsToCreate) {
    await api.createView(input);
    applied += 1;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'create-view',
      input,
    });
  }
  for (const { id, update } of plan.viewUpdates) {
    await api.updateView(id, update);
    applied += 1;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'update-view',
      id,
      update,
    });
  }
  for (const input of plan.viewFieldsToCreate) {
    await api.createViewField(input);
    applied += 1;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'create-view-field',
      input,
    });
  }
  for (const { id, update } of plan.viewFieldUpdates) {
    await api.updateViewField(id, update);
    applied += 1;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'update-view-field',
      id,
      update,
    });
  }
  for (const id of plan.viewFilterIdsToDelete) {
    await api.deleteViewFilter(id);
    applied += 1;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'delete-view-filter',
      id,
    });
  }
  for (const input of plan.viewFiltersToCreate) {
    await api.createViewFilter(input);
    applied += 1;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'create-view-filter',
      input,
    });
  }
  for (const id of plan.viewSortIdsToDelete) {
    await api.deleteViewSort(id);
    applied += 1;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'delete-view-sort',
      id,
    });
  }
  for (const input of plan.viewSortsToCreate) {
    await api.createViewSort(input);
    applied += 1;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'create-view-sort',
      input,
    });
  }
  if (plan.navigationItemIdsToDelete.length > 0) {
    await api.deleteNavigationItems(plan.navigationItemIdsToDelete);
    applied += plan.navigationItemIdsToDelete.length;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'delete-navigation-items',
      ids: [...plan.navigationItemIdsToDelete].sort(),
    });
  }
  if (plan.navigationItemsToCreate.length > 0) {
    await api.createNavigationItems(plan.navigationItemsToCreate);
    applied += plan.navigationItemsToCreate.length;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'create-navigation-items',
      inputs: plan.navigationItemsToCreate,
    });
  }
  if (plan.navigationItemUpdates.length > 0) {
    await api.updateNavigationItems(plan.navigationItemUpdates);
    applied += plan.navigationItemUpdates.length;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'update-navigation-items',
      inputs: plan.navigationItemUpdates,
    });
  }

  return applied;
};

export const runWorkspaceConfiguration = async (
  api: WorkspaceConfigApi,
  options: WorkspaceConfigRunOptions,
): Promise<WorkspaceConfigRunResult> => {
  assertRunGate(options);
  const initialCompanies = await api.listCompanies();
  const initialProjection = buildTerritoryProjectionPlan(
    initialCompanies,
    options.expectedCompanyCount,
  );
  const resumedCheckpoint = await api.readCheckpoint();
  const checkpoint = resumedCheckpoint
    ? assertWorkspaceConfigCheckpoint(resumedCheckpoint)
    : {
        schemaVersion: 1 as const,
        origin: options.origin,
        expectedCompanyCount: options.expectedCompanyCount,
        companyIdentityHash: initialProjection.companyIdentityHash,
        sourceProjectionHash: initialProjection.sourceProjectionHash,
        expectedProjectionHash: initialProjection.expectedProjectionHash,
        status: 'preflight' as const,
        completedOperationHashes: [],
      };
  if (
    checkpoint.origin !== options.origin ||
    checkpoint.expectedCompanyCount !== options.expectedCompanyCount ||
    checkpoint.companyIdentityHash !== initialProjection.companyIdentityHash ||
    checkpoint.sourceProjectionHash !==
      initialProjection.sourceProjectionHash ||
    checkpoint.expectedProjectionHash !==
      initialProjection.expectedProjectionHash
  ) {
    throw new Error(
      'Workspace configuration checkpoint does not match live data',
    );
  }
  checkpoint.status = 'preflight';
  await api.writeCheckpoint(checkpoint);

  let snapshot = await api.listWorkspaceConfigSnapshot();
  let configPlan = buildWorkspaceConfigPlan(snapshot);
  const metadataMutations = await applyMetadataPlan({
    api,
    checkpoint,
    plan: configPlan,
  });
  if (metadataMutations > 0) {
    snapshot = await api.listWorkspaceConfigSnapshot();
    configPlan = buildWorkspaceConfigPlan(snapshot);
    if (
      configPlan.metadataFieldsToCreate.length > 0 ||
      configPlan.metadataFieldsToUpdate.length > 0
    ) {
      throw new Error('Workspace metadata did not converge after mutation');
    }
  }
  if (!configPlan.layout) {
    throw new Error(
      'Workspace layout cannot be planned before metadata converges',
    );
  }

  checkpoint.status = 'projections';
  await api.writeCheckpoint(checkpoint);
  let companyMutations = 0;
  for (const mutation of initialProjection.mutations) {
    await api.conditionalPatchCompany(
      mutation.id,
      mutation.expectedUpdatedAt,
      mutation.data,
    );
    companyMutations += 1;
    await recordCompletedOperation(api, checkpoint, {
      kind: 'project-company-territory',
      id: mutation.id,
      data: mutation.data,
    });
  }

  const projectedCompanies = await api.listCompanies();
  const verifiedProjection = buildTerritoryProjectionPlan(
    projectedCompanies,
    options.expectedCompanyCount,
  );
  if (
    verifiedProjection.companyIdentityHash !== checkpoint.companyIdentityHash ||
    verifiedProjection.sourceProjectionHash !==
      checkpoint.sourceProjectionHash ||
    verifiedProjection.expectedProjectionHash !==
      checkpoint.expectedProjectionHash ||
    verifiedProjection.mutations.length > 0
  ) {
    throw new Error('Company territory projection did not converge');
  }

  const layoutMutations = await applyWorkspaceLayoutPlan({
    api,
    checkpoint,
    plan: configPlan.layout,
  });
  const finalPlan = buildWorkspaceConfigPlan(
    await api.listWorkspaceConfigSnapshot(),
  );
  if (workspaceConfigOperationCount(finalPlan) !== 0 || !finalPlan.layout) {
    throw new Error('Workspace navigation and views did not converge');
  }
  const finalProjection = buildTerritoryProjectionPlan(
    await api.listCompanies(),
    options.expectedCompanyCount,
  );
  if (
    finalProjection.mutations.length > 0 ||
    finalProjection.expectedProjectionHash !== checkpoint.expectedProjectionHash
  ) {
    throw new Error(
      'Workspace territory projection changed during layout update',
    );
  }

  checkpoint.status = 'complete';
  await api.writeCheckpoint(checkpoint);

  return {
    companyCount: finalProjection.companyCount,
    companyMutations,
    metadataMutations,
    layoutMutations,
    companyIdentityHash: finalProjection.companyIdentityHash,
    sourceProjectionHash: finalProjection.sourceProjectionHash,
    expectedProjectionHash: finalProjection.expectedProjectionHash,
  };
};

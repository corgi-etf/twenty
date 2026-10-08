import {
  buildWorkspaceConfigPlan,
  buildWorkspaceMetadataBootstrapPlan,
  type WorkspaceConfigSnapshot,
} from './planner.ts';
import { type WorkspaceConfigApi } from './execution.ts';
import {
  ownershipManifestDigest,
  stableJson,
} from './company-ownership-backfill.ts';
import { WORKSPACE_CONFIG_APPROVED_ORIGIN } from './twenty-api.ts';
type ExperienceMethod =
  | 'createMetadataField'
  | 'updateMetadataFieldLabel'
  | 'createView'
  | 'updateView'
  | 'createViewField'
  | 'updateViewField'
  | 'createViewFilter'
  | 'deleteViewFilter'
  | 'createViewSort'
  | 'deleteViewSort'
  | 'deleteNavigationItems'
  | 'createNavigationItems'
  | 'updateNavigationItems'
  | 'updateObjectOpenRecordIn';
export type ExperienceConfigOperation = {
  method: ExperienceMethod;
  args: unknown[];
};
export type ExperienceConfigManifest = {
  version: 1;
  origin: string;
  workspaceId: string;
  generatedAt: string;
  phase: 'metadata' | 'layout';
  snapshot: WorkspaceConfigSnapshot;
  operations: ExperienceConfigOperation[];
};
const sorted = <T extends { id: string }>(values: T[]): T[] =>
  [...values].sort((a, b) => a.id.localeCompare(b.id));
const normalizeSnapshot = (
  snapshot: WorkspaceConfigSnapshot,
): WorkspaceConfigSnapshot => ({
  objects: sorted(snapshot.objects).map((object) => ({
    ...object,
    fields: sorted(object.fields),
  })),
  views: sorted(snapshot.views).map((view) => ({
    ...view,
    viewFields: sorted(view.viewFields),
    viewFilters: sorted(view.viewFilters),
    viewSorts: sorted(view.viewSorts),
  })),
  navigationMenuItems: sorted(snapshot.navigationMenuItems),
});
const buildOperations = (snapshot: WorkspaceConfigSnapshot) => {
  const operations: ExperienceConfigOperation[] = [];
  const push = (method: ExperienceMethod, ...args: unknown[]) =>
    operations.push({ method, args });
  const allowedFields = new Set([
    'company.activeClient',
    'person.activeClient',
    'workspaceMember.accentPalette',
    'outreachActivity.activityType',
  ]);
  const fields = new Map(
    snapshot.objects.flatMap((object) =>
      object.fields.map((field) => [
        field.id,
        `${object.nameSingular}.${field.name}`,
      ]),
    ),
  );
  const objects = new Map(
    snapshot.objects.map((object) => [object.id, object.nameSingular]),
  );
  const bootstrap = buildWorkspaceMetadataBootstrapPlan(snapshot);
  const creates = bootstrap.metadataFieldsToCreate.filter((field) =>
    allowedFields.has(`${objects.get(field.objectMetadataId)}.${field.name}`),
  );
  for (const input of creates) push('createMetadataField', input);
  for (const input of bootstrap.metadataFieldsToUpdate.filter((field) =>
    allowedFields.has(fields.get(field.id)!),
  ))
    push('updateMetadataFieldLabel', input.id, input.label);
  // company and person are deliberately absent. The metadata API accepts an
  // openRecordIn update for them and reports success, but the value stays
  // USER_CHOICE: confirmed against production through both the REST patch and
  // the mutation the settings UI itself uses, and confirmed again by reading the
  // live snapshot back afterwards. Only the app-owned objects below actually
  // persist it. Planning the other two aborted the whole stage on its first
  // operation, so 152 applicable operations never ran. For company and person,
  // opening records full-page is governed by each member's own "open record in"
  // preference instead.
  for (const object of snapshot.objects.filter(({ nameSingular }) =>
    [
      'wholesaler',
      'outreachActivity',
      'meetingBooking',
      'companyAllocation',
    ].includes(nameSingular),
  )) {
    if (object.openRecordIn !== 'RECORD_PAGE')
      push('updateObjectOpenRecordIn', object.id);
  }
  if (creates.length) return { phase: 'metadata' as const, operations };
  const plan = buildWorkspaceConfigPlan(snapshot);
  if (!plan.layout)
    throw new Error(
      'Legacy metadata prerequisites are missing; experience configuration will not create unrelated fields',
    );
  const layout = plan.layout;
  // Preserve user company sorting. This rollout changes feature layout, not territory ordering.
  const companyIds = new Set(
    snapshot.objects
      .filter(({ nameSingular }) => nameSingular === 'company')
      .map(({ id }) => id),
  );
  const companyViews = snapshot.views.filter(({ objectMetadataId }) =>
    companyIds.has(objectMetadataId),
  );
  const companySorts = new Set(
    companyViews.flatMap(({ viewSorts }) => viewSorts.map(({ id }) => id)),
  );
  const companyViewIds = new Set(companyViews.map(({ id }) => id));
  for (const input of layout.viewsToCreate) push('createView', input);
  for (const { id, update } of layout.viewUpdates)
    push('updateView', id, update);
  for (const input of layout.viewFieldsToCreate) push('createViewField', input);
  for (const { id, update } of layout.viewFieldUpdates)
    push('updateViewField', id, update);
  for (const id of layout.viewFilterIdsToDelete) push('deleteViewFilter', id);
  for (const input of layout.viewFiltersToCreate)
    push('createViewFilter', input);
  for (const id of layout.viewSortIdsToDelete.filter(
    (id) => !companySorts.has(id),
  ))
    push('deleteViewSort', id);
  for (const input of layout.viewSortsToCreate.filter(
    ({ viewId }) => !companyViewIds.has(viewId),
  ))
    push('createViewSort', input);
  if (layout.navigationItemIdsToDelete.length)
    push('deleteNavigationItems', layout.navigationItemIdsToDelete);
  if (layout.navigationItemsToCreate.length)
    push('createNavigationItems', layout.navigationItemsToCreate);
  if (layout.navigationItemUpdates.length)
    push('updateNavigationItems', layout.navigationItemUpdates);
  return { phase: 'layout' as const, operations };
};
export const buildExperienceConfigManifest = (
  snapshot: WorkspaceConfigSnapshot,
  workspaceId: string,
): ExperienceConfigManifest => {
  const normalized = normalizeSnapshot(snapshot);
  return {
    version: 1,
    origin: WORKSPACE_CONFIG_APPROVED_ORIGIN,
    workspaceId,
    generatedAt: new Date().toISOString(),
    snapshot: normalized,
    ...buildOperations(normalized),
  };
};
export type ExperienceConfigJournalEntry = {
  digest: string;
  index: number;
  kind: 'intent' | 'confirmed';
  operation: ExperienceConfigOperation;
  at: string;
};
export const applyExperienceConfigManifest = async ({
  api,
  manifest,
  reviewedDigest,
  workspaceId,
  updateObjectOpenRecordIn,
  appendJournal,
}: {
  api: WorkspaceConfigApi;
  manifest: ExperienceConfigManifest;
  reviewedDigest: string;
  workspaceId: string;
  updateObjectOpenRecordIn(id: string): Promise<void>;
  appendJournal(entry: ExperienceConfigJournalEntry): Promise<void>;
}) => {
  const digest = ownershipManifestDigest(manifest);
  if (!reviewedDigest || reviewedDigest !== digest)
    throw new Error('Reviewed experience manifest digest does not match');
  if (
    manifest.version !== 1 ||
    manifest.workspaceId !== workspaceId ||
    manifest.origin !== WORKSPACE_CONFIG_APPROVED_ORIGIN
  )
    throw new Error('Experience manifest tenant mismatch');
  const rebuilt = buildOperations(manifest.snapshot);
  if (
    stableJson(rebuilt) !==
    stableJson({ phase: manifest.phase, operations: manifest.operations })
  )
    throw new Error('Experience manifest exceeds approved operation scope');
  if (
    stableJson(normalizeSnapshot(await api.listWorkspaceConfigSnapshot())) !==
    stableJson(manifest.snapshot)
  )
    throw new Error('Workspace configuration changed since reviewed preview');
  for (const [index, operation] of manifest.operations.entries()) {
    await appendJournal({
      digest,
      index,
      kind: 'intent',
      operation,
      at: new Date().toISOString(),
    });
    if (operation.method === 'updateObjectOpenRecordIn')
      await updateObjectOpenRecordIn(operation.args[0] as string);
    else {
      const method = api[operation.method] as (
        ...args: unknown[]
      ) => Promise<void>;
      await method.apply(api, operation.args);
    }
    await appendJournal({
      digest,
      index,
      kind: 'confirmed',
      operation,
      at: new Date().toISOString(),
    });
  }
  const remaining = buildOperations(
    normalizeSnapshot(await api.listWorkspaceConfigSnapshot()),
  );
  return {
    applied: manifest.operations.length,
    nextPhase: remaining.phase,
    remainingOperations: remaining.operations.length,
    requiresNewReviewedPreview: remaining.operations.length > 0,
  };
};

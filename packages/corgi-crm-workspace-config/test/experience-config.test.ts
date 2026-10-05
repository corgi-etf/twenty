import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workspaceConfigFixture } from './workspace-config-fixture.ts';
import {
  buildExperienceConfigManifest,
  applyExperienceConfigManifest,
} from '../src/experience-config.ts';
import { ownershipManifestDigest } from '../src/company-ownership-backfill.ts';
import type { WorkspaceConfigApi } from '../src/execution.ts';
test('experience preview excludes territory mutations and allows only explicit feature metadata', () => {
  const snapshot = workspaceConfigFixture();
  snapshot.objects.find(
    ({ nameSingular }) => nameSingular === 'company',
  )!.fields = snapshot.objects
    .find(({ nameSingular }) => nameSingular === 'company')!
    .fields.filter(({ name }) => name !== 'activeClient');
  const manifest = buildExperienceConfigManifest(snapshot, 'workspace');
  assert.equal(manifest.phase, 'metadata');
  assert.ok(
    manifest.operations.some((op) => op.method === 'createMetadataField'),
  );
  assert.ok(
    manifest.operations.every((op) =>
      [
        'createMetadataField',
        'updateMetadataFieldLabel',
        'updateObjectOpenRecordIn',
      ].includes(op.method),
    ),
  );
  const input = manifest.operations.find(
    (op) => op.method === 'createMetadataField',
  )!.args[0] as { name: string };
  assert.equal(input.name, 'activeClient');
});
test('layout keeps personal views and company sorts while moving activity type first', () => {
  const snapshot = workspaceConfigFixture();
  const manifest = buildExperienceConfigManifest(snapshot, 'workspace');
  assert.equal(manifest.phase, 'layout');
  assert.ok(
    manifest.operations.some((op) => op.method === 'updateObjectOpenRecordIn'),
  );
  assert.ok(
    !manifest.operations.some((op) =>
      ['conditionalPatchCompany', 'conditionalPatchWholesaler'].includes(
        op.method,
      ),
    ),
  );
  const companyView = snapshot.views.find(
    ({ objectMetadataId }) => objectMetadataId === 'company-object-id',
  )!;
  assert.ok(
    !manifest.operations.some(
      (op) =>
        op.method === 'deleteViewSort' &&
        companyView.viewSorts.some(({ id }) => op.args[0] === id),
    ),
  );
});
test('requires exact reviewed snapshot and digest before mutations', async () => {
  const snapshot = workspaceConfigFixture();
  const manifest = buildExperienceConfigManifest(snapshot, 'workspace');
  let writes = 0;
  const api = {
    listWorkspaceConfigSnapshot: async () => ({
      ...snapshot,
      navigationMenuItems: [],
    }),
    createMetadataField: async () => {
      writes++;
    },
  } as unknown as WorkspaceConfigApi;
  await assert.rejects(
    applyExperienceConfigManifest({
      api,
      manifest,
      reviewedDigest: ownershipManifestDigest(manifest),
      workspaceId: 'workspace',
      updateObjectOpenRecordIn: async () => {
        writes++;
      },
      appendJournal: async () => {},
    }),
    /changed/,
  );
  await assert.rejects(
    applyExperienceConfigManifest({
      api,
      manifest,
      reviewedDigest: 'wrong',
      workspaceId: 'workspace',
      updateObjectOpenRecordIn: async () => {
        writes++;
      },
      appendJournal: async () => {},
    }),
    /digest/,
  );
  assert.equal(writes, 0);
});

test('applies only reviewed layout operations and converges without touching company data', async () => {
  const snapshot = workspaceConfigFixture();
  const untouchedSorts = structuredClone(snapshot.views[0]!.viewSorts);
  let sequence = 0;
  const id = () => `generated-${++sequence}`;
  const journal: string[] = [];
  const api = {
    listWorkspaceConfigSnapshot: async () => structuredClone(snapshot),
    createMetadataField: async (input: {
      objectMetadataId: string;
      name: string;
      label: string;
      type: string;
    }) =>
      snapshot.objects
        .find((object) => object.id === input.objectMetadataId)!
        .fields.push({ ...input, id: id() }),
    updateMetadataFieldLabel: async (fieldId: string, label: string) => {
      snapshot.objects
        .flatMap((object) => object.fields)
        .find((field) => field.id === fieldId)!.label = label;
    },
    createView: async (input: Record<string, unknown>) => {
      snapshot.views.push({
        ...input,
        viewFields: [],
        viewFilters: [],
        viewSorts: [],
      } as never);
    },
    updateView: async (viewId: string, input: Record<string, unknown>) => {
      Object.assign(snapshot.views.find((view) => view.id === viewId)!, input);
    },
    createViewField: async (input: { viewId: string }) =>
      snapshot.views
        .find((view) => view.id === input.viewId)!
        .viewFields.push({ id: id(), ...input } as never),
    updateViewField: async (
      fieldId: string,
      input: Record<string, unknown>,
    ) => {
      Object.assign(
        snapshot.views
          .flatMap((view) => view.viewFields)
          .find((field) => field.id === fieldId)!,
        input,
      );
    },
    createViewFilter: async (input: { viewId: string }) =>
      snapshot.views
        .find((view) => view.id === input.viewId)!
        .viewFilters.push({ id: id(), ...input } as never),
    deleteViewFilter: async (filterId: string) => {
      for (const view of snapshot.views)
        view.viewFilters = view.viewFilters.filter(
          (filter) => filter.id !== filterId,
        );
    },
    createViewSort: async (input: { viewId: string }) =>
      snapshot.views
        .find((view) => view.id === input.viewId)!
        .viewSorts.push({ id: id(), ...input } as never),
    deleteViewSort: async (sortId: string) => {
      for (const view of snapshot.views)
        view.viewSorts = view.viewSorts.filter((sort) => sort.id !== sortId);
    },
    createNavigationItems: async (inputs: Record<string, unknown>[]) => {
      snapshot.navigationMenuItems.push(
        ...(inputs.map((input) => ({
          id: id(),
          ...input,
        })) as typeof snapshot.navigationMenuItems),
      );
    },
    deleteNavigationItems: async (ids: string[]) => {
      snapshot.navigationMenuItems = snapshot.navigationMenuItems.filter(
        (item) => !ids.includes(item.id),
      );
    },
    updateNavigationItems: async (
      inputs: Array<{ id: string; update: Record<string, unknown> }>,
    ) => {
      for (const input of inputs)
        Object.assign(
          snapshot.navigationMenuItems.find((item) => item.id === input.id)!,
          input.update,
        );
    },
    conditionalPatchCompany: async () => {
      throw new Error('Forbidden company mutation');
    },
    conditionalPatchWholesaler: async () => {
      throw new Error('Forbidden wholesaler mutation');
    },
  } as unknown as WorkspaceConfigApi;
  const manifest = buildExperienceConfigManifest(snapshot, 'workspace');
  const result = await applyExperienceConfigManifest({
    api,
    manifest,
    reviewedDigest: ownershipManifestDigest(manifest),
    workspaceId: 'workspace',
    updateObjectOpenRecordIn: async (objectId) => {
      snapshot.objects.find((object) => object.id === objectId)!.openRecordIn =
        'RECORD_PAGE';
    },
    appendJournal: async (entry) => {
      journal.push(entry.kind);
    },
  });
  assert.equal(result.remainingOperations, 0);
  assert.equal(result.requiresNewReviewedPreview, false);
  assert.equal(journal.length, manifest.operations.length * 2);
  assert.deepEqual(snapshot.views[0]!.viewSorts, untouchedSorts);
});

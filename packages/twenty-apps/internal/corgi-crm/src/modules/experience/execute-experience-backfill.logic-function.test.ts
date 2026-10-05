import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import definition, {
  executeExperienceBackfill,
} from './execute-experience-backfill.logic-function';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const source = {
  id: '22222222-2222-4222-8222-222222222222',
  name: ' Untitled ',
  managedName: null,
  activityType: 'PHONE_CALL',
  companyId: 'company',
  companyName: 'Example',
  contactCompanyId: null,
  contactCompanyName: null,
  occurredAt: '2026-10-05T12:00:00Z',
  createdAt: '2026-10-05T12:00:00Z',
  updatedAt: '2026-10-05T12:00:00Z',
};
const fixture = () => {
  const body = {
    version: 1,
    workspaceId,
    previewedAt: '2026-10-05T14:00:00Z',
    operations: [
      {
        object: 'outreachActivity' as const,
        id: source.id,
        expectedUpdatedAt: source.updatedAt,
        before: { name: source.name },
        after: { name: 'Phone call - Example - 2026-10-05' },
      },
    ],
    unresolved: [],
  };
  const digest = createHash('sha256')
    .update(JSON.stringify(body))
    .digest('hex');
  const manifest = { ...body, digest };
  const dependencies = {
    workspaceId,
    approvedDigest: digest,
    activities: {
      get: vi.fn().mockResolvedValue(source),
      update: vi.fn().mockResolvedValue(true),
    },
    lifecycle: { get: vi.fn(), update: vi.fn() },
  };
  return { manifest, dependencies, context: { workspaceId } };
};
describe('approved owning-application backfill', () => {
  it('has no public, automatic, workflow or tool trigger', () => {
    for (const field of [
      'httpRouteTriggerSettings',
      'databaseEventTriggerSettings',
      'cronTriggerSettings',
      'toolTriggerSettings',
      'workflowActionTriggerSettings',
    ])
      expect(definition.config).not.toHaveProperty(field);
  });
  it('requires the exact approved digest and workspace before reading any source', async () => {
    const input = fixture();
    for (const dependencies of [
      { ...input.dependencies, approvedDigest: '' },
      { ...input.dependencies, workspaceId: 'other' },
    ]) {
      await expect(
        executeExperienceBackfill(
          { manifest: input.manifest, index: 0 },
          input.context,
          dependencies,
        ),
      ).rejects.toThrow('not approved');
      expect(dependencies.activities.get).not.toHaveBeenCalled();
    }
    input.manifest.operations[0]!.after.name = 'Forged';
    await expect(
      executeExperienceBackfill(
        { manifest: input.manifest, index: 0 },
        input.context,
        input.dependencies,
      ),
    ).rejects.toThrow('digest');
  });
  it('writes only a still-blank expected title and returns rollback evidence', async () => {
    const input = fixture();
    expect(
      await executeExperienceBackfill(
        { manifest: input.manifest, index: 0 },
        input.context,
        input.dependencies,
      ),
    ).toMatchObject({
      status: 'updated',
      journal: {
        before: { name: ' Untitled ', managedName: null },
        after: {
          name: 'Phone call - Example - 2026-10-05',
          managedName: 'Phone call - Example - 2026-10-05',
        },
      },
    });
    expect(input.dependencies.activities.update).toHaveBeenCalledWith({
      id: source.id,
      expectedUpdatedAt: source.updatedAt,
      name: 'Phone call - Example - 2026-10-05',
      managedName: 'Phone call - Example - 2026-10-05',
    });
  });
  it('refuses to replace a custom or concurrently edited title', async () => {
    const input = fixture();
    input.dependencies.activities.get.mockResolvedValue({
      ...source,
      name: 'My note',
    });
    expect(
      await executeExperienceBackfill(
        { manifest: input.manifest, index: 0 },
        input.context,
        input.dependencies,
      ),
    ).toMatchObject({ status: 'conflict' });
    expect(input.dependencies.activities.update).not.toHaveBeenCalled();
  });
});

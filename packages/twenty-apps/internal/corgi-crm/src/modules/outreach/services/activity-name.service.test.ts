import { describe, expect, it, vi } from 'vitest';
import {
  formatActivityName,
  reconcileActivityName,
  type ActivityNameSource,
} from './activity-name.service';
const source: ActivityNameSource = {
  id: 'a',
  name: ' Untitled ',
  managedName: null,
  activityType: 'PHONE_CALL',
  companyId: 'c',
  companyName: 'Example',
  contactCompanyId: null,
  contactCompanyName: null,
  occurredAt: '2026-10-05T01:00:00Z',
  createdAt: '2026-10-05T12:00:00Z',
  updatedAt: '2026-10-05T12:00:00Z',
};
describe('activity names', () => {
  it('uses the activity date in Chicago across midnight and daylight saving boundaries', () => {
    expect(formatActivityName(source)).toBe(
      'Phone call - Example - 2026-10-04',
    );
    expect(
      formatActivityName({ ...source, occurredAt: '2026-11-01T05:30:00Z' }),
    ).toBe('Phone call - Example - 2026-11-01');
    expect(formatActivityName({ ...source, occurredAt: null })).toBe(
      'Phone call - Example - 2026-10-05',
    );
  });
  it('normalizes imported and canonical activity labels identically', () => {
    for (const activityType of ['call', 'phone_call', 'PHONE_CALL'])
      expect(formatActivityName({ ...source, activityType })).toBe(
        'Phone call - Example - 2026-10-04',
      );
  });
  it('keeps missing facts honest and preserves custom titles', async () => {
    expect(formatActivityName({})).toBe(
      'Activity - Company not linked - Date unknown',
    );
    const repo = {
      get: vi.fn().mockResolvedValue({ ...source, name: 'My custom call' }),
      update: vi.fn(),
    };
    expect(await reconcileActivityName('a', repo)).toEqual({
      status: 'custom',
    });
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('derives an unlinked company from the contact and fences the update', async () => {
    const repo = {
      get: vi.fn().mockResolvedValue({
        ...source,
        companyId: null,
        companyName: null,
        contactCompanyId: 'contact-company',
        contactCompanyName: 'Contact company',
      }),
      update: vi.fn().mockResolvedValue(true),
    };
    await reconcileActivityName('a', repo);
    expect(repo.update).toHaveBeenCalledWith({
      id: 'a',
      expectedUpdatedAt: source.updatedAt,
      name: 'Phone call - Contact company - 2026-10-04',
      managedName: 'Phone call - Contact company - 2026-10-04',
      companyId: 'contact-company',
    });
  });
  it('updates only managed titles, then makes replays no-ops', async () => {
    const repo = {
      get: vi.fn().mockResolvedValue({
        ...source,
        name: 'Old automatic name',
        managedName: 'Old automatic name',
      }),
      update: vi.fn().mockResolvedValue(true),
    };
    await reconcileActivityName('a', repo);
    repo.get.mockResolvedValue({
      ...source,
      name: formatActivityName(source),
      managedName: formatActivityName(source),
    });
    expect(await reconcileActivityName('a', repo)).toEqual({
      status: 'unchanged',
    });
    expect(repo.update).toHaveBeenCalledTimes(1);
  });
  it('does not accept a lost compare-and-set as a successful rename', async () => {
    await expect(
      reconcileActivityName('a', {
        get: async () => source,
        update: async () => false,
      }),
    ).rejects.toThrow('changed while naming');
  });
});

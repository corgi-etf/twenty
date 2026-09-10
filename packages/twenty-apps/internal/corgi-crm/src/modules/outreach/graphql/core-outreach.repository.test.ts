import { describe, expect, it, vi } from 'vitest';

import { CoreOutreachRepository } from 'src/modules/outreach/graphql/core-outreach.repository';
import type { OutreachActivityWrite } from 'src/modules/outreach/types';

describe('CoreOutreachRepository.findContacts', () => {
  it('paginates beyond 100 contacts before matching the 101st record', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        people: {
          edges: Array.from({ length: 100 }, (_, index) => ({
            node: {
              id: `person-${index}`,
              name: { firstName: 'Other', lastName: String(index) },
            },
          })),
          pageInfo: { hasNextPage: true, endCursor: 'cursor-100' },
        },
      })
      .mockResolvedValueOnce({
        people: {
          edges: [
            {
              node: {
                id: 'person-101',
                name: { firstName: 'Jane', lastName: 'Target' },
              },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
    const repository = new CoreOutreachRepository({ query } as never);

    await expect(
      repository.findContacts('company-1', 'Jane Target'),
    ).resolves.toEqual([{ id: 'person-101', name: 'Jane Target' }]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]![0].people.__args.after).toBe('cursor-100');
  });
});

describe('CoreOutreachRepository.createActivity', () => {
  const write: OutreachActivityWrite = {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Phone call — Acme',
    companyId: 'company-1',
    wholesalerId: 'wholesaler-1',
    activityType: 'phone_call' as const,
    outcome: 'connected' as const,
    occurredAt: '2026-09-10T04:59:00.000Z',
  };
  const persistedWrite = {
    ...write,
    contactId: null,
    notes: null,
    followUpDate: null,
  };

  it('accepts a production-style mutation collision only after reading the exact committed row', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          outreachActivities: { edges: [], pageInfo: { hasNextPage: false } },
        })
        .mockResolvedValueOnce({
          outreachActivities: {
            edges: [{ node: persistedWrite }],
            pageInfo: { hasNextPage: false },
          },
        }),
      mutation: vi
        .fn()
        .mockRejectedValue(
          new Error('duplicate key value violates unique constraint'),
        ),
    };
    const repository = new CoreOutreachRepository(client as never);
    await expect(repository.createActivity(write)).resolves.toEqual({
      id: write.id,
    });
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.mutation).toHaveBeenCalledOnce();
  });

  it('does not accept a deterministic ID collision with different source data', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ outreachActivities: { edges: [] } })
        .mockResolvedValueOnce({
          outreachActivities: {
            edges: [
              {
                node: {
                  ...persistedWrite,
                  occurredAt: '2026-09-10T05:01:00.000Z',
                },
              },
            ],
          },
        }),
      mutation: vi.fn().mockRejectedValue(new Error('duplicate key')),
    };
    await expect(
      new CoreOutreachRepository(client as never).createActivity(write),
    ).rejects.toThrow(/conflicts at occurredAt/i);
  });
});

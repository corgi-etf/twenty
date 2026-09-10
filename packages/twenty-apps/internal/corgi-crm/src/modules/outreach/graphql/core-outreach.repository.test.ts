import { describe, expect, it, vi } from 'vitest';

import { CoreOutreachRepository } from 'src/modules/outreach/graphql/core-outreach.repository';
import type { OutreachActivityWrite } from 'src/modules/outreach/types';

describe('CoreOutreachRepository.listActivities', () => {
  const window = {
    start: '2026-09-08T16:30:00.000Z',
    end: '2026-09-09T16:30:00.000Z',
  };
  const activity = {
    id: 'activity-1',
    activityType: 'phone_call',
    outcome: 'connected',
    occurredAt: window.start,
    wholesalerId: 'owner-1',
    wholesaler: { id: 'owner-1', name: 'Jordan' },
    company: { name: 'Acme' },
  };

  it('paginates all owners and includes records without company or owner relations', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        outreachActivities: {
          edges: Array.from({ length: 100 }, (_, index) => ({
            node: { ...activity, id: `activity-${index}` },
          })),
          pageInfo: { hasNextPage: true, endCursor: 'page-1' },
        },
      })
      .mockResolvedValueOnce({
        outreachActivities: {
          edges: [
            { node: activity },
            { node: { ...activity, id: 'missing-company', company: null } },
            {
              node: {
                ...activity,
                id: 'missing-owner-relation',
                wholesalerId: 'owner-2',
                wholesaler: null,
              },
            },
            {
              node: {
                ...activity,
                id: 'unassigned',
                wholesalerId: null,
                wholesaler: null,
              },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await new CoreOutreachRepository({
      query,
    } as never).listActivities(window);

    expect(result).toHaveLength(103);
    expect(result.find(({ id }) => id === 'missing-company')).toMatchObject({
      wholesalerId: 'owner-1',
      companyName: 'Unknown company',
    });
    expect(
      result.find(({ id }) => id === 'missing-owner-relation'),
    ).toMatchObject({
      wholesalerId: 'owner-2',
      wholesalerName: 'Unassigned (owner-2)',
    });
    expect(result.find(({ id }) => id === 'unassigned')).toMatchObject({
      wholesalerId: 'unassigned',
      wholesalerName: 'Unassigned',
    });
    expect(query.mock.calls[0]![0].outreachActivities.__args.filter).toEqual({
      and: [
        { occurredAt: { gte: window.start } },
        { occurredAt: { lt: window.end } },
      ],
    });
    expect(
      query.mock.calls[0]![0].outreachActivities.edges.node.wholesalerId,
    ).toBe(true);
    expect(query.mock.calls[1]![0].outreachActivities.__args.after).toBe(
      'page-1',
    );
  });

  it('includes the start but excludes invalid timestamps, older, end-boundary and future activities', async () => {
    const query = vi.fn().mockResolvedValue({
      outreachActivities: {
        edges: [
          activity,
          { ...activity, id: 'older', occurredAt: '2026-09-08T16:29:59.999Z' },
          { ...activity, id: 'end-boundary', occurredAt: window.end },
          { ...activity, id: 'future', occurredAt: '2026-09-09T16:30:00.001Z' },
          { ...activity, id: 'invalid', occurredAt: 'invalid' },
        ].map((node) => ({ node })),
        pageInfo: { hasNextPage: false },
      },
    });
    const result = await new CoreOutreachRepository({
      query,
    } as never).listActivities(window);
    expect(result.map(({ id }) => id)).toEqual(['activity-1']);
  });

  it('fails instead of returning an incomplete report when pagination cycles', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        outreachActivities: {
          edges: [],
          pageInfo: { hasNextPage: true, endCursor: 'a' },
        },
      })
      .mockResolvedValueOnce({
        outreachActivities: {
          edges: [],
          pageInfo: { hasNextPage: true, endCursor: 'b' },
        },
      })
      .mockResolvedValueOnce({
        outreachActivities: {
          edges: [],
          pageInfo: { hasNextPage: true, endCursor: 'a' },
        },
      });

    await expect(
      new CoreOutreachRepository({ query } as never).listActivities(window),
    ).rejects.toThrow(/pagination.*cursor/i);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['missing connection', {}],
    ['null connection', { outreachActivities: null }],
    [
      'missing edges',
      { outreachActivities: { pageInfo: { hasNextPage: false } } },
    ],
    [
      'non-array edges',
      {
        outreachActivities: {
          edges: {},
          pageInfo: { hasNextPage: false },
        },
      },
    ],
    [
      'missing page info',
      { outreachActivities: { edges: [] } },
    ],
    [
      'non-boolean hasNextPage',
      {
        outreachActivities: {
          edges: [],
          pageInfo: { hasNextPage: 'false' },
        },
      },
    ],
    [
      'blank next cursor',
      {
        outreachActivities: {
          edges: [],
          pageInfo: { hasNextPage: true, endCursor: ' ' },
        },
      },
    ],
    [
      'non-string next cursor',
      {
        outreachActivities: {
          edges: [],
          pageInfo: { hasNextPage: true, endCursor: 1 },
        },
      },
    ],
  ])('fails closed for a %s response', async (_label, response) => {
    const query = vi.fn().mockResolvedValue(response);
    await expect(
      new CoreOutreachRepository({
        query,
      } as never).listActivities(window),
    ).rejects.toThrow(/outreach activit.*connection|pagination/i);
    expect(query).toHaveBeenCalledOnce();
  });
});

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

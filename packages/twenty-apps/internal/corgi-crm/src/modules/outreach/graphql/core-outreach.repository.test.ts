import { describe, expect, it, vi } from 'vitest';

import { CoreOutreachRepository } from 'src/modules/outreach/graphql/core-outreach.repository';

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

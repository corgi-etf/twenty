import { describe, expect, it, vi } from 'vitest';

import { CoreWholesalerRepository } from 'src/modules/wholesaler/onboarding/graphql/core-wholesaler.repository';

const record = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Nash',
  email: 'nash@example.test',
  wholesalerRole: 'Wholesaler',
  workspaceMemberId: '22222222-2222-4222-8222-222222222222',
};

const buildRepository = ({
  generatedResult = {},
  rawResult = {},
}: {
  generatedResult?: Record<string, unknown>;
  rawResult?: Record<string, unknown>;
} = {}) => {
  const generated = { query: vi.fn(async () => generatedResult) };
  const raw = { request: vi.fn(async () => rawResult) };
  return {
    generated,
    raw,
    repository: new CoreWholesalerRepository(generated as never, raw as never),
  };
};

describe('CoreWholesalerRepository external object access', () => {
  it('queries the Wholesaler root by member through raw GraphQL', async () => {
    const { generated, raw, repository } = buildRepository({
      rawResult: { wholesalers: { edges: [{ node: record }] } },
    });

    await expect(
      repository.findByWorkspaceMemberId(record.workspaceMemberId),
    ).resolves.toEqual([record]);
    expect(generated.query).not.toHaveBeenCalled();
    expect(raw.request).toHaveBeenCalledWith({
      operationName: 'CorgiFindWholesalersByWorkspaceMember',
      document: expect.stringMatching(
        /query CorgiFindWholesalersByWorkspaceMember\(\$memberId: UUID!\)/,
      ),
      variables: { memberId: record.workspaceMemberId },
    });
  });

  it('escapes and verifies the exact email returned by raw GraphQL', async () => {
    const { raw, repository } = buildRepository({
      rawResult: {
        wholesalers: {
          edges: [
            { node: record },
            { node: { ...record, id: 'other', email: 'other@example.test' } },
          ],
        },
      },
    });

    await expect(repository.findByEmail('nash_%@example.test')).resolves.toEqual([]);
    expect(raw.request).toHaveBeenCalledWith({
      operationName: 'CorgiFindWholesalersByEmail',
      document: expect.stringMatching(
        /query CorgiFindWholesalersByEmail\(\$emailPattern: String!\)/,
      ),
      variables: { emailPattern: 'nash\\_\\%@example.test' },
    });
  });

  it('uses raw GraphQL for deterministic Wholesaler create and update', async () => {
    const generated = { query: vi.fn() };
    const raw = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ createWholesaler: { id: record.id } })
        .mockResolvedValueOnce({ updateWholesaler: { id: record.id } }),
    };
    const repository = new CoreWholesalerRepository(generated as never, raw as never);
    const write = {
      name: record.name,
      email: record.email,
      wholesalerRole: record.wholesalerRole,
      workspaceMemberId: record.workspaceMemberId,
    };

    await expect(repository.create(record.id, write)).resolves.toEqual(record);
    await expect(repository.update(record.id, { name: 'New name' })).resolves.toEqual({
      id: record.id,
      name: 'New name',
    });
    expect(raw.request.mock.calls).toEqual([
      [
        {
          operationName: 'CorgiCreateWholesaler',
          document: expect.stringMatching(
            /mutation CorgiCreateWholesaler\(\$data: WholesalerCreateInput!\)/,
          ),
          variables: { data: { id: record.id, ...write } },
        },
      ],
      [
        {
          operationName: 'CorgiUpdateWholesaler',
          document: expect.stringMatching(
            /mutation CorgiUpdateWholesaler\(\$id: UUID!, \$data: WholesalerUpdateInput!\)/,
          ),
          variables: { id: record.id, data: { name: 'New name' } },
        },
      ],
    ]);
    expect(generated.query).not.toHaveBeenCalled();
  });

  it.each([
    [{ wholesalers: null }, 'Wholesaler query returned a malformed connection'],
    [
      { wholesalers: { edges: [{ node: { ...record, id: null } }] } },
      'Wholesaler query returned a malformed record',
    ],
  ])('fails closed on malformed external query data', async (rawResult, message) => {
    const { repository } = buildRepository({ rawResult });
    await expect(
      repository.findByWorkspaceMemberId(record.workspaceMemberId),
    ).rejects.toThrow(message);
  });

  it.each([
    ['create', { createWholesaler: null }],
    ['create', { createWholesaler: { id: 'wrong-id' } }],
    ['update', { updateWholesaler: null }],
    ['update', { updateWholesaler: { id: 'wrong-id' } }],
  ] as const)('rejects an unconfirmed %s response', async (operation, rawResult) => {
    const { repository } = buildRepository({ rawResult });
    const write = {
      name: record.name,
      email: record.email,
      wholesalerRole: record.wholesalerRole,
      workspaceMemberId: record.workspaceMemberId,
    };
    const action =
      operation === 'create'
        ? repository.create(record.id, write)
        : repository.update(record.id, { name: 'Updated' });
    await expect(action).rejects.toThrow(/did not return the requested id/);
  });

  it('retains the generated client for standard WorkspaceMember queries', async () => {
    const member = {
      id: record.workspaceMemberId,
      userEmail: record.email,
      userWorkspaceId: 'active-membership',
      name: { firstName: 'Nash', lastName: 'Example' },
    };
    const { generated, raw, repository } = buildRepository({
      generatedResult: {
        workspaceMembers: {
          edges: [{ node: member }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    await expect(repository.findWorkspaceMemberById(member.id)).resolves.toEqual({
      id: member.id,
      active: true,
    });
    await expect(repository.listWorkspaceMembers()).resolves.toEqual({
      members: [
        {
          id: member.id,
          email: member.userEmail,
          firstName: 'Nash',
          lastName: 'Example',
        },
      ],
      nextCursor: undefined,
    });
    expect(generated.query).toHaveBeenCalledTimes(2);
    expect(raw.request).not.toHaveBeenCalled();
  });
});

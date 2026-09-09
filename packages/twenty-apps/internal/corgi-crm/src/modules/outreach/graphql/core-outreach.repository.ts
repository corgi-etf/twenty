import { type CoreApiClient } from 'twenty-client-sdk/core';

import {
  type NamedRecord,
  type OutreachActivity,
  type OutreachActivityWrite,
  type OutreachRepository,
} from 'src/modules/outreach/types';
import { escapeSqlLikePattern } from 'src/modules/wholesaler/onboarding/utils/escape-sql-like-pattern';

const PAGE_SIZE = 100;
const MAX_PAGES = 100;

type ActivityNode = {
  id?: string | null;
  activityType?: string | null;
  outcome?: string | null;
  notes?: string | null;
  occurredAt?: string | null;
  company?: { name?: string | null } | null;
  contact?: { name?: { firstName?: string | null; lastName?: string | null } | null } | null;
  wholesaler?: { id?: string | null; name?: string | null } | null;
};

const fullName = (name: { firstName?: string | null; lastName?: string | null } | null | undefined) =>
  [name?.firstName, name?.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

export class CoreOutreachRepository implements OutreachRepository {
  public constructor(private readonly client: CoreApiClient) {}

  public async findCompanies(query: string): Promise<NamedRecord[]> {
    const result = await this.client.query({
      companies: {
        __args: {
          filter: {
            name: { ilike: `%${escapeSqlLikePattern(query.trim())}%` },
          },
          first: 10,
        },
        edges: { node: { id: true, name: true } },
      },
    });
    const edges = (result.companies?.edges ?? []) as Array<{
      node?: { id?: string | null; name?: string | null } | null;
    }>;
    return edges
      .map((edge) => edge?.node)
      .filter(
        (node): node is { id: string; name: string } =>
          Boolean(node?.id && node.name?.trim()),
      )
      .map(({ id, name }) => ({ id, name: name.trim() }));
  }

  public async findContacts(
    companyId: string,
    query: string,
  ): Promise<NamedRecord[]> {
    const normalizedQuery = query.trim().toLowerCase();
    const matches: NamedRecord[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await this.client.query({
        people: {
          __args: {
            filter: { companyId: { eq: companyId } },
            first: PAGE_SIZE,
            after: cursor,
          },
          edges: { node: { id: true, name: { firstName: true, lastName: true } } },
          pageInfo: { hasNextPage: true, endCursor: true },
        },
      });
      const edges = (result.people?.edges ?? []) as Array<{
      node?: {
        id?: string | null;
        name?: {
          firstName?: string | null;
          lastName?: string | null;
        } | null;
      } | null;
      }>;
      matches.push(
        ...edges
          .map((edge) => edge?.node)
          .map((node) => ({ id: node?.id ?? '', name: fullName(node?.name) }))
          .filter(({ id, name }) => id && name.toLowerCase().includes(normalizedQuery)),
      );
      const pageInfo = result.people?.pageInfo;
      if (!pageInfo?.hasNextPage) return matches;
      if (!pageInfo.endCursor || pageInfo.endCursor === cursor) {
        throw new Error('Contact pagination omitted its cursor');
      }
      cursor = pageInfo.endCursor;
    }
    throw new Error(`Contact pagination exceeded ${MAX_PAGES} pages`);
  }

  public async createActivity(data: OutreachActivityWrite): Promise<{ id: string }> {
    const existing = await this.findActivityWrite(data.id);
    if (existing) return this.assertSameActivity(existing, data);
    try {
      const result = await this.client.mutation({
        createOutreachActivity: {
          __args: { data },
          id: true,
        },
      });
      const id = result.createOutreachActivity?.id;
      if (!id) throw new Error('createOutreachActivity did not return an id');
      return { id };
    } catch (error) {
      // A concurrent retry may have won the deterministic primary key. Accept
      // only an exact record; never turn an unrelated collision into success.
      const concurrent = await this.findActivityWrite(data.id);
      if (concurrent) return this.assertSameActivity(concurrent, data);
      throw error;
    }
  }

  private async findActivityWrite(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.query({
      outreachActivities: {
        __args: { filter: { id: { eq: id } }, first: 2 },
        edges: {
          node: {
            id: true,
            name: true,
            companyId: true,
            contactId: true,
            wholesalerId: true,
            activityType: true,
            outcome: true,
            notes: true,
            occurredAt: true,
            followUpDate: true,
          },
        },
      },
    });
    const nodes = (result.outreachActivities?.edges ?? [])
      .map((edge: { node?: Record<string, unknown> | null }) => edge?.node)
      .filter((node): node is Record<string, unknown> => Boolean(node));
    if (nodes.length > 1) throw new Error(`Duplicate outreach activity ID ${id}`);
    return nodes[0] ?? null;
  }

  private assertSameActivity(
    existing: Record<string, unknown>,
    expected: OutreachActivityWrite,
  ): { id: string } {
    const comparable = (value: unknown) => value ?? null;
    for (const [key, value] of Object.entries(expected)) {
      if (comparable(existing[key]) !== comparable(value)) {
        throw new Error(`Deterministic outreach activity ${expected.id} conflicts at ${key}`);
      }
    }
    return { id: expected.id };
  }

  public async listActivities({
    start,
    end,
    wholesalerId,
  }: {
    start: string;
    end: string;
    wholesalerId?: string;
  }): Promise<OutreachActivity[]> {
    const output: OutreachActivity[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const filters: Array<Record<string, unknown>> = [
        { occurredAt: { gte: start } },
        { occurredAt: { lt: end } },
      ];
      if (wholesalerId) filters.push({ wholesalerId: { eq: wholesalerId } });
      const result = await this.client.query({
        outreachActivities: {
          __args: {
            filter: { and: filters },
            first: PAGE_SIZE,
            after: cursor,
          },
          edges: {
            node: {
              id: true,
              activityType: true,
              outcome: true,
              notes: true,
              occurredAt: true,
              company: { name: true },
              contact: { name: { firstName: true, lastName: true } },
              wholesaler: { id: true, name: true },
            },
          },
          pageInfo: { hasNextPage: true, endCursor: true },
        },
      });
      const connection = result.outreachActivities;
      for (const edge of connection?.edges ?? []) {
        const node = edge?.node as ActivityNode | null | undefined;
        if (
          !node?.id ||
          !node.occurredAt ||
          !node.wholesaler?.id ||
          !node.company?.name
        ) {
          continue;
        }
        output.push({
          id: node.id,
          wholesalerId: node.wholesaler.id,
          wholesalerName: node.wholesaler.name?.trim() || 'Team member',
          companyName: node.company.name,
          ...(fullName(node.contact?.name)
            ? { contactName: fullName(node.contact?.name) }
            : {}),
          activityType: node.activityType?.trim() || 'Unspecified',
          outcome: node.outcome?.trim() || 'Unspecified',
          ...(node.notes?.trim() ? { notes: node.notes.trim() } : {}),
          occurredAt: node.occurredAt,
        });
      }
      if (!connection?.pageInfo?.hasNextPage) return output;
      const nextCursor = connection.pageInfo.endCursor;
      if (!nextCursor || nextCursor === cursor) {
        throw new Error('Outreach activity pagination omitted its cursor');
      }
      cursor = nextCursor;
    }
    throw new Error(`Outreach activity pagination exceeded ${MAX_PAGES} pages`);
  }
}

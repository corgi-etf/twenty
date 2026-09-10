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
  wholesalerId?: string | null;
  company?: { name?: string | null } | null;
  contact?: { name?: { firstName?: string | null; lastName?: string | null } | null } | null;
  wholesaler?: { id?: string | null; name?: string | null } | null;
};

type ActivityConnection = {
  edges: Array<{ node?: ActivityNode | null } | null>;
  pageInfo:
    | { hasNextPage: false; endCursor?: unknown }
    | { hasNextPage: true; endCursor: string };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const parseActivityConnection = (value: unknown): ActivityConnection => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.edges) ||
    !isRecord(value.pageInfo) ||
    typeof value.pageInfo.hasNextPage !== 'boolean'
  ) {
    throw new Error('Outreach activity connection response was malformed');
  }
  if (value.pageInfo.hasNextPage) {
    const endCursor = value.pageInfo.endCursor;
    if (typeof endCursor !== 'string' || !endCursor.trim()) {
      throw new Error('Outreach activity pagination omitted its next cursor');
    }
    return {
      edges: value.edges as ActivityConnection['edges'],
      pageInfo: { hasNextPage: true, endCursor },
    };
  }
  return {
    edges: value.edges as ActivityConnection['edges'],
    pageInfo: { hasNextPage: false, endCursor: value.pageInfo.endCursor },
  };
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
    const edges = (result.outreachActivities?.edges ?? []) as Array<{
      node?: Record<string, unknown> | null;
    }>;
    const nodes = edges
      .map((edge) => edge.node)
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
    const seenIds = new Set<string>();
    const seenCursors = new Set<string>();
    const startTime = Date.parse(start);
    const endTime = Date.parse(end);
    let cursor: string | undefined;
    while (true) {
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
              wholesalerId: true,
              company: { name: true },
              contact: { name: { firstName: true, lastName: true } },
              wholesaler: { id: true, name: true },
            },
          },
          pageInfo: { hasNextPage: true, endCursor: true },
        },
      });
      const connection = parseActivityConnection(result.outreachActivities);
      for (const edge of connection.edges) {
        const node = edge?.node;
        const occurredAt = Date.parse(node?.occurredAt ?? '');
        if (
          !node?.id ||
          !node.occurredAt ||
          !(occurredAt >= startTime && occurredAt < endTime) ||
          seenIds.has(node.id)
        ) {
          continue;
        }
        seenIds.add(node.id);
        const ownerId = node.wholesalerId?.trim() || node.wholesaler?.id?.trim();
        output.push({
          id: node.id,
          wholesalerId: ownerId || 'unassigned',
          wholesalerName:
            node.wholesaler?.name?.trim() ||
            (ownerId ? `Unassigned (${ownerId})` : 'Unassigned'),
          companyName: node.company?.name?.trim() || 'Unknown company',
          ...(fullName(node.contact?.name)
            ? { contactName: fullName(node.contact?.name) }
            : {}),
          activityType: node.activityType?.trim() || 'Unspecified',
          outcome: node.outcome?.trim() || 'Unspecified',
          ...(node.notes?.trim() ? { notes: node.notes.trim() } : {}),
          occurredAt: node.occurredAt,
        });
      }
      if (!connection.pageInfo.hasNextPage) return output;
      const nextCursor = connection.pageInfo.endCursor;
      if (seenCursors.has(nextCursor)) {
        throw new Error('Outreach activity pagination has a repeated cursor');
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
  }
}

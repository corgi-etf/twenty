import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type RawCoreGraphqlTransport } from 'src/modules/core/graphql/raw-core-graphql.transport';
import {
  type NamedRecord,
  type OutreachActivity,
  type OutreachActivityOwner,
  type OutreachActivityOwnerRepository,
  type OutreachActivityWrite,
  type OutreachRepository,
} from 'src/modules/outreach/types';
import { escapeSqlLikePattern } from 'src/modules/wholesaler/onboarding/utils/escape-sql-like-pattern';

const PAGE_SIZE = 100;
const MAX_PAGES = 100;

const FIND_OUTREACH_ACTIVITY_DOCUMENT = `
  query FindOutreachActivityById(
    $filter: OutreachActivityFilterInput
    $first: Int!
  ) {
    outreachActivities(filter: $filter, first: $first) {
      edges {
        node {
          id
          name
          companyId
          contactId
          wholesalerId
          activityType
          outcome
          notes
          occurredAt
          followUpDate
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CREATE_OUTREACH_ACTIVITY_DOCUMENT = `
  mutation CreateOutreachActivity($data: OutreachActivityCreateInput!) {
    createOutreachActivity(data: $data) {
      id
    }
  }
`;

const FIND_OUTREACH_ACTIVITY_OWNER_DOCUMENT = `
  query FindOutreachActivityOwner(
    $filter: OutreachActivityFilterInput
    $first: Int!
  ) {
    outreachActivities(filter: $filter, first: $first) {
      edges {
        node {
          id
          wholesalerId
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// The NULL owner is part of the filter, not just a precondition read, so the
// server refuses the write outright once anyone has picked a wholesaler.
const ASSIGN_OUTREACH_ACTIVITY_OWNER_DOCUMENT = `
  mutation AssignOutreachActivityOwner(
    $filter: OutreachActivityFilterInput!
    $data: OutreachActivityUpdateInput!
  ) {
    updateOutreachActivities(filter: $filter, data: $data) {
      id
      wholesalerId
    }
  }
`;

const LIST_OUTREACH_ACTIVITIES_DOCUMENT = `
  query ListOutreachActivities(
    $filter: OutreachActivityFilterInput
    $first: Int!
    $after: String
  ) {
    outreachActivities(filter: $filter, first: $first, after: $after) {
      edges {
        node {
          id
          activityType
          outcome
          notes
          occurredAt
          createdAt
          wholesalerId
          company {
            name
          }
          contact {
            name {
              firstName
              lastName
            }
          }
          wholesaler {
            id
            name
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type ActivityNode = {
  id?: string | null;
  activityType?: string | null;
  outcome?: string | null;
  notes?: string | null;
  occurredAt?: string | null;
  createdAt?: string | null;
  wholesalerId?: string | null;
  company?: { name?: string | null } | null;
  contact?: {
    name?: { firstName?: string | null; lastName?: string | null } | null;
  } | null;
  wholesaler?: { id?: string | null; name?: string | null } | null;
};

type ActivityConnection = {
  edges: Array<{ node?: ActivityNode | null } | null>;
  pageInfo:
    | { hasNextPage: false; endCursor?: unknown }
    | { hasNextPage: true; endCursor: string };
};

type OutreachActivitiesResponse = {
  outreachActivities?: unknown;
};

type CreateOutreachActivityResponse = {
  createOutreachActivity?: unknown;
};

type UpdateOutreachActivitiesResponse = {
  updateOutreachActivities?: unknown;
};

type OutreachActivityOwnerFilter = {
  and: Array<
    { id: { eq: string } } | { wholesalerId: { is: 'NULL' } }
  >;
};

// Rows whose occurredAt is NULL fail every gte/lt comparison, so a bare
// occurredAt window silently drops them. Widen the server-side filter to an OR
// across occurredAt and createdAt -- a deliberate superset. The authoritative
// window check stays client-side on the effective timestamp below, so the
// superset only costs a few extra rows, never a wrong answer.
type ActivityDateBound = { gte: string } | { lt: string };

type ActivityFilter = {
  and: Array<
    | { or: Array<{ occurredAt: ActivityDateBound } | { createdAt: ActivityDateBound }> }
    | { wholesalerId: { eq: string } }
  >;
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
  const edges = value.edges.map((edge) => {
    if (!isRecord(edge) || !isRecord(edge.node)) {
      throw new Error('Outreach activity connection response was malformed');
    }
    return { node: edge.node as ActivityNode };
  });
  if (value.pageInfo.hasNextPage) {
    const endCursor = value.pageInfo.endCursor;
    if (typeof endCursor !== 'string' || !endCursor.trim()) {
      throw new Error('Outreach activity pagination omitted its next cursor');
    }
    return {
      edges,
      pageInfo: { hasNextPage: true, endCursor },
    };
  }
  return {
    edges,
    pageInfo: { hasNextPage: false, endCursor: value.pageInfo.endCursor },
  };
};

const parseActivityOwner = (value: unknown): OutreachActivityOwner => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    !(
      value.wholesalerId === null ||
      value.wholesalerId === undefined ||
      typeof value.wholesalerId === 'string'
    )
  ) {
    throw new Error('Outreach activity owner response was malformed');
  }
  const wholesalerId =
    typeof value.wholesalerId === 'string' ? value.wholesalerId.trim() : '';
  return { id: value.id, wholesalerId: wholesalerId || null };
};

const fullName = (
  name:
    { firstName?: string | null; lastName?: string | null } | null | undefined,
) =>
  [name?.firstName, name?.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

export class CoreOutreachRepository
  implements OutreachRepository, OutreachActivityOwnerRepository
{
  public constructor(
    private readonly client: CoreApiClient,
    private readonly rawTransport: RawCoreGraphqlTransport,
  ) {}

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
      .filter((node): node is { id: string; name: string } =>
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
          edges: {
            node: { id: true, name: { firstName: true, lastName: true } },
          },
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
          .filter(
            ({ id, name }) =>
              id && name.toLowerCase().includes(normalizedQuery),
          ),
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

  public async createActivity(
    data: OutreachActivityWrite,
  ): Promise<{ id: string }> {
    const existing = await this.findActivityWrite(data.id);
    if (existing) return this.assertSameActivity(existing, data);
    try {
      const result = await this.rawTransport.request<
        CreateOutreachActivityResponse,
        { data: OutreachActivityWrite }
      >({
        operationName: 'CreateOutreachActivity',
        document: CREATE_OUTREACH_ACTIVITY_DOCUMENT,
        variables: { data },
      });
      if (
        !isRecord(result.createOutreachActivity) ||
        result.createOutreachActivity.id !== data.id
      ) {
        throw new Error(
          'createOutreachActivity did not return the deterministic id',
        );
      }
      return { id: data.id };
    } catch (error) {
      // A concurrent retry may have won the deterministic primary key. Accept
      // only an exact record; never turn an unrelated collision into success.
      const concurrent = await this.findActivityWrite(data.id);
      if (concurrent) return this.assertSameActivity(concurrent, data);
      throw error;
    }
  }

  public async getActivityOwner(
    id: string,
  ): Promise<OutreachActivityOwner | null> {
    const result = await this.rawTransport.request<
      OutreachActivitiesResponse,
      { filter: { id: { eq: string } }; first: number }
    >({
      operationName: 'FindOutreachActivityOwner',
      document: FIND_OUTREACH_ACTIVITY_OWNER_DOCUMENT,
      variables: { filter: { id: { eq: id } }, first: 2 },
    });
    const nodes = parseActivityConnection(result.outreachActivities).edges.map(
      (edge) => parseActivityOwner(edge?.node),
    );
    if (nodes.length > 1) {
      throw new Error(`Duplicate outreach activity ID ${id}`);
    }
    const owner = nodes[0];
    if (owner && owner.id !== id) {
      throw new Error('Outreach activity owner query returned another record');
    }
    return owner ?? null;
  }

  public async assignUnassignedActivityOwner({
    id,
    wholesalerId,
  }: {
    id: string;
    wholesalerId: string;
  }): Promise<boolean> {
    try {
      const result = await this.rawTransport.request<
        UpdateOutreachActivitiesResponse,
        {
          filter: OutreachActivityOwnerFilter;
          data: { wholesalerId: string };
        }
      >({
        operationName: 'AssignOutreachActivityOwner',
        document: ASSIGN_OUTREACH_ACTIVITY_OWNER_DOCUMENT,
        variables: {
          filter: {
            and: [{ id: { eq: id } }, { wholesalerId: { is: 'NULL' } }],
          },
          data: { wholesalerId },
        },
      });
      const rows = result.updateOutreachActivities;
      if (Array.isArray(rows) && rows.length === 1) {
        const updated = parseActivityOwner(rows[0]);
        if (updated.id === id && updated.wholesalerId === wholesalerId) {
          return true;
        }
      }
    } catch {
      // A committed mutation can still lose its response. Exact readback is the
      // only safe way to tell that apart from a competing owner selection.
    }
    const persisted = await this.getActivityOwner(id);
    return persisted?.wholesalerId === wholesalerId;
  }

  private async findActivityWrite(
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const result = await this.rawTransport.request<
      OutreachActivitiesResponse,
      { filter: { id: { eq: string } }; first: number }
    >({
      operationName: 'FindOutreachActivityById',
      document: FIND_OUTREACH_ACTIVITY_DOCUMENT,
      variables: {
        filter: { id: { eq: id } },
        first: 2,
      },
    });
    const connection = parseActivityConnection(result.outreachActivities);
    const nodes = connection.edges
      .map((edge) => edge?.node)
      .filter((node): node is ActivityNode => isRecord(node));
    if (nodes.length > 1) {
      throw new Error(`Duplicate outreach activity ID ${id}`);
    }
    return nodes[0] ?? null;
  }

  private assertSameActivity(
    existing: Record<string, unknown>,
    expected: OutreachActivityWrite,
  ): { id: string } {
    const comparable = (value: unknown) => value ?? null;
    for (const [key, value] of Object.entries(expected)) {
      if (comparable(existing[key]) !== comparable(value)) {
        throw new Error(
          `Deterministic outreach activity ${expected.id} conflicts at ${key}`,
        );
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
    if (!(startTime < endTime)) {
      throw new Error('Invalid outreach activity report window');
    }
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const filters: ActivityFilter['and'] = [
        { or: [{ occurredAt: { gte: start } }, { createdAt: { gte: start } }] },
        { or: [{ occurredAt: { lt: end } }, { createdAt: { lt: end } }] },
      ];
      if (wholesalerId) filters.push({ wholesalerId: { eq: wholesalerId } });
      const result = await this.rawTransport.request<
        OutreachActivitiesResponse,
        {
          filter: ActivityFilter;
          first: number;
          after: string | null;
        }
      >({
        operationName: 'ListOutreachActivities',
        document: LIST_OUTREACH_ACTIVITIES_DOCUMENT,
        variables: {
          filter: { and: filters },
          first: PAGE_SIZE,
          after: cursor ?? null,
        },
      });
      const connection = parseActivityConnection(result.outreachActivities);
      for (const edge of connection.edges) {
        const node = edge?.node;
        if (typeof node?.id !== 'string' || !node.id.trim()) {
          throw new Error('Outreach activity returned an invalid identity');
        }
        // An activity logged without an explicit date has occurredAt NULL but
        // always has createdAt, so fall back to it rather than dropping a real
        // piece of outreach from the count.
        const effectiveAt =
          typeof node.occurredAt === 'string' &&
          Number.isFinite(Date.parse(node.occurredAt))
            ? node.occurredAt
            : typeof node.createdAt === 'string' &&
                Number.isFinite(Date.parse(node.createdAt))
              ? node.createdAt
              : null;
        if (effectiveAt === null) {
          throw new Error('Outreach activity returned an invalid timestamp');
        }
        const occurredAt = Date.parse(effectiveAt);
        if (
          !(occurredAt >= startTime && occurredAt < endTime) ||
          seenIds.has(node.id)
        ) {
          continue;
        }
        seenIds.add(node.id);
        const foreignOwnerId = node.wholesalerId?.trim();
        const relatedOwnerId = node.wholesaler?.id?.trim();
        if (
          foreignOwnerId &&
          relatedOwnerId &&
          foreignOwnerId !== relatedOwnerId
        ) {
          throw new Error(
            'Outreach activity returned conflicting owner identities',
          );
        }
        const ownerId = foreignOwnerId || relatedOwnerId;
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
          occurredAt: effectiveAt,
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
    throw new Error(`Outreach activity pagination exceeded ${MAX_PAGES} pages`);
  }
}

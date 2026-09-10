import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import {
  assertWorkspaceConfigCheckpoint,
  type WorkspaceConfigApi,
  type WorkspaceConfigCheckpoint,
  type WorkspaceMetadataBootstrapApi,
} from './execution.ts';
import type {
  CompanyTerritoryRecord,
  WholesalerTerritoryRecord,
  WorkspaceConfigSnapshot,
  WorkspaceMetadataObject,
  WorkspaceNavigationMenuItem,
  WorkspaceView,
} from './planner.ts';
import type { TerritoryIdentityDiscoveryApi } from './territory-identity-discovery.ts';

export const WORKSPACE_CONFIG_APPROVED_ORIGIN = 'https://crm.corgiinvest.com';
export const WORKSPACE_CONFIG_APPROVED_WORKSPACE_ID =
  'eabf5d9d-fc99-4acb-b160-710ecb1db996';
export const WORKSPACE_CONFIG_APPROVED_USER_WORKSPACE_ID =
  '767771e9-834d-4a89-88ca-1df32d101a40';

export type WorkspaceConfigResponse = {
  ok(): boolean;
  status(): number;
  headers(): Record<string, string>;
  json(): Promise<unknown>;
  dispose(): Promise<void>;
};

type RequestOptions = {
  headers: Record<string, string>;
  data?: unknown;
};

export type WorkspaceConfigRequestContext = {
  get(url: string, options: RequestOptions): Promise<WorkspaceConfigResponse>;
  post(url: string, options: RequestOptions): Promise<WorkspaceConfigResponse>;
  patch(url: string, options: RequestOptions): Promise<WorkspaceConfigResponse>;
};

type MetadataListResponse = {
  data?: WorkspaceMetadataObject[] | { objects?: WorkspaceMetadataObject[] };
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};

type RecordListResponse = {
  data?: Record<string, unknown>;
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};

type GraphqlResponse = {
  data?: Record<string, unknown>;
  errors?: unknown;
};

type OpenApiSchema = {
  $ref?: string;
  oneOf?: OpenApiSchema[];
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
};

type CoreOpenApiDocument = {
  components?: { schemas?: Record<string, OpenApiSchema> };
};

const assertSuccessfulResponse = async (
  response: WorkspaceConfigResponse,
  operation: string,
): Promise<void> => {
  if (!response.ok()) {
    const status = response.status();
    await response.dispose();
    throw new Error(`${operation} failed with HTTP ${status}`);
  }
};

const disposeAfterJson = async <T>(
  response: WorkspaceConfigResponse,
  operation: string,
): Promise<T> => {
  try {
    try {
      return (await response.json()) as T;
    } catch {
      throw new Error(`${operation} response was not valid JSON`);
    }
  } finally {
    await response.dispose();
  }
};

const responseSchemaName = (objectName: string): string =>
  `${objectName.charAt(0).toUpperCase()}${objectName.slice(1)}ForResponse`;

const referencedSchemaName = (schema: OpenApiSchema): string | undefined => {
  const reference =
    schema.$ref ??
    schema.items?.$ref ??
    schema.oneOf?.find((candidate) => candidate.$ref)?.$ref;

  return reference?.match(/^#\/components\/schemas\/(.+)$/)?.[1];
};

const relationTargetId = (
  field: WorkspaceMetadataObject['fields'][number],
): string | null | undefined =>
  field.relationTargetObjectMetadataId ??
  field.settings?.relationTargetObjectMetadataId;

const projectRelationTargets = (
  objects: WorkspaceMetadataObject[],
  document: CoreOpenApiDocument,
): void => {
  const schemas = document.components?.schemas ?? {};
  const objectIdByResponseSchema = new Map(
    objects.map((object) => [
      responseSchemaName(object.nameSingular),
      object.id,
    ]),
  );
  for (const object of objects) {
    const properties =
      schemas[responseSchemaName(object.nameSingular)]?.properties;
    for (const field of object.fields) {
      if (field.type !== 'RELATION' || relationTargetId(field)) continue;
      const targetSchema = properties?.[field.name]
        ? referencedSchemaName(properties[field.name])
        : undefined;
      const targetId = targetSchema
        ? objectIdByResponseSchema.get(targetSchema)
        : undefined;
      if (targetId) field.relationTargetObjectMetadataId = targetId;
    }
  }
};

export const createWorkspaceConfigRequestGate = ({
  minimumIntervalMs = 650,
  now = Date.now,
  wait = (delay: number) =>
    new Promise<void>((resolveDelay) => setTimeout(resolveDelay, delay)),
}: {
  minimumIntervalMs?: number;
  now?: () => number;
  wait?: (delay: number) => Promise<void>;
} = {}) => {
  let lastRequestAt: number | undefined;

  return async (
    request: () => Promise<WorkspaceConfigResponse>,
  ): Promise<WorkspaceConfigResponse> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const delay =
        lastRequestAt === undefined
          ? 0
          : Math.max(0, minimumIntervalMs - (now() - lastRequestAt));
      if (delay > 0) await wait(delay);
      const response = await request();
      lastRequestAt = now();
      if (response.status() !== 429) return response;

      const retryAfterSeconds = Number(response.headers()['retry-after']);
      const retryDelay = Number.isFinite(retryAfterSeconds)
        ? Math.min(
            Math.max(retryAfterSeconds * 1000, minimumIntervalMs),
            30_000,
          )
        : Math.min(1000 * 2 ** attempt, 30_000);
      await response.dispose();
      if (attempt < 4) await wait(retryDelay);
    }

    throw new Error(
      'Workspace configuration request remained rate limited after retries',
    );
  };
};

type TenantResponse = {
  data?: {
    currentUser?: {
      currentWorkspace?: { id?: unknown; displayName?: unknown } | null;
      currentUserWorkspace?: {
        id?: unknown;
        permissionFlags?: unknown;
        isImpersonating?: unknown;
      } | null;
    } | null;
  };
  errors?: unknown;
};

export const assertWorkspaceConfigTenant = async ({
  request,
  origin,
  requestGate = createWorkspaceConfigRequestGate(),
}: {
  request: WorkspaceConfigRequestContext;
  origin: string;
  requestGate?: ReturnType<typeof createWorkspaceConfigRequestGate>;
}): Promise<void> => {
  if (origin !== WORKSPACE_CONFIG_APPROVED_ORIGIN) {
    throw new Error('Workspace configuration tenant origin is not approved');
  }
  const response = await requestGate(() =>
    request.post(new URL('/metadata', origin).toString(), {
      headers: { Origin: origin },
      data: {
        operationName: 'WorkspaceConfigurationTenantPreflight',
        query: `query WorkspaceConfigurationTenantPreflight {
          currentUser {
            currentWorkspace { id displayName }
            currentUserWorkspace { id permissionFlags isImpersonating }
          }
        }`,
      },
    }),
  );
  await assertSuccessfulResponse(
    response,
    'Workspace configuration tenant preflight',
  );
  const body = await disposeAfterJson<TenantResponse>(
    response,
    'Tenant preflight',
  );
  const user = body.data?.currentUser;
  const workspace = user?.currentWorkspace;
  const membership = user?.currentUserWorkspace;
  if (
    (Array.isArray(body.errors)
      ? body.errors.length > 0
      : Boolean(body.errors)) ||
    workspace?.id !== WORKSPACE_CONFIG_APPROVED_WORKSPACE_ID ||
    workspace.displayName !== 'Corgi ETF'
  ) {
    throw new Error(
      'Authenticated workspace configuration tenant is not approved',
    );
  }
  if (
    membership?.id !== WORKSPACE_CONFIG_APPROVED_USER_WORKSPACE_ID ||
    !Array.isArray(membership.permissionFlags) ||
    !membership.permissionFlags.includes('DATA_MODEL') ||
    membership.isImpersonating === true
  ) {
    throw new Error(
      'Workspace configuration session lacks metadata permission',
    );
  }

  return { workspaceId: workspace.id as string };
};

const checkpointHash = (checkpoint: WorkspaceConfigCheckpoint): string =>
  createHash('sha256').update(JSON.stringify(checkpoint), 'utf8').digest('hex');

export const preflightWorkspaceConfigCheckpoint = async ({
  runnerTemp,
  checkpointPath,
}: {
  runnerTemp: string;
  checkpointPath: string;
}): Promise<string> => {
  if (!runnerTemp || !checkpointPath) {
    throw new Error('Workspace configuration checkpoint path is required');
  }
  const lexicalRoot = resolve(runnerTemp);
  const physicalRoot = await realpath(lexicalRoot);
  const resolvedPath = resolve(checkpointPath);
  if (!resolvedPath.startsWith(`${lexicalRoot}${sep}`)) {
    throw new Error(
      'Workspace configuration checkpoint must be below RUNNER_TEMP',
    );
  }
  await mkdir(dirname(resolvedPath), { recursive: true });
  const physicalParent = await realpath(dirname(resolvedPath));
  if (
    physicalParent !== physicalRoot &&
    !physicalParent.startsWith(`${physicalRoot}${sep}`)
  ) {
    throw new Error(
      'Workspace configuration checkpoint parent escapes RUNNER_TEMP',
    );
  }
  try {
    const status = await lstat(resolvedPath);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error('Workspace configuration checkpoint has an invalid type');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  return resolvedPath;
};

const approvedWorkspaceConfigOrigins = ({
  backendBaseUrl,
  frontendBaseUrl,
}: {
  backendBaseUrl: string;
  frontendBaseUrl: string;
}): { backendOrigin: string; frontendOrigin: string } => {
  const backendOrigin = new URL(backendBaseUrl).origin;
  const frontendOrigin = new URL(frontendBaseUrl).origin;
  if (
    backendBaseUrl !== backendOrigin ||
    frontendBaseUrl !== frontendOrigin ||
    backendOrigin !== WORKSPACE_CONFIG_APPROVED_ORIGIN ||
    frontendOrigin !== WORKSPACE_CONFIG_APPROVED_ORIGIN
  ) {
    throw new Error('Workspace configuration API origin is not approved');
  }

  return { backendOrigin, frontendOrigin };
};

const createWholesalerLister = ({
  request,
  backendOrigin,
  frontendOrigin,
  requestGate,
}: {
  request: WorkspaceConfigRequestContext;
  backendOrigin: string;
  frontendOrigin: string;
  requestGate: ReturnType<typeof createWorkspaceConfigRequestGate>;
}) => {
  const headers = { Origin: frontendOrigin };

  return async (): Promise<WholesalerTerritoryRecord[]> => {
    const wholesalers: WholesalerTerritoryRecord[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: '100', depth: '1' });
      if (cursor) query.set('starting_after', cursor);
      const url = new URL('/rest/wholesalers', backendOrigin);
      url.search = query.toString();
      const response = await requestGate(() =>
        request.get(url.toString(), { headers }),
      );
      await assertSuccessfulResponse(
        response,
        'List wholesalers for territory assignment',
      );
      const body = await disposeAfterJson<RecordListResponse>(
        response,
        'Wholesaler list',
      );
      const pageWholesalers = body.data?.wholesalers;
      if (!Array.isArray(pageWholesalers)) {
        throw new Error('Wholesaler list response has an invalid shape');
      }
      wholesalers.push(...(pageWholesalers as WholesalerTerritoryRecord[]));
      cursor = body.pageInfo?.hasNextPage
        ? (body.pageInfo.endCursor ?? undefined)
        : undefined;
      if (body.pageInfo?.hasNextPage && !cursor) {
        throw new Error('Wholesaler pagination omitted its cursor');
      }
    } while (cursor);

    return wholesalers;
  };
};

export const createTwentyWorkspaceConfigApi = ({
  request,
  backendBaseUrl,
  frontendBaseUrl,
  checkpointFilePath,
  requestGate = createWorkspaceConfigRequestGate(),
}: {
  request: WorkspaceConfigRequestContext;
  backendBaseUrl: string;
  frontendBaseUrl: string;
  checkpointFilePath: string;
  requestGate?: ReturnType<typeof createWorkspaceConfigRequestGate>;
}): WorkspaceConfigApi => {
  const { backendOrigin, frontendOrigin } = approvedWorkspaceConfigOrigins({
    backendBaseUrl,
    frontendBaseUrl,
  });
  const headers = { Origin: frontendOrigin };
  const restUrl = (path: string) =>
    new URL(`/rest/${path}`, backendOrigin).toString();
  const metadataUrl = new URL('/metadata', backendOrigin).toString();

  const graphql = async <T>(
    operationName: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> => {
    const response = await requestGate(() =>
      request.post(metadataUrl, {
        headers,
        data: { operationName, query, variables },
      }),
    );
    await assertSuccessfulResponse(response, operationName);
    const body = await disposeAfterJson<GraphqlResponse>(
      response,
      operationName,
    );
    if (
      (Array.isArray(body.errors)
        ? body.errors.length > 0
        : Boolean(body.errors)) ||
      !body.data
    ) {
      throw new Error(`${operationName} returned GraphQL errors`);
    }

    return body.data as T;
  };

  const listMetadataObjects = async (): Promise<WorkspaceMetadataObject[]> => {
    const objects: WorkspaceMetadataObject[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: '100' });
      if (cursor) query.set('starting_after', cursor);
      const response = await requestGate(() =>
        request.get(`${restUrl('metadata/objects')}?${query.toString()}`, {
          headers,
        }),
      );
      await assertSuccessfulResponse(
        response,
        'List workspace metadata objects',
      );
      const body = await disposeAfterJson<MetadataListResponse>(
        response,
        'Metadata object list',
      );
      const pageObjects = Array.isArray(body.data)
        ? body.data
        : body.data?.objects;
      if (!Array.isArray(pageObjects)) {
        throw new Error('Workspace metadata object list has an invalid shape');
      }
      objects.push(...pageObjects);
      cursor = body.pageInfo?.hasNextPage
        ? (body.pageInfo.endCursor ?? undefined)
        : undefined;
      if (body.pageInfo?.hasNextPage && !cursor) {
        throw new Error('Workspace metadata pagination omitted its cursor');
      }
    } while (cursor);

    if (
      objects.some((object) =>
        object.fields.some(
          (field) => field.type === 'RELATION' && !relationTargetId(field),
        ),
      )
    ) {
      const response = await requestGate(() =>
        request.get(restUrl('open-api/core'), { headers }),
      );
      await assertSuccessfulResponse(response, 'Get core OpenAPI');
      const document = await disposeAfterJson<CoreOpenApiDocument>(
        response,
        'Core OpenAPI',
      );
      projectRelationTargets(objects, document);
    }

    return objects;
  };

  const listCompanies = async (): Promise<CompanyTerritoryRecord[]> => {
    const companies: CompanyTerritoryRecord[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: '100', depth: '0' });
      if (cursor) query.set('starting_after', cursor);
      const response = await requestGate(() =>
        request.get(`${restUrl('companies')}?${query.toString()}`, { headers }),
      );
      await assertSuccessfulResponse(
        response,
        'List companies for territory projection',
      );
      const body = await disposeAfterJson<RecordListResponse>(
        response,
        'Company list',
      );
      const pageCompanies = body.data?.companies;
      if (!Array.isArray(pageCompanies)) {
        throw new Error('Company list response has an invalid shape');
      }
      companies.push(...(pageCompanies as CompanyTerritoryRecord[]));
      cursor = body.pageInfo?.hasNextPage
        ? (body.pageInfo.endCursor ?? undefined)
        : undefined;
      if (body.pageInfo?.hasNextPage && !cursor) {
        throw new Error('Company pagination omitted its cursor');
      }
    } while (cursor);

    return companies;
  };

  const listWholesalers = createWholesalerLister({
    request,
    backendOrigin,
    frontendOrigin,
    requestGate,
  });

  return {
    async listWorkspaceConfigSnapshot(): Promise<WorkspaceConfigSnapshot> {
      const objects = await listMetadataObjects();
      const metadata = await graphql<{
        getViews: WorkspaceView[];
        navigationMenuItems: WorkspaceNavigationMenuItem[];
      }>(
        'LoadWorkspaceConfiguration',
        `
          query LoadWorkspaceConfiguration {
            getViews {
              id
              universalIdentifier
              name
              objectMetadataId
              type
              key
              icon
              position
              visibility
              createdByUserWorkspaceId
              viewFields {
                id
                fieldMetadataId
                isVisible
                position
                size
              }
              viewFilters {
                id
                fieldMetadataId
                operand
                value
                subFieldName
              }
              viewSorts {
                id
                fieldMetadataId
                direction
                subFieldName
              }
            }
            navigationMenuItems {
              id
              type
              userWorkspaceId
              targetObjectMetadataId
              viewId
              folderId
              position
              name
            }
          }
        `,
      );
      if (
        !Array.isArray(metadata.getViews) ||
        !Array.isArray(metadata.navigationMenuItems)
      ) {
        throw new Error(
          'Workspace view or navigation metadata has an invalid shape',
        );
      }

      return {
        objects,
        views: metadata.getViews,
        navigationMenuItems: metadata.navigationMenuItems,
      };
    },

    listCompanies,
    listWholesalers,

    async createMetadataField(input) {
      const response = await requestGate(() =>
        request.post(restUrl('metadata/fields'), {
          headers,
          data: { ...input, isLabelSyncedWithName: false },
        }),
      );
      await assertSuccessfulResponse(
        response,
        `Create CRM ${input.name} field`,
      );
      await response.dispose();
    },

    async updateMetadataFieldLabel(id, label) {
      const response = await requestGate(() =>
        request.patch(restUrl(`metadata/fields/${encodeURIComponent(id)}`), {
          headers,
          data: { label, isLabelSyncedWithName: false },
        }),
      );
      await assertSuccessfulResponse(response, 'Update territory field label');
      await response.dispose();
    },

    async conditionalPatchCompany(id, expectedUpdatedAt, data) {
      const filter = `and(id[eq]:${JSON.stringify(id)},updatedAt[eq]:${JSON.stringify(expectedUpdatedAt)})`;
      const query = new URLSearchParams({ filter, depth: '0' });
      const response = await requestGate(() =>
        request.patch(`${restUrl('companies')}?${query.toString()}`, {
          headers,
          data,
        }),
      );
      await assertSuccessfulResponse(
        response,
        'Conditionally project company territory',
      );
      const body = await disposeAfterJson<RecordListResponse>(
        response,
        'Company territory update',
      );
      const updated = body.data?.updateCompanies;
      if (
        !Array.isArray(updated) ||
        updated.length !== 1 ||
        (updated[0] as { id?: unknown } | undefined)?.id !== id
      ) {
        throw new Error('Company territory projection concurrency conflict');
      }
    },

    async conditionalPatchWholesaler(id, expectedUpdatedAt, data) {
      const filter = `and(id[eq]:${JSON.stringify(id)},updatedAt[eq]:${JSON.stringify(expectedUpdatedAt)})`;
      const query = new URLSearchParams({ filter, depth: '0' });
      const response = await requestGate(() =>
        request.patch(`${restUrl('wholesalers')}?${query.toString()}`, {
          headers,
          data,
        }),
      );
      await assertSuccessfulResponse(
        response,
        'Conditionally assign wholesaler territory',
      );
      const body = await disposeAfterJson<RecordListResponse>(
        response,
        'Wholesaler territory update',
      );
      const updated = body.data?.updateWholesalers;
      if (
        !Array.isArray(updated) ||
        updated.length !== 1 ||
        (updated[0] as { id?: unknown } | undefined)?.id !== id
      ) {
        throw new Error('Wholesaler territory assignment concurrency conflict');
      }
    },

    async createView(input) {
      const response = await requestGate(() =>
        request.post(restUrl('metadata/views'), {
          headers,
          data: input,
        }),
      );
      await assertSuccessfulResponse(
        response,
        'Create managed Follow-ups view',
      );
      const created = await disposeAfterJson<{
        id?: unknown;
        universalIdentifier?: unknown;
        createdByUserWorkspaceId?: unknown;
      }>(response, 'Create managed Follow-ups view');
      if (
        created.id !== input.id ||
        created.universalIdentifier !== input.universalIdentifier ||
        created.createdByUserWorkspaceId !== null
      ) {
        throw new Error(
          'Create Follow-ups view returned a non-workspace managed identity',
        );
      }
    },

    async updateView(id, update) {
      const data = await graphql<{ updateView?: { id?: string } }>(
        'UpdateManagedFollowUpsView',
        `
          mutation UpdateManagedFollowUpsView(
            $id: String!
            $input: UpdateViewInput!
          ) {
            updateView(id: $id, input: $input) {
              id
            }
          }
        `,
        { id, input: update },
      );
      if (data.updateView?.id !== id) {
        throw new Error('Update Follow-ups view returned an unexpected ID');
      }
    },

    async createViewField(input) {
      const data = await graphql<{ createViewField?: { id?: string } }>(
        'CreateManagedViewField',
        `
          mutation CreateManagedViewField($input: CreateViewFieldInput!) {
            createViewField(input: $input) {
              id
            }
          }
        `,
        { input },
      );
      if (input.id && data.createViewField?.id !== input.id) {
        throw new Error('Create managed view field returned an unexpected ID');
      }
      if (!data.createViewField?.id) {
        throw new Error('Create managed view field omitted its ID');
      }
    },

    async updateViewField(id, update) {
      const data = await graphql<{ updateViewField?: { id?: string } }>(
        'UpdateManagedViewField',
        `
          mutation UpdateManagedViewField($input: UpdateViewFieldInput!) {
            updateViewField(input: $input) {
              id
            }
          }
        `,
        { input: { id, update } },
      );
      if (data.updateViewField?.id !== id) {
        throw new Error('Update managed view field returned an unexpected ID');
      }
    },

    async createViewFilter(input) {
      const data = await graphql<{ createViewFilter?: { id?: string } }>(
        'CreateManagedFollowUpsFilter',
        `
          mutation CreateManagedFollowUpsFilter(
            $input: CreateViewFilterInput!
          ) {
            createViewFilter(input: $input) {
              id
            }
          }
        `,
        { input },
      );
      if (data.createViewFilter?.id !== input.id) {
        throw new Error('Create Follow-ups filter returned an unexpected ID');
      }
    },

    async deleteViewFilter(id) {
      const data = await graphql<{ deleteViewFilter?: boolean }>(
        'DeleteManagedFollowUpsFilter',
        `
          mutation DeleteManagedFollowUpsFilter(
            $input: DeleteViewFilterInput!
          ) {
            deleteViewFilter(input: $input)
          }
        `,
        { input: { id } },
      );
      if (data.deleteViewFilter !== true) {
        throw new Error('Delete Follow-ups filter was not acknowledged');
      }
    },

    async deleteViewSort(id) {
      const data = await graphql<{ deleteViewSort?: boolean }>(
        'DeleteManagedCompanySort',
        `
          mutation DeleteManagedCompanySort($input: DeleteViewSortInput!) {
            deleteViewSort(input: $input)
          }
        `,
        { input: { id } },
      );
      if (data.deleteViewSort !== true) {
        throw new Error('Delete company sort was not acknowledged');
      }
    },

    async createViewSort(input) {
      const data = await graphql<{ createViewSort?: { id?: string } }>(
        'CreateManagedCompanyStateSort',
        `
          mutation CreateManagedCompanyStateSort($input: CreateViewSortInput!) {
            createViewSort(input: $input) {
              id
            }
          }
        `,
        { input },
      );
      if (input.id && data.createViewSort?.id !== input.id) {
        throw new Error('Create company state sort returned an unexpected ID');
      }
      if (!data.createViewSort?.id) {
        throw new Error('Create company state sort omitted its ID');
      }
    },

    async deleteNavigationItems(ids) {
      const data = await graphql<{
        deleteManyNavigationMenuItems?: Array<{ id?: string }>;
      }>(
        'DeleteUnmanagedNavigationItems',
        `
          mutation DeleteUnmanagedNavigationItems($ids: [UUID!]!) {
            deleteManyNavigationMenuItems(ids: $ids) {
              id
            }
          }
        `,
        { ids },
      );
      const returnedIds = data.deleteManyNavigationMenuItems
        ?.map(({ id }) => id)
        .sort();
      if (JSON.stringify(returnedIds) !== JSON.stringify([...ids].sort())) {
        throw new Error('Navigation deletion returned unexpected IDs');
      }
    },

    async createNavigationItems(inputs) {
      const data = await graphql<{
        createManyNavigationMenuItems?: Array<{ id?: string }>;
      }>(
        'CreateManagedNavigationItems',
        `
          mutation CreateManagedNavigationItems(
            $inputs: [CreateNavigationMenuItemInput!]!
          ) {
            createManyNavigationMenuItems(inputs: $inputs) {
              id
            }
          }
        `,
        { inputs },
      );
      if (data.createManyNavigationMenuItems?.length !== inputs.length) {
        throw new Error('Navigation creation returned an unexpected count');
      }
    },

    async updateNavigationItems(inputs) {
      const data = await graphql<{
        updateManyNavigationMenuItems?: Array<{ id?: string }>;
      }>(
        'UpdateManagedNavigationItems',
        `
          mutation UpdateManagedNavigationItems(
            $inputs: [UpdateOneNavigationMenuItemInput!]!
          ) {
            updateManyNavigationMenuItems(inputs: $inputs) {
              id
            }
          }
        `,
        { inputs },
      );
      const returnedIds = data.updateManyNavigationMenuItems
        ?.map(({ id }) => id)
        .sort();
      const expectedIds = inputs.map(({ id }) => id).sort();
      if (JSON.stringify(returnedIds) !== JSON.stringify(expectedIds)) {
        throw new Error('Navigation update returned unexpected IDs');
      }
    },

    async readCheckpoint() {
      let raw: string;
      try {
        raw = await readFile(checkpointFilePath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          return undefined;
        throw error;
      }
      let envelope: { sha256?: unknown; checkpoint?: unknown };
      try {
        envelope = JSON.parse(raw) as typeof envelope;
      } catch {
        throw new Error('Workspace configuration checkpoint is invalid JSON');
      }
      const checkpoint = assertWorkspaceConfigCheckpoint(envelope.checkpoint);
      if (envelope.sha256 !== checkpointHash(checkpoint)) {
        throw new Error(
          'Workspace configuration checkpoint failed its integrity check',
        );
      }

      return checkpoint;
    },

    async writeCheckpoint(checkpoint) {
      assertWorkspaceConfigCheckpoint(checkpoint);
      const temporaryPath = `${checkpointFilePath}.tmp-${randomUUID()}`;
      const payload = JSON.stringify(
        { sha256: checkpointHash(checkpoint), checkpoint },
        null,
        2,
      );
      await mkdir(dirname(checkpointFilePath), { recursive: true });
      try {
        await writeFile(temporaryPath, `${payload}\n`, {
          encoding: 'utf8',
          flag: 'wx',
        });
        await rename(temporaryPath, checkpointFilePath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
    },
  };
};

export const createTwentyTerritoryIdentityDiscoveryApi = ({
  request,
  backendBaseUrl,
  frontendBaseUrl,
  requestGate = createWorkspaceConfigRequestGate(),
}: {
  request: WorkspaceConfigRequestContext;
  backendBaseUrl: string;
  frontendBaseUrl: string;
  requestGate?: ReturnType<typeof createWorkspaceConfigRequestGate>;
}): TerritoryIdentityDiscoveryApi => {
  const { backendOrigin, frontendOrigin } = approvedWorkspaceConfigOrigins({
    backendBaseUrl,
    frontendBaseUrl,
  });

  return {
    listWholesalers: createWholesalerLister({
      request,
      backendOrigin,
      frontendOrigin,
      requestGate,
    }),
  };
};

export const createTwentyWorkspaceMetadataBootstrapApi = ({
  request,
  backendBaseUrl,
  frontendBaseUrl,
  requestGate = createWorkspaceConfigRequestGate(),
}: {
  request: WorkspaceConfigRequestContext;
  backendBaseUrl: string;
  frontendBaseUrl: string;
  requestGate?: ReturnType<typeof createWorkspaceConfigRequestGate>;
}): WorkspaceMetadataBootstrapApi => {
  const api = createTwentyWorkspaceConfigApi({
    request,
    backendBaseUrl,
    frontendBaseUrl,
    checkpointFilePath: '',
    requestGate,
  });

  return {
    listWorkspaceConfigSnapshot: () => api.listWorkspaceConfigSnapshot(),
    createMetadataField: (input) => api.createMetadataField(input),
    updateMetadataFieldLabel: (id, label) =>
      api.updateMetadataFieldLabel(id, label),
  };
};

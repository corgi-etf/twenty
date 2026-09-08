import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  assertTrustedManifestShape,
  type CanonicalizationApi,
  type CanonicalizationCheckpoint,
} from './execution.ts';
import type {
  MetadataCreate,
  MetadataField,
  MetadataObject,
} from './metadata.ts';
import type { CanonicalizationSnapshot, CrmRecord } from './planner.ts';
import {
  createCanonicalizationRequestGate,
  type RateLimitedResponse,
} from './request-gate.ts';

export type CanonicalizationResponse = RateLimitedResponse & {
  ok(): boolean;
  json(): Promise<unknown>;
};

type RequestOptions = {
  headers: Record<string, string>;
  data?: unknown;
};

export type CanonicalizationRequestContext = {
  get(url: string, options: RequestOptions): Promise<CanonicalizationResponse>;
  post(url: string, options: RequestOptions): Promise<CanonicalizationResponse>;
  patch(
    url: string,
    options: RequestOptions,
  ): Promise<CanonicalizationResponse>;
};

type MetadataListResponse = {
  data?: MetadataObject[] | { objects?: MetadataObject[] };
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};

type RecordListResponse = {
  data?: Record<string, unknown>;
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
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

export const CANONICALIZATION_MAX_BODY_BYTES = 8 * 1024 * 1024;

const assertSuccessfulResponse = async (
  response: CanonicalizationResponse,
  operation: string,
): Promise<void> => {
  if (!response.ok()) {
    const status = response.status();
    await response.dispose();
    throw new Error(`${operation} failed with HTTP ${status}`);
  }
};

const disposeAfterJson = async <T>(
  response: CanonicalizationResponse,
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

const checkpointHash = (checkpoint: CanonicalizationCheckpoint): string =>
  createHash('sha256').update(JSON.stringify(checkpoint), 'utf8').digest('hex');

const assertCheckpoint = (value: unknown): CanonicalizationCheckpoint => {
  const checkpoint = value as CanonicalizationCheckpoint;
  let canonicalOrigin = '';
  try {
    canonicalOrigin = new URL(checkpoint?.origin).origin;
  } catch {
    // The shape check below emits a redacted error.
  }
  if (
    checkpoint?.schemaVersion !== 1 ||
    typeof checkpoint.origin !== 'string' ||
    canonicalOrigin !== checkpoint.origin ||
    !['metadata', 'records', 'verifying', 'complete'].includes(
      checkpoint.status,
    ) ||
    !Array.isArray(checkpoint.completedOperations) ||
    checkpoint.completedOperations.some(
      (operation) =>
        !operation ||
        typeof operation.key !== 'string' ||
        !operation.key ||
        !/^[a-f0-9]{64}$/.test(operation.sha256),
    ) ||
    new Set(checkpoint.completedOperations.map(({ key }) => key)).size !==
      checkpoint.completedOperations.length
  ) {
    throw new Error('Canonicalization checkpoint has an invalid shape');
  }
  assertTrustedManifestShape(checkpoint.manifest);

  return checkpoint;
};

const assertBodyWithinLimit = (operation: string, value: unknown): void => {
  const body = JSON.stringify(value);
  if (
    body === undefined ||
    Buffer.byteLength(body, 'utf8') > CANONICALIZATION_MAX_BODY_BYTES
  ) {
    throw new Error(`Canonicalization body is too large for ${operation}`);
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

const relationTargetId = (field: MetadataField): string | null | undefined =>
  field.relationTargetObjectMetadataId ??
  field.settings?.relationTargetObjectMetadataId;

const projectRelationTargets = (
  objects: MetadataObject[],
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

export const createTwentyRestCanonicalizationApi = ({
  request,
  backendBaseUrl,
  frontendBaseUrl,
  checkpointFilePath,
  requestGate,
}: {
  request: CanonicalizationRequestContext;
  backendBaseUrl: string;
  frontendBaseUrl: string;
  checkpointFilePath: string;
  requestGate?: ReturnType<typeof createCanonicalizationRequestGate>;
}): CanonicalizationApi => {
  const origin = new URL(frontendBaseUrl).origin;
  const restUrl = (path: string) =>
    new URL(`/rest/${path}`, backendBaseUrl).toString();
  const headers = { Origin: origin };
  const pacedRequest = requestGate ?? createCanonicalizationRequestGate();

  return {
    async listMetadataObjects() {
      const objects: MetadataObject[] = [];
      let cursor: string | undefined;
      do {
        const query = new URLSearchParams({ limit: '100' });
        if (cursor) query.set('starting_after', cursor);
        const response = await pacedRequest(() =>
          request.get(`${restUrl('metadata/objects')}?${query.toString()}`, {
            headers,
          }),
        );
        await assertSuccessfulResponse(response, 'List metadata objects');
        const body = await disposeAfterJson<MetadataListResponse>(
          response,
          'Metadata list',
        );
        const pageObjects = Array.isArray(body.data)
          ? body.data
          : body.data?.objects;
        if (!Array.isArray(pageObjects)) {
          throw new Error('Metadata list response has an invalid shape');
        }
        objects.push(...pageObjects);
        cursor = body.pageInfo?.hasNextPage
          ? (body.pageInfo.endCursor ?? undefined)
          : undefined;
        if (body.pageInfo?.hasNextPage && !cursor) {
          throw new Error('Metadata pagination omitted its cursor');
        }
      } while (cursor);

      if (
        objects.some((object) =>
          object.fields.some(
            (field) => field.type === 'RELATION' && !relationTargetId(field),
          ),
        )
      ) {
        const response = await pacedRequest(() =>
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
    },

    async listAll(objectPlural: keyof CanonicalizationSnapshot) {
      const records: CrmRecord[] = [];
      let cursor: string | undefined;
      do {
        const query = new URLSearchParams({ limit: '100', depth: '0' });
        if (cursor) query.set('starting_after', cursor);
        const response = await pacedRequest(() =>
          request.get(`${restUrl(objectPlural)}?${query.toString()}`, {
            headers,
          }),
        );
        await assertSuccessfulResponse(response, `List ${objectPlural}`);
        const body = await disposeAfterJson<RecordListResponse>(
          response,
          `${objectPlural} list`,
        );
        const pageRecords = body.data?.[objectPlural];
        if (!Array.isArray(pageRecords)) {
          throw new Error(`${objectPlural} list response has an invalid shape`);
        }
        records.push(...(pageRecords as CrmRecord[]));
        cursor = body.pageInfo?.hasNextPage
          ? (body.pageInfo.endCursor ?? undefined)
          : undefined;
        if (body.pageInfo?.hasNextPage && !cursor) {
          throw new Error(`${objectPlural} pagination omitted its cursor`);
        }
      } while (cursor);

      return records;
    },

    async renameMetadataField(fieldId, name, label) {
      const data = { name, label, isLabelSyncedWithName: false };
      assertBodyWithinLimit('metadata field rename', data);
      const response = await pacedRequest(() =>
        request.patch(
          restUrl(`metadata/fields/${encodeURIComponent(fieldId)}`),
          { headers, data },
        ),
      );
      await assertSuccessfulResponse(response, 'Rename metadata field');
      await response.dispose();
    },

    async createMetadataField(input: MetadataCreate) {
      const payload: Record<string, unknown> = {
        objectMetadataId: input.objectMetadataId,
        type: input.type,
        name: input.name,
        label: input.label,
        isLabelSyncedWithName: false,
      };
      if (input.type === 'RELATION') {
        if (
          !input.relationTargetObjectMetadataId ||
          !input.targetFieldLabel ||
          !input.targetFieldIcon ||
          !input.relationType
        ) {
          throw new Error('Relation metadata payload is incomplete');
        }
        payload.relationCreationPayload = {
          targetObjectMetadataId: input.relationTargetObjectMetadataId,
          targetFieldLabel: input.targetFieldLabel,
          targetFieldIcon: input.targetFieldIcon,
          type: input.relationType,
        };
      }
      assertBodyWithinLimit('metadata field create', payload);
      const response = await pacedRequest(() =>
        request.post(restUrl('metadata/fields'), { headers, data: payload }),
      );
      await assertSuccessfulResponse(response, 'Create metadata field');
      await response.dispose();
    },

    async upsertBatch(objectPlural, records) {
      if (records.length < 1 || records.length > 100) {
        throw new Error(
          'Canonicalization batch requires 1 through 100 records',
        );
      }
      assertBodyWithinLimit(`${objectPlural} batch`, records);
      const response = await pacedRequest(() =>
        request.post(
          `${restUrl(`batch/${objectPlural}`)}?upsert=true&depth=0`,
          { headers, data: records },
        ),
      );
      await assertSuccessfulResponse(response, `Upsert ${objectPlural}`);
      await response.dispose();
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
        throw new Error('Canonicalization checkpoint is invalid JSON');
      }
      const checkpoint = assertCheckpoint(envelope.checkpoint);
      if (envelope.sha256 !== checkpointHash(checkpoint)) {
        throw new Error(
          'Canonicalization checkpoint failed its integrity check',
        );
      }

      return checkpoint;
    },

    async writeCheckpoint(checkpoint) {
      assertCheckpoint(checkpoint);
      const temporaryPath = `${checkpointFilePath}.tmp`;
      const payload = JSON.stringify(
        { sha256: checkpointHash(checkpoint), checkpoint },
        null,
        2,
      );
      await mkdir(dirname(checkpointFilePath), { recursive: true });
      await writeFile(temporaryPath, `${payload}\n`, 'utf8');
      await rename(temporaryPath, checkpointFilePath);
    },
  };
};

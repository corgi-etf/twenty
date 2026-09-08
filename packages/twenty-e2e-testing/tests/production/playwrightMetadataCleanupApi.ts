import { type APIResponse, type Page } from '@playwright/test';

import {
  type MetadataCleanupApi,
  type MetadataObject,
  type WorkspaceRecord,
} from './fetchMetadataCleanup';

type MetadataListResponse = {
  data?: MetadataObject[] | { objects?: MetadataObject[] };
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};

type RecordListResponse = {
  data?: Record<string, unknown>;
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};

const assertSuccessfulResponse = async (
  response: APIResponse,
  operation: string,
  allowedStatuses: number[] = [],
): Promise<void> => {
  if (!response.ok() && !allowedStatuses.includes(response.status())) {
    throw new Error(`${operation} failed with HTTP ${response.status()}`);
  }
};

export const createPlaywrightMetadataCleanupApi = ({
  page,
  backendBaseUrl,
  frontendBaseUrl,
}: {
  page: Page;
  backendBaseUrl: string;
  frontendBaseUrl: string;
}): MetadataCleanupApi => {
  const origin = new URL(frontendBaseUrl).origin;
  const restUrl = (path: string) =>
    new URL(`/rest/${path}`, backendBaseUrl).toString();
  const headers = { Origin: origin };

  return {
    async listMetadataObjects() {
      const objects: MetadataObject[] = [];
      let cursor: string | undefined;

      do {
        const query = new URLSearchParams({ limit: '100' });
        if (cursor) query.set('starting_after', cursor);
        const response = await page.request.get(
          `${restUrl('metadata/objects')}?${query.toString()}`,
          { headers },
        );
        await assertSuccessfulResponse(response, 'List metadata objects');
        const body = (await response.json()) as MetadataListResponse;
        const pageObjects = Array.isArray(body.data)
          ? body.data
          : (body.data?.objects ?? []);

        objects.push(...pageObjects);
        cursor = body.pageInfo?.hasNextPage
          ? (body.pageInfo.endCursor ?? undefined)
          : undefined;
        if (body.pageInfo?.hasNextPage && !cursor) {
          throw new Error('Metadata pagination omitted its end cursor');
        }
      } while (cursor);

      return objects;
    },

    async listRecords(objectNamePlural) {
      const records: WorkspaceRecord[] = [];
      let cursor: string | undefined;

      do {
        const query = new URLSearchParams({ limit: '100', depth: '0' });
        if (cursor) query.set('starting_after', cursor);
        const response = await page.request.get(
          `${restUrl(objectNamePlural)}?${query.toString()}`,
          { headers },
        );
        await assertSuccessfulResponse(
          response,
          `List ${objectNamePlural} records`,
        );
        const body = (await response.json()) as RecordListResponse;
        const pageRecords = body.data?.[objectNamePlural];
        if (!Array.isArray(pageRecords)) {
          throw new Error(
            `List ${objectNamePlural} response omitted data.${objectNamePlural}`,
          );
        }
        records.push(...(pageRecords as WorkspaceRecord[]));
        cursor = body.pageInfo?.hasNextPage
          ? (body.pageInfo.endCursor ?? undefined)
          : undefined;
        if (body.pageInfo?.hasNextPage && !cursor) {
          throw new Error(
            `${objectNamePlural} pagination omitted its end cursor`,
          );
        }
      } while (cursor);

      return records;
    },

    async deleteMetadataObject(id) {
      const response = await page.request.delete(
        restUrl(`metadata/objects/${id}`),
        { headers },
      );
      await assertSuccessfulResponse(response, 'Delete metadata object', [404]);
    },

    async deleteMetadataField(id) {
      const response = await page.request.delete(
        restUrl(`metadata/fields/${id}`),
        { headers },
      );
      await assertSuccessfulResponse(response, 'Delete metadata field', [404]);
    },

    async updateMetadataField(id, update) {
      const response = await page.request.patch(
        restUrl(`metadata/fields/${id}`),
        {
          headers,
          data: { ...update, isLabelSyncedWithName: false },
        },
      );
      await assertSuccessfulResponse(response, 'Update metadata field');
    },
  };
};

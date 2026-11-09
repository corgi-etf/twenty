import { createHash } from 'node:crypto';

import {
  APPROVED_EXPORT_ENDPOINT,
  EXPECTED_MANIFEST_SHA256,
  EXPORT_ACKNOWLEDGEMENT,
} from './constants.ts';
import type { DownloadedSourceFile } from './importer.ts';
import {
  assertExportManifest,
  type ExportManifestContract,
  type ValidatedExportManifest,
} from './manifest.ts';

export type SecretMasker = (value: string) => void;

export type GitHubOidcEnvironment = {
  requestUrl: string;
  requestToken: string;
};

export const requestGitHubOidcToken = async (
  fetcher: typeof fetch,
  environment: GitHubOidcEnvironment,
  maskSecret: SecretMasker,
): Promise<string> => {
  let requestUrl: URL;
  try {
    requestUrl = new URL(environment.requestUrl);
  } catch {
    throw new Error('GitHub OIDC environment is invalid');
  }
  if (
    requestUrl.protocol !== 'https:' ||
    !requestUrl.hostname.endsWith('.actions.githubusercontent.com') ||
    !environment.requestToken ||
    environment.requestToken.length > 16_384
  ) {
    throw new Error('GitHub OIDC environment is invalid');
  }
  requestUrl.searchParams.set('audience', APPROVED_EXPORT_ENDPOINT);
  maskSecret(environment.requestToken);
  let response: Response;
  try {
    response = await fetcher(requestUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${environment.requestToken}`,
      },
      redirect: 'error',
    });
  } catch {
    throw new Error('GitHub OIDC request failed');
  }
  const body = await readJson(response, 32 * 1024, 'GitHub OIDC request');
  if (!isRecord(body) || typeof body.value !== 'string') {
    throw new Error('GitHub OIDC response is invalid');
  }
  const token = body.value.trim();
  if (
    token.length < 16 ||
    token.length > 16_384 ||
    token.split('.').length !== 3
  ) {
    throw new Error('GitHub OIDC response is invalid');
  }
  maskSecret(token);

  return token;
};

export const exchangeOidcForExport = async (
  fetcher: typeof fetch,
  oidcToken: string,
  maskSecret: SecretMasker,
  now = new Date(),
  contract?: ExportManifestContract,
): Promise<ValidatedExportManifest> => {
  if (!oidcToken || oidcToken.length > 16_384) {
    throw new Error('GitHub OIDC token is invalid');
  }
  maskSecret(oidcToken);
  let response: Response;
  try {
    response = await fetcher(APPROVED_EXPORT_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${oidcToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        acknowledgement: EXPORT_ACKNOWLEDGEMENT,
        expectedManifestSha256:
          contract?.manifestSha256 ?? EXPECTED_MANIFEST_SHA256,
      }),
      redirect: 'error',
    });
  } catch {
    throw new Error('Tony 13F export exchange failed');
  }
  const body = await readJson(response, 2 * 1024 * 1024, 'Tony 13F export');
  if (isRecord(body) && Array.isArray(body.files)) {
    for (const file of body.files) {
      if (
        isRecord(file) &&
        typeof file.downloadUrl === 'string' &&
        file.downloadUrl.length > 0 &&
        file.downloadUrl.length <= 8192
      ) {
        maskSecret(file.downloadUrl);
      }
    }
  }

  return assertExportManifest(body, { now, ...(contract ? { contract } : {}) });
};

export const downloadExportFiles = async (
  fetcher: typeof fetch,
  manifest: ValidatedExportManifest,
): Promise<DownloadedSourceFile[]> => {
  const output = new Array<DownloadedSourceFile>(manifest.files.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < manifest.files.length) {
      const index = nextIndex;
      nextIndex += 1;
      const file = manifest.files[index]!;
      let response: Response;
      try {
        response = await fetcher(file.downloadUrl, {
          method: 'GET',
          redirect: 'error',
        });
      } catch {
        throw new Error('Tony 13F source download failed');
      }
      if (!response.ok) {
        throw new Error('Tony 13F source download failed');
      }
      const declaredLength = response.headers.get('content-length');
      if (
        declaredLength !== null &&
        Number(declaredLength) !== file.sizeBytes
      ) {
        throw new Error('Tony 13F source download verification failed');
      }
      const bytes = await readExactBytes(response, file.sizeBytes);
      const { downloadUrl: _downloadUrl, ...sourceWithoutDownloadUrl } = file;
      output[index] = {
        ...sourceWithoutDownloadUrl,
        bytes,
        contentSha256: createHash('sha256').update(bytes).digest('hex'),
      };
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, manifest.files.length) }, async () =>
      worker(),
    ),
  );
  if (
    output.some((file) => !file) ||
    output.reduce((sum, file) => sum + file.sizeBytes, 0) !==
      manifest.totalBytes
  ) {
    throw new Error('Tony 13F source download verification failed');
  }

  return output;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readJson = async (
  response: Response,
  maximumBytes: number,
  operation: string,
): Promise<unknown> => {
  if (!response.ok) throw new Error(`${operation} failed`);
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > maximumBytes) {
    throw new Error(`${operation} response is too large`);
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new Error(`${operation} response is invalid`);
  }
  if (Buffer.byteLength(text, 'utf8') > maximumBytes) {
    throw new Error(`${operation} response is too large`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${operation} response is invalid`);
  }
};

const readExactBytes = async (
  response: Response,
  expectedBytes: number,
): Promise<Uint8Array> => {
  if (!response.body) {
    throw new Error('Tony 13F source download verification failed');
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > expectedBytes) {
        throw new Error('Tony 13F source download verification failed');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (totalBytes !== expectedBytes) {
    throw new Error('Tony 13F source download verification failed');
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
};

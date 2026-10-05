import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import {
  assertWorkspaceConfigTenant,
  createWorkspaceConfigRequestGate,
  preflightWorkspaceConfigCheckpoint,
  WORKSPACE_CONFIG_APPROVED_ORIGIN,
  type WorkspaceConfigRequestContext,
} from './twenty-api.ts';

export const connectExperienceCli = async () => {
  const origin =
    process.env.CORGI_CRM_API_URL ?? WORKSPACE_CONFIG_APPROVED_ORIGIN;
  if (origin !== WORKSPACE_CONFIG_APPROVED_ORIGIN)
    throw new Error('Unapproved CRM origin');
  const token =
    process.env.CORGI_CRM_ACCESS_TOKEN ?? process.env.CORGI_CRM_API_KEY;
  if (!token)
    throw new Error(
      'CORGI_CRM_ACCESS_TOKEN must contain an authenticated admin session token; ordinary workspace API keys cannot satisfy currentUser preflight',
    );
  const send = async (
    method: string,
    url: string,
    options: { headers: Record<string, string>; data?: unknown },
  ) => {
    if (new URL(url).origin !== origin)
      throw new Error('Cross-origin CRM request blocked');
    const response = await fetch(url, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(options.data === undefined
        ? {}
        : { body: JSON.stringify(options.data) }),
    });
    return {
      ok: () => response.ok,
      status: () => response.status,
      headers: () => Object.fromEntries(response.headers),
      json: () => response.json(),
      dispose: async () => {
        if (!response.bodyUsed) await response.body?.cancel();
      },
    };
  };
  const request: WorkspaceConfigRequestContext = {
    get: (url, options) => send('GET', url, options),
    post: (url, options) => send('POST', url, options),
    patch: (url, options) => send('PATCH', url, options),
  };
  const requestGate = createWorkspaceConfigRequestGate();
  const { workspaceId } = await assertWorkspaceConfigTenant({
    request,
    origin,
    requestGate,
  });
  return { origin, request, requestGate, workspaceId };
};
export const protectedArtifactPath = (path: string) =>
  preflightWorkspaceConfigCheckpoint({
    runnerTemp: process.env.RUNNER_TEMP ?? '',
    checkpointPath: path,
  });
export const writeNewArtifact = async (path: string, value: unknown) => {
  const file = await open(
    await protectedArtifactPath(path),
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await file.sync();
  } finally {
    await file.close();
  }
};
export const readArtifact = async <T>(path: string): Promise<T> => {
  const file = await open(
    await protectedArtifactPath(path),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    return JSON.parse(await file.readFile('utf8'));
  } finally {
    await file.close();
  }
};
export const openDurableJournal = async <T>(path: string) => {
  const file = await open(
    await protectedArtifactPath(path),
    constants.O_CREAT |
      constants.O_APPEND |
      constants.O_RDWR |
      constants.O_NOFOLLOW,
    0o600,
  );
  const text = await file.readFile('utf8');
  if (text && !text.endsWith('\n')) {
    await file.close();
    throw new Error('Journal has an incomplete line; review before continuing');
  }
  let entries: T[];
  try {
    entries = text.trim()
      ? text
          .trimEnd()
          .split('\n')
          .map((line) => JSON.parse(line))
      : [];
  } catch {
    await file.close();
    throw new Error('Journal is invalid; review before continuing');
  }
  return {
    entries,
    append: async (entry: T) => {
      await file.write(`${JSON.stringify(entry)}\n`);
      await file.sync();
    },
    close: () => file.close(),
  };
};

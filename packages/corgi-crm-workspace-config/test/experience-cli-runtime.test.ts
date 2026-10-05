import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtemp,
  rm,
  readFile,
  stat,
  writeFile,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  connectExperienceCli,
  openDurableJournal,
  readArtifact,
  writeNewArtifact,
} from '../src/experience-cli-runtime.ts';
test('writes private new manifests and fsynced append journals without overwriting review artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'crm-experience-test-'));
  const previous = process.env.RUNNER_TEMP;
  process.env.RUNNER_TEMP = directory;
  try {
    const path = join(directory, 'preview.json');
    await writeNewArtifact(path, { reviewed: true });
    assert.deepEqual(await readArtifact(path), { reviewed: true });
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    await assert.rejects(writeNewArtifact(path, {}), /exist/i);
    const journalPath = join(directory, 'journal.jsonl');
    const journal = await openDurableJournal<{ kind: string }>(journalPath);
    await journal.append({ kind: 'intent' });
    await journal.append({ kind: 'confirmed' });
    await journal.close();
    const resumed = await openDurableJournal<{ kind: string }>(journalPath);
    assert.deepEqual(resumed.entries, [
      { kind: 'intent' },
      { kind: 'confirmed' },
    ]);
    await resumed.close();
    assert.equal((await stat(journalPath)).mode & 0o777, 0o600);
    await writeFile(join(directory, 'truncated.jsonl'), '{"kind":', {
      mode: 0o600,
    });
    await assert.rejects(
      openDurableJournal(join(directory, 'truncated.jsonl')),
      /incomplete/,
    );
    await symlink(path, join(directory, 'symlink.json'));
    await assert.rejects(
      readArtifact(join(directory, 'symlink.json')),
      /invalid type/,
    );
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
      reviewed: true,
    });
  } finally {
    if (previous === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
test('prefers the admin access token and retains effective-user preflight for compatibility aliases', async () => {
  const originalFetch = globalThis.fetch;
  const previous = {
    access: process.env.CORGI_CRM_ACCESS_TOKEN,
    key: process.env.CORGI_CRM_API_KEY,
    url: process.env.CORGI_CRM_API_URL,
  };
  process.env.CORGI_CRM_ACCESS_TOKEN = 'admin-session-token';
  process.env.CORGI_CRM_API_KEY = 'ordinary-workspace-key';
  process.env.CORGI_CRM_API_URL = 'https://crm.corgiinvest.com';
  const id = '11111111-1111-4111-8111-111111111111';
  let effectiveUser = true;
  const authorization: string[] = [];
  globalThis.fetch = async (_url, options) => {
    authorization.push(
      (options?.headers as Record<string, string>).Authorization,
    );
    return new Response(
      JSON.stringify({
        data: {
          currentUser: effectiveUser
            ? {
                id,
                currentWorkspace: {
                  id,
                  displayName: 'Corgi ETF',
                  activationStatus: 'ACTIVE',
                },
                currentUserWorkspace: {
                  id,
                  userId: id,
                  deletedAt: null,
                  permissionFlags: ['DATA_MODEL'],
                  isImpersonating: false,
                },
              }
            : null,
        },
      }),
      { status: 200 },
    );
  };
  try {
    assert.equal((await connectExperienceCli()).workspaceId, id);
    assert.deepEqual(authorization, ['Bearer admin-session-token']);
    delete process.env.CORGI_CRM_ACCESS_TOKEN;
    effectiveUser = false;
    await assert.rejects(connectExperienceCli(), /tenant is not approved/);
    assert.equal(authorization[1], 'Bearer ordinary-workspace-key');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of [
      ['CORGI_CRM_ACCESS_TOKEN', previous.access],
      ['CORGI_CRM_API_KEY', previous.key],
      ['CORGI_CRM_API_URL', previous.url],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

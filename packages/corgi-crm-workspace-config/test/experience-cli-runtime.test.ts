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

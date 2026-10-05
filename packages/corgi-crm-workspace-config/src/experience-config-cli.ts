import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { open, unlink } from 'node:fs/promises';
import { ownershipManifestDigest } from './company-ownership-backfill.ts';
import {
  buildExperienceConfigManifest,
  applyExperienceConfigManifest,
  type ExperienceConfigManifest,
  type ExperienceConfigJournalEntry,
} from './experience-config.ts';
import { createTwentyWorkspaceConfigApi } from './twenty-api.ts';
import {
  connectExperienceCli,
  protectedArtifactPath,
  writeNewArtifact,
  readArtifact,
  openDurableJournal,
} from './experience-cli-runtime.ts';
export const runExperienceConfigCli = async () => {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean' },
      help: { type: 'boolean' },
      manifest: { type: 'string' },
      'reviewed-digest': { type: 'string' },
      journal: { type: 'string' },
    },
  });
  if (values.help) {
    console.log(
      'Preview: --manifest <RUNNER_TEMP/new-preview.json>\nApply: --apply --manifest <reviewed.json> --reviewed-digest <sha256> --journal <RUNNER_TEMP/new-journal.jsonl>\nRequires admin CORGI_CRM_ACCESS_TOKEN and RUNNER_TEMP. Metadata then layout each require a new reviewed preview. No company/territory data writes.',
    );
    return;
  }
  if (!values.manifest) throw new Error('--manifest is required');
  await protectedArtifactPath(values.manifest);
  if (values.apply && (!values['reviewed-digest'] || !values.journal))
    throw new Error('Apply requires reviewed digest and journal');
  const connection = await connectExperienceCli();
  const api = createTwentyWorkspaceConfigApi({
    ...connection,
    backendBaseUrl: connection.origin,
    frontendBaseUrl: connection.origin,
    checkpointFilePath: '',
  });
  if (!values.apply) {
    const manifest = buildExperienceConfigManifest(
      await api.listWorkspaceConfigSnapshot(),
      connection.workspaceId,
    );
    await writeNewArtifact(values.manifest, manifest);
    console.log(
      JSON.stringify({
        mode: 'preview',
        phase: manifest.phase,
        operations: manifest.operations.length,
        digest: ownershipManifestDigest(manifest),
        manifest: values.manifest,
      }),
    );
    return;
  }
  const manifest = await readArtifact<ExperienceConfigManifest>(
    values.manifest,
  );
  const journalPath = await protectedArtifactPath(values.journal!);
  const lockPath = await protectedArtifactPath(`${journalPath}.lock`);
  const lock = await open(lockPath, 'wx', 0o600);
  try {
    const journal =
      await openDurableJournal<ExperienceConfigJournalEntry>(journalPath);
    try {
      if (journal.entries.length)
        throw new Error(
          'Existing configuration journal requires a fresh preview; do not replay uncertain writes',
        );
      const result = await applyExperienceConfigManifest({
        api,
        manifest,
        reviewedDigest: values['reviewed-digest']!,
        workspaceId: connection.workspaceId,
        appendJournal: journal.append,
        updateObjectOpenRecordIn: async (id) => {
          const response = await connection.requestGate(() =>
            connection.request.patch(
              `${connection.origin}/rest/metadata/objects/${encodeURIComponent(id)}`,
              {
                headers: { Origin: connection.origin },
                data: { openRecordIn: 'RECORD_PAGE' },
              },
            ),
          );
          try {
            if (!response.ok())
              throw new Error(
                `Object profile default update failed: HTTP ${response.status()}`,
              );
          } finally {
            await response.dispose();
          }
        },
      });
      console.log(
        JSON.stringify({ mode: 'applied', ...result, journal: journalPath }),
      );
    } finally {
      await journal.close();
    }
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runExperienceConfigCli().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Experience configuration failed',
    );
    process.exitCode = 1;
  });

import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { unlink, open } from 'node:fs/promises';
import {
  applyOwnershipManifest,
  buildOwnershipManifest,
  ownershipManifestDigest,
  type OwnershipManifest,
  type OwnershipJournalEntry,
} from './company-ownership-backfill.ts';
import { createOwnershipBackfillApi } from './company-ownership-api.ts';
import {
  connectExperienceCli,
  protectedArtifactPath,
  writeNewArtifact,
  readArtifact,
  openDurableJournal,
} from './experience-cli-runtime.ts';
export const runOwnershipCli = async () => {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean' },
      help: { type: 'boolean' },
      manifest: { type: 'string' },
      'reviewed-digest': { type: 'string' },
      'expected-company-count': { type: 'string' },
      journal: { type: 'string' },
    },
  });
  if (values.help) {
    console.log(
      'Dry run: --manifest <RUNNER_TEMP/path.json> --expected-company-count <n>\nApply: --apply --manifest <reviewed.json> --reviewed-digest <sha256> --journal <RUNNER_TEMP/path.jsonl>\nRequires admin CORGI_CRM_ACCESS_TOKEN and RUNNER_TEMP. Writes only companyOwnership rows. Guarded comparisons are not atomic.',
    );
    return;
  }
  if (!values.manifest) throw new Error('--manifest is required');
  await protectedArtifactPath(values.manifest);
  if (values.apply && (!values['reviewed-digest'] || !values.journal))
    throw new Error('Apply requires reviewed digest and journal');
  const connection = await connectExperienceCli();
  const api = createOwnershipBackfillApi(connection);
  if (!values.apply) {
    const expectedCompanyCount = Number(values['expected-company-count']);
    if (!Number.isSafeInteger(expectedCompanyCount) || expectedCompanyCount < 1)
      throw new Error(
        'Dry run requires exact positive --expected-company-count',
      );
    const manifest = buildOwnershipManifest({
      snapshot: await api.readSnapshot(),
      workspaceId: connection.workspaceId,
      expectedCompanyCount,
    });
    await writeNewArtifact(values.manifest, manifest);
    console.log(
      JSON.stringify({
        mode: 'preview',
        manifest: values.manifest,
        digest: ownershipManifestDigest(manifest),
        companies: manifest.preview.companyCount,
        additions: manifest.preview.additions.length,
        manualReview: manifest.preview.review.filter(
          ({ severity }) => severity === 'blocking',
        ).length,
        informational: manifest.preview.review.filter(
          ({ severity }) => severity === 'informational',
        ).length,
      }),
    );
    return;
  }
  const manifest = await readArtifact<OwnershipManifest>(values.manifest);
  const journalPath = await protectedArtifactPath(values.journal!);
  const lockPath = await protectedArtifactPath(`${journalPath}.lock`);
  const lock = await open(lockPath, 'wx', 0o600);
  try {
    const journal =
      await openDurableJournal<OwnershipJournalEntry>(journalPath);
    try {
      const result = await applyOwnershipManifest({
        api,
        manifest,
        reviewedDigest: values['reviewed-digest']!,
        workspaceId: connection.workspaceId,
        journal: journal.entries,
        appendJournal: journal.append,
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
  runOwnershipCli().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Ownership operation failed',
    );
    process.exitCode = 1;
  });

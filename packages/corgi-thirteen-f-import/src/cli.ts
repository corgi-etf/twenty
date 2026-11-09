import { createHash } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { APPROVED_CRM_ORIGIN } from './constants.ts';
import { runConvergentImport } from './importer.ts';
import {
  downloadExportFiles,
  exchangeOidcForExport,
  requestGitHubOidcToken,
} from './transfer.ts';
import { TwentyImportClient } from './twenty-client.ts';

type CredentialFile = { token?: unknown };

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);

  return value;
};

const maskSecret = (value: string): void => {
  const escaped = value
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
  process.stdout.write(`::add-mask::${escaped}\n`);
};

const aggregateContentSha256 = (
  files: Array<{
    id: string;
    sourceVersionId: string;
    sizeBytes: number;
    contentSha256: string;
  }>,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify(
        files
          .map(({ id, sourceVersionId, sizeBytes, contentSha256 }) => ({
            id,
            sourceVersionId,
            sizeBytes,
            contentSha256,
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      ),
    )
    .digest('hex');

export const runImportCli = async (): Promise<void> => {
  if (
    requiredEnvironment('GITHUB_REPOSITORY') !== 'Corgi-ETF/twenty' ||
    requiredEnvironment('GITHUB_REF') !== 'refs/heads/main' ||
    requiredEnvironment('GITHUB_EVENT_NAME') !== 'workflow_dispatch'
  ) {
    throw new Error('The 13F import is restricted to the manual main workflow');
  }
  const keyPath = requiredEnvironment('CORGI_13F_IMPORT_KEY_PATH');
  const resultPath = requiredEnvironment('CORGI_13F_IMPORT_RESULT_PATH');
  const credential = JSON.parse(
    await readFile(keyPath, 'utf8'),
  ) as CredentialFile;
  if (typeof credential.token !== 'string' || !credential.token.trim()) {
    throw new Error('The 13F import credential lease is incomplete');
  }
  const crmToken = credential.token.trim();
  maskSecret(crmToken);
  const oidcToken = await requestGitHubOidcToken(
    fetch,
    {
      requestUrl: requiredEnvironment('ACTIONS_ID_TOKEN_REQUEST_URL'),
      requestToken: requiredEnvironment('ACTIONS_ID_TOKEN_REQUEST_TOKEN'),
    },
    maskSecret,
  );
  const manifest = await exchangeOidcForExport(fetch, oidcToken, maskSecret);
  const sources = await downloadExportFiles(fetch, manifest);
  const api = new TwentyImportClient({
    origin: APPROVED_CRM_ORIGIN,
    token: crmToken,
  });
  const result = await runConvergentImport(api, sources);
  const receipt = {
    schemaVersion: 1,
    manifestSha256: manifest.manifestSha256,
    aggregateContentSha256: aggregateContentSha256(sources),
    sourceFiles: manifest.returned,
    sourceBytes: manifest.totalBytes,
    ...result,
  };
  await writeFile(resultPath, JSON.stringify(receipt), { mode: 0o600 });
  await chmod(resultPath, 0o600);
  process.stdout.write(
    `Verified ${result.verified} Corgi 13F records from ${manifest.returned} approved files.\n`,
  );
};

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  runImportCli().catch(() => {
    process.stderr.write(
      'Corgi 13F import failed; no credentials or URLs were logged.\n',
    );
    process.exitCode = 1;
  });
}

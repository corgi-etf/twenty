import { createHash } from 'node:crypto';
import { chmod, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

import { APPROVED_CRM_ORIGIN, MAX_SOURCE_FILE_BYTES } from './constants.ts';
import { runConvergentImport, type DownloadedSourceFile } from './importer.ts';
import { attachmentSources, stableUuid } from './holdings-parser.ts';
import { runHoldingsImport } from './holdings-importer.ts';
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
    sourceNodeId: string;
    sourceVersionId: string;
    bytes: Uint8Array;
    contentSha256: string;
  }>,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify(
        files
          .map(({ sourceNodeId, sourceVersionId, bytes, contentSha256 }) => ({
            sourceNodeId,
            sourceVersionId,
            sizeBytes: bytes.byteLength,
            contentSha256,
          }))
          .sort((left, right) =>
            left.sourceNodeId.localeCompare(right.sourceNodeId),
          ),
      ),
    )
    .digest('hex');

const MASTER_WORKBOOK_PATTERN = /^competitor holders \(13f\).*\.xlsx$/i;
const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const localMasterSource = async (
  filePath: string,
): Promise<DownloadedSourceFile> => {
  if (!isAbsolute(filePath)) {
    throw new Error('CORGI_13F_MASTER_WORKBOOK_PATH must be absolute');
  }
  const name = basename(filePath);
  if (!MASTER_WORKBOOK_PATTERN.test(name)) {
    throw new Error('Local 13F master workbook has an unsupported file name');
  }
  const fileStat = await stat(filePath);
  if (
    !fileStat.isFile() ||
    fileStat.size < 1 ||
    fileStat.size > MAX_SOURCE_FILE_BYTES
  ) {
    throw new Error('Local 13F master workbook has an invalid file size');
  }
  const bytes = new Uint8Array(await readFile(filePath));
  if (bytes.byteLength !== fileStat.size) {
    throw new Error('Local 13F master workbook changed while it was read');
  }
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');

  return {
    id: stableUuid('localThirteenFMaster', name.toLowerCase()),
    name,
    contentType: XLSX_CONTENT_TYPE,
    sizeBytes: bytes.byteLength,
    sourceVersionId: contentSha256,
    updatedAt: fileStat.mtime.toISOString(),
    ticker: null,
    bytes,
    contentSha256,
    sourceDriveId: null,
    sourceLink: null,
  };
};

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
  const api = new TwentyImportClient({
    origin: APPROVED_CRM_ORIGIN,
    token: crmToken,
  });
  const masterWorkbookPath = process.env.CORGI_13F_MASTER_WORKBOOK_PATH?.trim();
  if (masterWorkbookPath) {
    const masterSource = await localMasterSource(masterWorkbookPath);
    await runConvergentImport(api, [masterSource]);
  }
  const filings = await api.listFilings();
  const sources = await attachmentSources(filings, (file) =>
    api.downloadAttachedFile(file),
  );
  const result = await runHoldingsImport(api, sources);
  const receipt = {
    ...result,
    aggregateContentSha256: aggregateContentSha256(sources),
    sourceBytes: sources.reduce((sum, { bytes }) => sum + bytes.byteLength, 0),
  };
  await writeFile(resultPath, JSON.stringify(receipt), { mode: 0o600 });
  await chmod(resultPath, 0o600);
  process.stdout.write(
    `Imported ${result.holdingRecords} normalized holdings from ${result.sourceFiles} CRM attachments.\n`,
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

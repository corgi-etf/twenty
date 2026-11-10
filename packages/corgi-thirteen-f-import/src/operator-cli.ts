import { timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { BackendIngestionClient } from './backend-client.ts';
import { APPROVED_CRM_ORIGIN } from './constants.ts';
import {
  runLegacyCrmMigration,
  type LegacyMigrationReceipt,
} from './migration-runner.ts';
import { TwentyImportClient } from './twenty-client.ts';

const APPROVED_BACKEND_ORIGIN = 'https://admin.corgiinvest.com';
const MAX_CREDENTIAL_FILE_BYTES = 16 * 1024;
const MAX_CREDENTIAL_TOKEN_BYTES = 12 * 1024;
const CREDENTIAL_FILE_MODE = 0o600;

type ClientOptions = { origin: string; token: string };
type MigrationOptions = Parameters<typeof runLegacyCrmMigration>[0];
type CrmReader = MigrationOptions['crm'];
type BackendWriter = MigrationOptions['backend'];
type CredentialIdentity = { device: number; inode: number };

export type OperatorCliDependencies = {
  createCrmClient?(options: ClientOptions): CrmReader;
  createBackendClient?(options: ClientOptions): BackendWriter;
  runMigration?: typeof runLegacyCrmMigration;
  writeOutput?(value: string): void;
  writeError?(value: string): void;
};

type OperatorArguments = {
  crmCredentialFile: string;
  backendCredentialFile: string;
  receiptFile: string;
};

type LoadedCredential = CredentialIdentity & { token: string };

const usageError = (): Error =>
  new Error(
    'Usage: operator-cli.ts --crm-credential-file <path> --backend-credential-file <path> --receipt-file <path>',
  );

const parseArguments = (arguments_: readonly string[]): OperatorArguments => {
  if (arguments_.length !== 6) throw usageError();
  const parsed = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!flag || !value?.trim() || value.startsWith('--') || parsed.has(flag)) {
      throw usageError();
    }
    parsed.set(flag, value);
  }
  const crmCredentialFile = parsed.get('--crm-credential-file');
  const backendCredentialFile = parsed.get('--backend-credential-file');
  const receiptFile = parsed.get('--receipt-file');
  if (
    !crmCredentialFile ||
    !backendCredentialFile ||
    !receiptFile ||
    parsed.size !== 3
  ) {
    throw usageError();
  }

  return { crmCredentialFile, backendCredentialFile, receiptFile };
};

const invalidCredentialFile = (label: string): Error =>
  new Error(`${label} credential file is invalid`);

const loadCredential = async (options: {
  path: string;
  key: 'crmReadToken' | 'backendIngestToken';
  label: 'CRM read' | 'Backend ingest';
}): Promise<LoadedCredential> => {
  let handle;
  try {
    handle = await open(
      options.path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch {
    throw invalidCredentialFile(options.label);
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw invalidCredentialFile(options.label);
    if ((metadata.mode & 0o777) !== CREDENTIAL_FILE_MODE) {
      throw new Error(`${options.label} credential file must use mode 0600`);
    }
    if (metadata.size < 2 || metadata.size > MAX_CREDENTIAL_FILE_BYTES) {
      throw invalidCredentialFile(options.label);
    }
    const body = await handle.readFile({ encoding: 'utf8' });
    if (Buffer.byteLength(body, 'utf8') > MAX_CREDENTIAL_FILE_BYTES) {
      throw invalidCredentialFile(options.label);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body) as unknown;
    } catch {
      throw invalidCredentialFile(options.label);
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 1 ||
      !Object.prototype.hasOwnProperty.call(parsed, options.key)
    ) {
      throw invalidCredentialFile(options.label);
    }
    const token = (parsed as Record<string, unknown>)[options.key];
    if (
      typeof token !== 'string' ||
      token !== token.trim() ||
      !/^[\x21-\x7E]+$/.test(token) ||
      Buffer.byteLength(token, 'utf8') > MAX_CREDENTIAL_TOKEN_BYTES
    ) {
      throw invalidCredentialFile(options.label);
    }

    return { token, device: metadata.dev, inode: metadata.ino };
  } finally {
    await handle.close();
  }
};

const sameCredential = (
  left: CredentialIdentity,
  right: CredentialIdentity,
): boolean => left.device === right.device && left.inode === right.inode;

const sameToken = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
};

const writeReceipt = async (
  path: string,
  receipt: LegacyMigrationReceipt,
  credentials: readonly CredentialIdentity[],
): Promise<void> => {
  let handle;
  try {
    handle = await open(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW,
      CREDENTIAL_FILE_MODE,
    );
  } catch {
    throw new Error('Operator receipt file is invalid');
  }
  try {
    const metadata = await handle.stat();
    if (
      !metadata.isFile() ||
      credentials.some((credential) => sameCredential(metadata, credential))
    ) {
      throw new Error('Operator receipt file is invalid');
    }
    await handle.chmod(CREDENTIAL_FILE_MODE);
    await handle.truncate(0);
    await handle.writeFile(JSON.stringify(receipt), { encoding: 'utf8' });
  } finally {
    await handle.close();
  }
};

export const runOperatorImportCli = async (
  arguments_: readonly string[],
  dependencies: OperatorCliDependencies = {},
): Promise<void> => {
  const argumentsParsed = parseArguments(arguments_);
  if (
    resolve(argumentsParsed.crmCredentialFile) ===
    resolve(argumentsParsed.backendCredentialFile)
  ) {
    throw new Error('Operator migration requires separate credential files');
  }
  if (
    [
      resolve(argumentsParsed.crmCredentialFile),
      resolve(argumentsParsed.backendCredentialFile),
    ].includes(resolve(argumentsParsed.receiptFile))
  ) {
    throw new Error('Operator receipt file must be separate from credentials');
  }
  const [crmCredential, backendCredential] = await Promise.all([
    loadCredential({
      path: argumentsParsed.crmCredentialFile,
      key: 'crmReadToken',
      label: 'CRM read',
    }),
    loadCredential({
      path: argumentsParsed.backendCredentialFile,
      key: 'backendIngestToken',
      label: 'Backend ingest',
    }),
  ]);
  if (sameCredential(crmCredential, backendCredential)) {
    throw new Error('Operator migration requires separate credential files');
  }
  if (sameToken(crmCredential.token, backendCredential.token)) {
    throw new Error('CRM read and backend ingest credentials must be distinct');
  }
  const createCrmClient =
    dependencies.createCrmClient ??
    ((options: ClientOptions) => new TwentyImportClient(options));
  const createBackendClient =
    dependencies.createBackendClient ??
    ((options: ClientOptions) => new BackendIngestionClient(options));
  const receipt = await (dependencies.runMigration ?? runLegacyCrmMigration)({
    crm: createCrmClient({
      origin: APPROVED_CRM_ORIGIN,
      token: crmCredential.token,
    }),
    backend: createBackendClient({
      origin: APPROVED_BACKEND_ORIGIN,
      token: backendCredential.token,
    }),
  });
  await writeReceipt(argumentsParsed.receiptFile, receipt, [
    crmCredential,
    backendCredential,
  ]);
  (dependencies.writeOutput ?? ((value) => process.stdout.write(value)))(
    `Migrated ${receipt.acceptedRows} of ${receipt.sourceRows} normalized CRM holdings to the canonical 13F backend.\n`,
  );
};

export const runOperatorImportCliMain = async (
  arguments_: readonly string[] = process.argv.slice(2),
  dependencies: OperatorCliDependencies = {},
): Promise<0 | 1> => {
  try {
    await runOperatorImportCli(arguments_, dependencies);

    return 0;
  } catch {
    (dependencies.writeError ?? ((value) => process.stderr.write(value)))(
      'Corgi 13F operator migration failed; no credentials or row payloads were logged.\n',
    );

    return 1;
  }
};

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  runOperatorImportCliMain().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

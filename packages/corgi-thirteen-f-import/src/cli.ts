import { chmod, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { BackendIngestionClient } from './backend-client.ts';
import { APPROVED_CRM_ORIGIN } from './constants.ts';
import { requestGitHubOidcToken } from './github-oidc.ts';
import { runLegacyCrmMigration } from './migration-runner.ts';
import { TwentyImportClient } from './twenty-client.ts';

const APPROVED_BACKEND_ORIGIN = 'https://admin.corgiinvest.com';

type CredentialFile = { token?: unknown };
type Environment = Record<string, string | undefined>;

const requiredEnvironment = (
  environment: Environment,
  name: string,
): string => {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);

  return value;
};

export const assertWorkflowIdentity = (environment: Environment): void => {
  const expected = {
    GITHUB_REPOSITORY_ID: '1359532075',
    GITHUB_REPOSITORY_OWNER_ID: '241377158',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    RUNNER_ENVIRONMENT: 'github-hosted',
  } as const;
  if (
    environment.GITHUB_REPOSITORY?.trim().toLowerCase() !==
      'corgi-etf/twenty' ||
    Object.entries(expected).some(
      ([name, value]) => environment[name]?.trim() !== value,
    )
  ) {
    throw new Error(
      'The 13F migration is restricted to the approved manual production workflow',
    );
  }
};

const maskSecret = (value: string): void => {
  const escaped = value
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
  process.stdout.write(`::add-mask::${escaped}\n`);
};

export const runImportCli = async (
  environment: Environment = process.env,
): Promise<void> => {
  assertWorkflowIdentity(environment);
  const keyPath = requiredEnvironment(environment, 'CORGI_13F_IMPORT_KEY_PATH');
  const resultPath = requiredEnvironment(
    environment,
    'CORGI_13F_IMPORT_RESULT_PATH',
  );
  const credential = JSON.parse(
    await readFile(keyPath, 'utf8'),
  ) as CredentialFile;
  if (typeof credential.token !== 'string' || !credential.token.trim()) {
    throw new Error('The 13F read credential lease is incomplete');
  }
  const crmToken = credential.token.trim();
  maskSecret(crmToken);
  const oidcToken = await requestGitHubOidcToken({
    requestUrl: requiredEnvironment(
      environment,
      'ACTIONS_ID_TOKEN_REQUEST_URL',
    ),
    requestToken: requiredEnvironment(
      environment,
      'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
    ),
    maskSecret,
  });
  const receipt = await runLegacyCrmMigration({
    crm: new TwentyImportClient({
      origin: APPROVED_CRM_ORIGIN,
      token: crmToken,
    }),
    backend: new BackendIngestionClient({
      origin: APPROVED_BACKEND_ORIGIN,
      token: oidcToken,
    }),
  });
  await writeFile(resultPath, JSON.stringify(receipt), { mode: 0o600 });
  await chmod(resultPath, 0o600);
  process.stdout.write(
    `Migrated ${receipt.acceptedRows} of ${receipt.sourceRows} normalized CRM holdings to the canonical 13F backend.\n`,
  );
};

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  runImportCli().catch(() => {
    process.stderr.write(
      'Corgi 13F migration failed; no credentials or row payloads were logged.\n',
    );
    process.exitCode = 1;
  });
}

export const INGESTION_OIDC_AUDIENCE =
  'https://admin.corgiinvest.com/api/internal/thirteen-f/ingestions';

export const requestGitHubOidcToken = async (options: {
  requestUrl: string;
  requestToken: string;
  fetcher?: typeof fetch;
  maskSecret(value: string): void;
}): Promise<string> => {
  let requestUrl: URL;
  try {
    requestUrl = new URL(options.requestUrl);
  } catch {
    throw new Error('GitHub OIDC environment is invalid');
  }
  if (
    requestUrl.protocol !== 'https:' ||
    !requestUrl.hostname.endsWith('.actions.githubusercontent.com') ||
    !options.requestToken ||
    options.requestToken.length > 16_384
  ) {
    throw new Error('GitHub OIDC environment is invalid');
  }
  requestUrl.searchParams.set('audience', INGESTION_OIDC_AUDIENCE);
  options.maskSecret(options.requestToken);
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(requestUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${options.requestToken}`,
      },
      redirect: 'error',
    });
  } catch {
    throw new Error('GitHub OIDC request failed');
  }
  if (!response.ok) throw new Error('GitHub OIDC request failed');
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > 32 * 1024) {
    throw new Error('GitHub OIDC response is too large');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new Error('GitHub OIDC response is invalid');
  }
  const value =
    isRecord(parsed) && typeof parsed.value === 'string'
      ? parsed.value.trim()
      : '';
  if (
    value.length < 16 ||
    value.length > 16_384 ||
    value.split('.').length !== 3
  ) {
    throw new Error('GitHub OIDC response is invalid');
  }
  options.maskSecret(value);

  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

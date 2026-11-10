import type { ThirteenFQuery } from 'src/front-components/thirteen-f-workspace/types';

type ClientDependencies = {
  apiUrl: string;
  functionsUrl?: string;
  accessToken: string;
  fetcher: (
    input: string,
    init?: RequestInit,
  ) => Promise<globalThis.Response>;
};

const readError = async (response: globalThis.Response) => {
  const body = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(body) as { status?: string };
    return parsed.status ?? 'request_failed';
  } catch {
    return 'request_failed';
  }
};

export const callThirteenFRoute = async <T>(
  query: ThirteenFQuery,
  dependencies?: ClientDependencies,
): Promise<T> => {
  const apiUrl = dependencies?.apiUrl ?? process.env.TWENTY_API_URL ?? '';
  const functionsUrl =
    dependencies?.functionsUrl ?? process.env.TWENTY_FUNCTIONS_URL ?? '';
  const accessToken =
    dependencies?.accessToken ?? process.env.TWENTY_APP_ACCESS_TOKEN ?? '';
  const fetcher = dependencies?.fetcher ?? fetch;
  if ((!apiUrl && !functionsUrl) || !accessToken) {
    throw new Error('configuration_missing');
  }

  const routeUrl = functionsUrl
    ? `${functionsUrl.replace(/\/$/, '')}/thirteen-f/query`
    : `${apiUrl.replace(/\/$/, '')}/s/thirteen-f/query`;

  const response = await fetcher(
    routeUrl,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(query),
    },
  );
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as T;
};

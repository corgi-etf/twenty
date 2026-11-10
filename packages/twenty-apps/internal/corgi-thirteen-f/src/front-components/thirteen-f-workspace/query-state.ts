export type WorkspaceQuery = {
  q: string;
  asOfDate: string | undefined;
  firmId: string | undefined;
  securityId: string | undefined;
};

const readValue = (params: URLSearchParams, key: string) => {
  const value = params.get(key)?.trim();
  return value || undefined;
};

export const parseWorkspaceQuery = (search: string): WorkspaceQuery => {
  const params = new URLSearchParams(search);
  return {
    q: readValue(params, 'q') ?? '',
    asOfDate: readValue(params, 'asOfDate'),
    firmId: readValue(params, 'firmId'),
    securityId: readValue(params, 'securityId'),
  };
};

export const serializeWorkspaceQuery = (state: WorkspaceQuery) => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.asOfDate) params.set('asOfDate', state.asOfDate);
  if (state.firmId) params.set('firmId', state.firmId);
  if (state.securityId) params.set('securityId', state.securityId);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};

export const readBrowserWorkspaceQuery = () =>
  typeof window === 'undefined'
    ? parseWorkspaceQuery('')
    : parseWorkspaceQuery(window.location.search);

export const replaceBrowserWorkspaceQuery = (state: WorkspaceQuery) => {
  if (typeof window === 'undefined') return;
  const query = serializeWorkspaceQuery(state);
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${query}${window.location.hash}`,
  );
};

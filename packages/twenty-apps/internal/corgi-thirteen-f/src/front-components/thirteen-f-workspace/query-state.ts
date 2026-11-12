import type { DateBasis } from 'src/front-components/thirteen-f-workspace/types';

export type WorkspaceQuery = {
  q: string;
  asOfDate: string | undefined;
  dateBasis: DateBasis | undefined;
  firmId: string | undefined;
  securityId: string | undefined;
};

const readValue = (params: URLSearchParams, key: string) => {
  const value = params.get(key)?.trim();
  return value || undefined;
};

const readDateBasis = (params: URLSearchParams): DateBasis | undefined => {
  const value = readValue(params, 'dateBasis');
  return value === 'SEC_REPORT_PERIOD' || value === 'LEGACY_AS_OF_UNVERIFIED'
    ? value
    : undefined;
};

export const parseWorkspaceQuery = (search: string): WorkspaceQuery => {
  const params = new URLSearchParams(search);
  return {
    q: readValue(params, 'q') ?? '',
    asOfDate: readValue(params, 'asOfDate'),
    dateBasis: readDateBasis(params),
    firmId: readValue(params, 'firmId'),
    securityId: readValue(params, 'securityId'),
  };
};

export const serializeWorkspaceQuery = (state: WorkspaceQuery) => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.asOfDate) params.set('asOfDate', state.asOfDate);
  if (state.dateBasis) params.set('dateBasis', state.dateBasis);
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
  if (
    typeof window === 'undefined' ||
    !window.location ||
    typeof window.history?.replaceState !== 'function'
  ) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  for (const key of ['q', 'asOfDate', 'dateBasis', 'firmId', 'securityId']) {
    params.delete(key);
  }
  const workspaceParams = new URLSearchParams(
    serializeWorkspaceQuery(state).replace(/^\?/, ''),
  );
  workspaceParams.forEach((value, key) => params.set(key, value));
  const serialized = params.toString();
  const query = serialized ? `?${serialized}` : '';
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${query}${window.location.hash}`,
  );
};

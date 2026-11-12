import { useEffect, useRef, useState } from 'react';

import { callThirteenFRoute } from 'src/front-components/thirteen-f-workspace/client';
import {
  readPeriodCatalog,
  SEC_REPORT_PERIOD,
  secReportPeriods,
} from 'src/front-components/thirteen-f-workspace/periods';
import {
  readBrowserWorkspaceQuery,
  replaceBrowserWorkspaceQuery,
} from 'src/front-components/thirteen-f-workspace/query-state';
import {
  firmHoldingsRequestKey,
  firmMetadataRequestKey,
} from 'src/front-components/thirteen-f-workspace/request-keys';
import {
  beginLoadMoreRequest,
  createLoadMoreRequestGate,
  finishLoadMoreRequest,
  hasActiveLoadMoreRequest,
  invalidateLoadMoreRequest,
  isActiveLoadMoreRequest,
} from 'src/front-components/thirteen-f-workspace/load-more-request';
import {
  failedRequest,
  idleRequest,
  loadingRequest,
  successfulRequest,
} from 'src/front-components/thirteen-f-workspace/request-state';
import type { RequestState } from 'src/front-components/thirteen-f-workspace/request-state';
import type {
  FirmDetail,
  FirmSummary,
  Holding,
  HoldingsOrder,
  HoldingsPageEnvelope,
  PageEnvelope,
  PeriodOption,
  SearchResults,
  SecuritySummary,
} from 'src/front-components/thirteen-f-workspace/types';

const INITIAL_QUERY = readBrowserWorkspaceQuery();
const INITIAL_PERIOD: PeriodOption | undefined =
  INITIAL_QUERY.asOfDate && INITIAL_QUERY.dateBasis === SEC_REPORT_PERIOD
    ? {
        asOfDate: INITIAL_QUERY.asOfDate,
        dateBasis: INITIAL_QUERY.dateBasis,
      }
    : undefined;

export type DirectoryResult =
  | {
      kind: 'firms';
      requestKey: string;
      page: PageEnvelope<FirmSummary>;
    }
  | { kind: 'search'; requestKey: string; results: SearchResults };

export type FirmHoldingsResult = {
  requestKey: string;
  page: HoldingsPageEnvelope;
};

export type SecurityHoldingsResult = {
  requestKey: string;
  page: PageEnvelope<Holding>;
};

const securityFromHolding = (holding: Holding): SecuritySummary => ({
  id: holding.securityId,
  issuerName: holding.issuerName,
  ticker: holding.ticker,
  cusip: holding.cusip,
});

const directoryRequestKey = (
  query: string,
  period: PeriodOption | undefined,
) =>
  `${query.trim()}:${period?.asOfDate ?? ''}:${period?.dateBasis ?? SEC_REPORT_PERIOD}`;

const securityHoldingsRequestKey = (
  securityId: string | undefined,
  period: PeriodOption | undefined,
) =>
  securityId && period
    ? `${securityId}:${period.asOfDate}:${period.dateBasis}`
    : null;

export const useThirteenFWorkspaceController = () => {
  const [query, setQuery] = useState(INITIAL_QUERY.q);
  const [selectedPeriod, setSelectedPeriod] = useState<
    PeriodOption | undefined
  >(INITIAL_PERIOD);
  const asOfDate = selectedPeriod?.asOfDate;
  const dateBasis = selectedPeriod?.dateBasis ?? SEC_REPORT_PERIOD;
  const [periodCatalogState, setPeriodCatalogState] = useState<
    RequestState<ReturnType<typeof readPeriodCatalog>>
  >(loadingRequest());
  const [directoryState, setDirectoryState] = useState<
    RequestState<DirectoryResult>
  >(loadingRequest());
  const [selectedFirmId, setSelectedFirmId] = useState<string | undefined>(
    INITIAL_QUERY.firmId,
  );
  const [firmState, setFirmState] = useState<RequestState<FirmDetail>>(
    idleRequest(),
  );
  const [selectedSecurity, setSelectedSecurity] =
    useState<SecuritySummary | null>(
      !INITIAL_QUERY.firmId && INITIAL_QUERY.securityId
        ? {
            id: INITIAL_QUERY.securityId,
            issuerName: 'Selected security',
            ticker: null,
            cusip: null,
          }
        : null,
    );
  const [firmHoldingsState, setFirmHoldingsState] = useState<
    RequestState<FirmHoldingsResult>
  >(idleRequest());
  const [securityHoldingsState, setSecurityHoldingsState] = useState<
    RequestState<SecurityHoldingsResult>
  >(idleRequest());
  const [holdingsOrder, setHoldingsOrder] =
    useState<HoldingsOrder>('value_desc');
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const loadMoreRequestGate = useRef(createLoadMoreRequestGate());

  const firmMetadataKey = firmMetadataRequestKey(selectedFirmId);
  const firmHoldingsKey = firmHoldingsRequestKey(
    selectedFirmId,
    selectedPeriod,
    holdingsOrder,
  );
  const securityHoldingsKey = securityHoldingsRequestKey(
    selectedSecurity?.id,
    selectedPeriod,
  );
  const loadMoreScopeKey = selectedFirmId
    ? `firm:${firmHoldingsKey ?? ''}`
    : selectedSecurity
      ? `security:${securityHoldingsKey ?? ''}`
      : `directory:${directoryRequestKey(query, selectedPeriod)}`;

  const resetLoadMoreState = () => {
    invalidateLoadMoreRequest(loadMoreRequestGate.current);
    setLoadingMore(false);
    setLoadMoreError(null);
  };

  useEffect(() => {
    invalidateLoadMoreRequest(loadMoreRequestGate.current);
    setLoadingMore(false);
    setLoadMoreError(null);
  }, [loadMoreScopeKey]);

  useEffect(() => {
    let active = true;
    callThirteenFRoute<unknown>({ action: 'periods' })
      .then((result) => readPeriodCatalog(result))
      .then((catalog) => {
        if (!active) return;
        setPeriodCatalogState(successfulRequest(catalog));
        setSelectedPeriod((current) => {
          const periods = secReportPeriods(catalog.periods);
          if (
            current &&
            periods.some(
              (period) =>
                period.asOfDate === current.asOfDate &&
                period.dateBasis === current.dateBasis,
            )
          ) {
            return current;
          }
          return periods[0];
        });
      })
      .catch(() => {
        if (active) {
          setPeriodCatalogState(
            failedRequest('13F report periods are temporarily unavailable.'),
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    replaceBrowserWorkspaceQuery({
      q: query,
      asOfDate,
      dateBasis,
      firmId: selectedFirmId,
      securityId: selectedSecurity?.id,
    });
  }, [asOfDate, dateBasis, query, selectedFirmId, selectedSecurity?.id]);

  useEffect(() => {
    if (
      selectedFirmId ||
      selectedSecurity ||
      periodCatalogState.status !== 'success'
    ) {
      return;
    }
    let active = true;
    setDirectoryState(loadingRequest());
    const requestKey = directoryRequestKey(query, selectedPeriod);
    const timeout = globalThis.setTimeout(() => {
      const trimmed = query.trim();
      const request = trimmed
        ? callThirteenFRoute<SearchResults>({
            action: 'search',
            q: trimmed,
            dateBasis,
            limit: 40,
          }).then(
            (results): DirectoryResult => ({
              kind: 'search',
              requestKey,
              results,
            }),
          )
        : callThirteenFRoute<PageEnvelope<FirmSummary>>({
            action: 'firms',
            asOfDate,
            dateBasis,
            limit: 100,
          }).then(
            (page): DirectoryResult => ({
              kind: 'firms',
              requestKey,
              page,
            }),
          );
      request
        .then((result) => {
          if (active) setDirectoryState(successfulRequest(result));
        })
        .catch(() => {
          if (active) {
            setDirectoryState(failedRequest('Could not load this 13F view.'));
          }
        });
    }, 250);
    return () => {
      active = false;
      globalThis.clearTimeout(timeout);
    };
  }, [
    asOfDate,
    dateBasis,
    periodCatalogState.status,
    query,
    selectedFirmId,
    selectedPeriod,
    selectedSecurity,
  ]);

  useEffect(() => {
    if (!firmMetadataKey) return;
    let active = true;
    setFirmState(loadingRequest());
    callThirteenFRoute<FirmDetail>({
      action: 'firm',
      firmId: firmMetadataKey,
    })
      .then((result) => {
        if (active) setFirmState(successfulRequest(result));
      })
      .catch(() => {
        if (active) {
          setFirmState(failedRequest('Could not load this firm’s details.'));
        }
      });
    return () => {
      active = false;
    };
  }, [firmMetadataKey]);

  useEffect(() => {
    if (!firmHoldingsKey || !selectedFirmId || !selectedPeriod) return;
    let active = true;
    setFirmHoldingsState(loadingRequest());
    callThirteenFRoute<HoldingsPageEnvelope>({
      action: 'holdings',
      firmId: selectedFirmId,
      asOfDate: selectedPeriod.asOfDate,
      dateBasis: selectedPeriod.dateBasis,
      limit: 100,
      order: holdingsOrder,
    })
      .then((page) => {
        if (active) {
          setFirmHoldingsState(
            successfulRequest({ requestKey: firmHoldingsKey, page }),
          );
        }
      })
      .catch(() => {
        if (active) {
          setFirmHoldingsState(
            failedRequest('Could not load this firm’s holdings.'),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [firmHoldingsKey]);

  useEffect(() => {
    if (!securityHoldingsKey || !selectedSecurity || !selectedPeriod) return;
    let active = true;
    setSecurityHoldingsState(loadingRequest());
    callThirteenFRoute<PageEnvelope<Holding>>({
      action: 'holders',
      securityId: selectedSecurity.id,
      asOfDate: selectedPeriod.asOfDate,
      dateBasis: selectedPeriod.dateBasis,
      mode: 'exact',
      limit: 100,
    })
      .then((page) => {
        if (!active) return;
        setSecurityHoldingsState(
          successfulRequest({ requestKey: securityHoldingsKey, page }),
        );
        const first = page.items[0];
        if (first) setSelectedSecurity(securityFromHolding(first));
      })
      .catch(() => {
        if (active) {
          setSecurityHoldingsState(
            failedRequest('Could not load firms holding this security.'),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [securityHoldingsKey]);

  const availablePeriods =
    periodCatalogState.status === 'success'
      ? secReportPeriods(periodCatalogState.data.periods)
      : [];

  const chooseFirm = (nextFirm: FirmSummary | Holding) => {
    setQuery('');
    setSelectedSecurity(null);
    setSecurityHoldingsState(idleRequest());
    setFirmState(loadingRequest());
    setFirmHoldingsState(loadingRequest());
    resetLoadMoreState();
    setSelectedFirmId('firmId' in nextFirm ? nextFirm.firmId : nextFirm.id);
  };

  const chooseSecurity = (security: SecuritySummary | Holding) => {
    setQuery('');
    setSelectedFirmId(undefined);
    setFirmState(idleRequest());
    setFirmHoldingsState(idleRequest());
    setSecurityHoldingsState(loadingRequest());
    resetLoadMoreState();
    setSelectedSecurity(
      'securityId' in security ? securityFromHolding(security) : security,
    );
  };

  const backToDirectory = () => {
    setSelectedFirmId(undefined);
    setSelectedSecurity(null);
    setFirmState(idleRequest());
    setFirmHoldingsState(idleRequest());
    setSecurityHoldingsState(idleRequest());
    setDirectoryState(loadingRequest());
    resetLoadMoreState();
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedFirmId(undefined);
    setSelectedSecurity(null);
    setFirmState(idleRequest());
    setFirmHoldingsState(idleRequest());
    setSecurityHoldingsState(idleRequest());
    setDirectoryState(loadingRequest());
    resetLoadMoreState();
  };

  const handlePeriodChange = (period: PeriodOption | undefined) => {
    setSelectedPeriod(period);
    resetLoadMoreState();
    if (selectedFirmId) {
      setFirmHoldingsState(loadingRequest());
      return;
    }
    if (selectedSecurity) {
      setSecurityHoldingsState(loadingRequest());
      return;
    }
    setDirectoryState(loadingRequest());
  };

  const handleHoldingsOrderChange = (order: HoldingsOrder) => {
    if (order === holdingsOrder) return;
    setFirmHoldingsState(loadingRequest());
    resetLoadMoreState();
    setHoldingsOrder(order);
  };

  const loadMore = async () => {
    if (loadingMore || hasActiveLoadMoreRequest(loadMoreRequestGate.current)) {
      return;
    }
    const requestId = beginLoadMoreRequest(loadMoreRequestGate.current);
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      if (
        selectedFirmId &&
        selectedPeriod &&
        firmHoldingsKey &&
        firmHoldingsState.status === 'success' &&
        firmHoldingsState.data.page.pageInfo.hasNextPage &&
        firmHoldingsState.data.page.pageInfo.endCursor
      ) {
        const page = await callThirteenFRoute<HoldingsPageEnvelope>({
          action: 'holdings',
          firmId: selectedFirmId,
          asOfDate: selectedPeriod.asOfDate,
          dateBasis: selectedPeriod.dateBasis,
          cursor: firmHoldingsState.data.page.pageInfo.endCursor,
          limit: 100,
          order: holdingsOrder,
        });
        if (!isActiveLoadMoreRequest(loadMoreRequestGate.current, requestId)) {
          return;
        }
        setFirmHoldingsState((current) => {
          if (
            current.status !== 'success' ||
            current.data.requestKey !== firmHoldingsKey
          ) {
            return current;
          }
          return successfulRequest({
            requestKey: firmHoldingsKey,
            page: {
              ...page,
              items: [...current.data.page.items, ...page.items],
            },
          });
        });
      } else if (
        selectedSecurity &&
        selectedPeriod &&
        securityHoldingsKey &&
        securityHoldingsState.status === 'success' &&
        securityHoldingsState.data.page.pageInfo.hasNextPage &&
        securityHoldingsState.data.page.pageInfo.endCursor
      ) {
        const page = await callThirteenFRoute<PageEnvelope<Holding>>({
          action: 'holders',
          securityId: selectedSecurity.id,
          asOfDate: selectedPeriod.asOfDate,
          dateBasis: selectedPeriod.dateBasis,
          mode: 'exact',
          cursor: securityHoldingsState.data.page.pageInfo.endCursor,
          limit: 100,
        });
        if (!isActiveLoadMoreRequest(loadMoreRequestGate.current, requestId)) {
          return;
        }
        setSecurityHoldingsState((current) => {
          if (
            current.status !== 'success' ||
            current.data.requestKey !== securityHoldingsKey
          ) {
            return current;
          }
          return successfulRequest({
            requestKey: securityHoldingsKey,
            page: {
              ...page,
              items: [...current.data.page.items, ...page.items],
            },
          });
        });
      } else if (
        !query.trim() &&
        directoryState.status === 'success' &&
        directoryState.data.kind === 'firms' &&
        directoryState.data.page.pageInfo.hasNextPage &&
        directoryState.data.page.pageInfo.endCursor
      ) {
        const activeRequestKey = directoryState.data.requestKey;
        const page = await callThirteenFRoute<PageEnvelope<FirmSummary>>({
          action: 'firms',
          asOfDate,
          dateBasis,
          cursor: directoryState.data.page.pageInfo.endCursor,
          limit: 100,
        });
        if (!isActiveLoadMoreRequest(loadMoreRequestGate.current, requestId)) {
          return;
        }
        setDirectoryState((current) => {
          if (
            current.status !== 'success' ||
            current.data.kind !== 'firms' ||
            current.data.requestKey !== activeRequestKey
          ) {
            return current;
          }
          return successfulRequest({
            kind: 'firms',
            requestKey: activeRequestKey,
            page: {
              ...page,
              items: [...current.data.page.items, ...page.items],
            },
          });
        });
      }
    } catch {
      if (isActiveLoadMoreRequest(loadMoreRequestGate.current, requestId)) {
        setLoadMoreError('Could not load more results.');
      }
    } finally {
      if (finishLoadMoreRequest(loadMoreRequestGate.current, requestId)) {
        setLoadingMore(false);
      }
    }
  };

  const pagination = (() => {
    if (selectedFirmId && firmHoldingsState.status === 'success') {
      return {
        pageInfo: firmHoldingsState.data.page.pageInfo,
        visibleCount: firmHoldingsState.data.page.items.length,
        totalCount: firmHoldingsState.data.page.totalCount,
      };
    }
    if (selectedSecurity && securityHoldingsState.status === 'success') {
      return {
        pageInfo: securityHoldingsState.data.page.pageInfo,
        visibleCount: securityHoldingsState.data.page.items.length,
        totalCount: securityHoldingsState.data.page.totalCount,
      };
    }
    if (
      directoryState.status === 'success' &&
      directoryState.data.kind === 'firms'
    ) {
      return {
        pageInfo: directoryState.data.page.pageInfo,
        visibleCount: directoryState.data.page.items.length,
        totalCount: directoryState.data.page.totalCount,
      };
    }
    return null;
  })();

  return {
    query,
    asOfDate,
    availablePeriods,
    selectedPeriod,
    periodCatalogState,
    directoryState,
    selectedFirmId,
    firmState,
    selectedSecurity,
    firmHoldingsState,
    securityHoldingsState,
    holdingsOrder,
    loadingMore,
    loadMoreError,
    pagination,
    chooseFirm,
    chooseSecurity,
    backToDirectory,
    handleQueryChange,
    handlePeriodChange,
    handleHoldingsOrderChange,
    loadMore,
  };
};

export type ThirteenFWorkspaceController = ReturnType<
  typeof useThirteenFWorkspaceController
>;

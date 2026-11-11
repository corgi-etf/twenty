import { useEffect, useMemo, useState } from 'react';

import { callThirteenFRoute } from 'src/front-components/thirteen-f-workspace/client';
import {
  formatCount,
  formatDate,
} from 'src/front-components/thirteen-f-workspace/format';
import {
  readBrowserWorkspaceQuery,
  replaceBrowserWorkspaceQuery,
} from 'src/front-components/thirteen-f-workspace/query-state';
import { UnifiedSearchResults } from 'src/front-components/thirteen-f-workspace/search-results';
import type {
  FirmDetail,
  FirmSummary,
  Holding,
  HoldingsPageEnvelope,
  HoldingsOrder,
  PageEnvelope,
  SearchResults,
  SecuritySummary,
  ThirteenFSummary,
} from 'src/front-components/thirteen-f-workspace/types';
import {
  FirmDirectory,
  FirmHoldings,
  SecurityHolders,
} from 'src/front-components/thirteen-f-workspace/views';

const INITIAL_QUERY = readBrowserWorkspaceQuery();

const STYLES = {
  page: {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: '100%',
    background: '#F8FAFC',
    color: '#141414',
    padding: '24px clamp(16px, 4vw, 48px) 48px',
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  content: { maxWidth: 1400, margin: '0 auto' },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    marginBottom: 22,
  },
  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
    flexWrap: 'wrap',
  },
  title: { margin: 0, fontSize: 26, letterSpacing: '-0.02em' },
  subtitle: { marginTop: 4, color: '#667085', fontSize: 13 },
  controls: {
    display: 'grid',
    gridTemplateColumns: 'minmax(260px, 1fr) minmax(180px, auto)',
    gap: 10,
  },
  input: {
    minWidth: 0,
    border: '1px solid #D0D5DD',
    borderRadius: 9,
    background: '#FFFFFF',
    color: '#141414',
    fontSize: 13,
    padding: '10px 12px',
    outline: 'none',
  },
  select: {
    border: '1px solid #D0D5DD',
    borderRadius: 9,
    background: '#FFFFFF',
    color: '#141414',
    fontSize: 13,
    padding: '10px 12px',
  },
  panel: {
    border: '1px solid #E4E7EC',
    borderRadius: 12,
    background: '#FFFFFF',
    padding: 18,
  },
  status: {
    border: '1px dashed #D0D5DD',
    borderRadius: 10,
    padding: 24,
    color: '#667085',
    textAlign: 'center',
  },
  error: {
    border: '1px solid #FDA29B',
    borderRadius: 10,
    padding: 14,
    background: '#FEF3F2',
    color: '#B42318',
    fontSize: 13,
  },
  loadMore: {
    display: 'block',
    margin: '16px auto 0',
    border: '1px solid #D0D5DD',
    borderRadius: 8,
    background: '#FFFFFF',
    color: '#344054',
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
} as const;

const securityFromHolding = (holding: Holding): SecuritySummary => ({
  id: holding.securityId,
  issuerName: holding.issuerName,
  ticker: holding.ticker,
  cusip: holding.cusip,
});

export const ThirteenFWorkspace = () => {
  const [query, setQuery] = useState(INITIAL_QUERY.q);
  const [asOfDate, setAsOfDate] = useState<string | undefined>(
    INITIAL_QUERY.asOfDate,
  );
  const [summary, setSummary] = useState<ThirteenFSummary | null>(null);
  const [firms, setFirms] = useState<FirmSummary[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [selectedFirmId, setSelectedFirmId] = useState<string | undefined>(
    INITIAL_QUERY.firmId,
  );
  const [firm, setFirm] = useState<FirmDetail | null>(null);
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
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalReportedValue, setTotalReportedValue] = useState<string | null>(
    null,
  );
  const [holdingsOrder, setHoldingsOrder] =
    useState<HoldingsOrder>('value_desc');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    callThirteenFRoute<ThirteenFSummary>({ action: 'summary' })
      .then((result) => {
        if (!active) return;
        setSummary(result);
        setAsOfDate((current) => current ?? result.latestAsOfDate ?? undefined);
      })
      .catch(() => {
        if (active) setError('13F data is temporarily unavailable.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    replaceBrowserWorkspaceQuery({
      q: query,
      asOfDate,
      firmId: selectedFirmId,
      securityId: selectedSecurity?.id,
    });
  }, [asOfDate, query, selectedFirmId, selectedSecurity?.id]);

  useEffect(() => {
    if (selectedFirmId || selectedSecurity) return;
    let active = true;
    const timeout = globalThis.setTimeout(() => {
      setLoading(true);
      setError(null);
      const trimmed = query.trim();
      const request = trimmed
        ? callThirteenFRoute<SearchResults>({
            action: 'search',
            q: trimmed,
            limit: 40,
          })
        : callThirteenFRoute<PageEnvelope<FirmSummary>>({
            action: 'firms',
            asOfDate,
            limit: 100,
          });
      request
        .then((result) => {
          if (!active) return;
          if (trimmed) {
            setSearchResults(result as SearchResults);
            setTotalCount(0);
            setTotalReportedValue(null);
            setNextCursor(undefined);
            setHasNextPage(false);
          } else {
            setSearchResults(null);
            const page = result as PageEnvelope<FirmSummary>;
            setFirms(page.items);
            setTotalCount(page.totalCount);
            setTotalReportedValue(null);
            setNextCursor(page.pageInfo.endCursor ?? undefined);
            setHasNextPage(Boolean(page.pageInfo.hasNextPage));
          }
        })
        .catch(() => {
          if (active) setError('Could not load this 13F view.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      globalThis.clearTimeout(timeout);
    };
  }, [asOfDate, query, selectedFirmId, selectedSecurity]);

  useEffect(() => {
    if (!selectedFirmId) return;
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      callThirteenFRoute<FirmDetail>({
        action: 'firm',
        firmId: selectedFirmId,
      }),
      callThirteenFRoute<HoldingsPageEnvelope>({
        action: 'holdings',
        firmId: selectedFirmId,
        asOfDate,
        limit: 100,
        order: holdingsOrder,
      }),
    ])
      .then(([firmResult, holdingsResult]) => {
        if (!active) return;
        setFirm(firmResult);
        setHoldings(holdingsResult.items);
        setTotalCount(holdingsResult.totalCount);
        setTotalReportedValue(holdingsResult.totalReportedValue);
        setNextCursor(holdingsResult.pageInfo.endCursor ?? undefined);
        setHasNextPage(Boolean(holdingsResult.pageInfo.hasNextPage));
      })
      .catch(() => {
        if (active) setError('Could not load this firm’s holdings.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [asOfDate, holdingsOrder, selectedFirmId]);

  useEffect(() => {
    if (!selectedSecurity) return;
    let active = true;
    setLoading(true);
    setError(null);
    callThirteenFRoute<PageEnvelope<Holding>>({
      action: 'holders',
      securityId: selectedSecurity.id,
      asOfDate,
      mode: asOfDate ? 'exact' : 'latest',
      limit: 100,
    })
      .then((result) => {
        if (!active) return;
        setHoldings(result.items);
        setTotalCount(result.totalCount);
        setTotalReportedValue(null);
        setNextCursor(result.pageInfo.endCursor ?? undefined);
        setHasNextPage(Boolean(result.pageInfo.hasNextPage));
        const first = result.items[0];
        if (first) setSelectedSecurity(securityFromHolding(first));
      })
      .catch(() => {
        if (active) setError('Could not load firms holding this security.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [asOfDate, selectedSecurity?.id]);

  const availablePeriods = summary?.periods ?? [];
  const selectedBasis = useMemo(
    () =>
      availablePeriods.find((period) => period.asOfDate === asOfDate)?.dateBasis,
    [asOfDate, availablePeriods],
  );

  const chooseFirm = (nextFirm: FirmSummary | Holding) => {
    setQuery('');
    setSelectedSecurity(null);
    setHasNextPage(false);
    setTotalCount(0);
    setTotalReportedValue(null);
    setNextCursor(undefined);
    setSelectedFirmId('firmId' in nextFirm ? nextFirm.firmId : nextFirm.id);
  };

  const chooseSecurity = (security: SecuritySummary | Holding) => {
    setQuery('');
    setSelectedFirmId(undefined);
    setFirm(null);
    setHasNextPage(false);
    setTotalCount(0);
    setTotalReportedValue(null);
    setNextCursor(undefined);
    setSelectedSecurity(
      'securityId' in security ? securityFromHolding(security) : security,
    );
  };

  const backToDirectory = () => {
    setSelectedFirmId(undefined);
    setSelectedSecurity(null);
    setFirm(null);
    setHoldings([]);
    setHasNextPage(false);
    setTotalCount(0);
    setTotalReportedValue(null);
    setNextCursor(undefined);
  };

  const loadMore = async () => {
    if (!hasNextPage || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      if (selectedFirmId) {
        const page = await callThirteenFRoute<HoldingsPageEnvelope>({
          action: 'holdings',
          firmId: selectedFirmId,
          asOfDate,
          cursor: nextCursor,
          limit: 100,
          order: holdingsOrder,
        });
        setHoldings((current) => [...current, ...page.items]);
        setTotalCount(page.totalCount);
        setTotalReportedValue(page.totalReportedValue);
        setNextCursor(page.pageInfo.endCursor ?? undefined);
        setHasNextPage(Boolean(page.pageInfo.hasNextPage));
      } else if (selectedSecurity) {
        const page = await callThirteenFRoute<PageEnvelope<Holding>>({
          action: 'holders',
          securityId: selectedSecurity.id,
          asOfDate,
          mode: asOfDate ? 'exact' : 'latest',
          cursor: nextCursor,
          limit: 100,
        });
        setHoldings((current) => [...current, ...page.items]);
        setNextCursor(page.pageInfo.endCursor ?? undefined);
        setHasNextPage(Boolean(page.pageInfo.hasNextPage));
      } else if (!query.trim()) {
        const page = await callThirteenFRoute<PageEnvelope<FirmSummary>>({
          action: 'firms',
          asOfDate,
          cursor: nextCursor,
          limit: 100,
        });
        setFirms((current) => [...current, ...page.items]);
        setNextCursor(page.pageInfo.endCursor ?? undefined);
        setHasNextPage(Boolean(page.pageInfo.hasNextPage));
      }
    } catch {
      setError('Could not load more results.');
    } finally {
      setLoadingMore(false);
    }
  };

  const content = (() => {
    if (loading) {
      return (
        <div style={STYLES.status} role="status" aria-live="polite">
          Loading 13F data…
        </div>
      );
    }
    if (selectedFirmId && firm) {
      return (
        <FirmHoldings
          firm={firm}
          holdings={holdings}
          totalCount={totalCount}
          totalReportedValue={totalReportedValue}
          asOfDate={asOfDate}
          order={holdingsOrder}
          onBack={backToDirectory}
          onSelectSecurity={chooseSecurity}
          onOrderChange={setHoldingsOrder}
        />
      );
    }
    if (selectedSecurity) {
      return (
        <SecurityHolders
          security={selectedSecurity}
          holdings={holdings}
          totalCount={totalCount}
          onBack={backToDirectory}
          onSelectFirm={chooseFirm}
        />
      );
    }
    if (searchResults) {
      return (
        <UnifiedSearchResults
          results={searchResults}
          onSelectFirm={chooseFirm}
          onSelectSecurity={chooseSecurity}
        />
      );
    }
    return (
      <FirmDirectory
        firms={firms}
        totalCount={totalCount}
        onSelect={chooseFirm}
      />
    );
  })();

  return (
    <main style={STYLES.page}>
      <div style={STYLES.content}>
        <header style={STYLES.header}>
          <div style={STYLES.titleRow}>
            <div>
              <h1 style={STYLES.title}>13F</h1>
              <div style={STYLES.subtitle}>
                Review firms and find every firm holding a security.
              </div>
            </div>
            {asOfDate ? (
              <div style={STYLES.subtitle}>
                As of {formatDate(asOfDate)}
                {selectedBasis === 'LEGACY_AS_OF_UNVERIFIED'
                  ? ' · Legacy date'
                  : ''}
              </div>
            ) : null}
          </div>
          <div style={STYLES.controls}>
            <input
              type="search"
              style={STYLES.input}
              value={query}
              placeholder="Search firm, ticker, issuer, CUSIP, or CIK"
              aria-label="Search 13F data"
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedFirmId(undefined);
                setSelectedSecurity(null);
                setFirm(null);
                setNextCursor(undefined);
                setHasNextPage(false);
                setTotalCount(0);
                setTotalReportedValue(null);
              }}
            />
            <select
              style={STYLES.select}
              value={asOfDate ?? ''}
              aria-label="As of date"
              onChange={(event) => setAsOfDate(event.target.value || undefined)}
            >
              {availablePeriods.length === 0 ? (
                <option value={asOfDate ?? ''}>
                  {asOfDate ? formatDate(asOfDate) : 'Latest available'}
                </option>
              ) : null}
              {availablePeriods.map((period) => (
                <option
                  key={`${period.asOfDate}:${period.dateBasis}`}
                  value={period.asOfDate}
                >
                  {formatDate(period.asOfDate)}
                  {period.dateBasis === 'LEGACY_AS_OF_UNVERIFIED'
                    ? ' — legacy date'
                    : ''}
                </option>
              ))}
            </select>
          </div>
        </header>
        {error ? (
          <div style={STYLES.error} role="alert">
            {error}
          </div>
        ) : null}
        <div style={{ ...STYLES.panel, marginTop: error ? 12 : 0 }}>
          {content}
          {hasNextPage && !loading ? (
            <button
              type="button"
              style={STYLES.loadMore}
              disabled={loadingMore}
              aria-busy={loadingMore}
              onClick={loadMore}
            >
              {loadingMore
                ? 'Loading…'
                : `Load more · ${formatCount(
                    selectedFirmId || selectedSecurity
                      ? holdings.length
                      : firms.length,
                  )} of ${formatCount(totalCount)}`}
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
};

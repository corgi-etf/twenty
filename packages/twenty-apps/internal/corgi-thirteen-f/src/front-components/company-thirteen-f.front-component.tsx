import { useEffect, useState } from 'react';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  closeSidePanel,
  unmountFrontComponent,
  useRecordId,
} from 'twenty-sdk/front-component';

import { COMPANY_THIRTEEN_F_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers';
import { callThirteenFRoute } from 'src/front-components/thirteen-f-workspace/client';
import { formatCount } from 'src/front-components/thirteen-f-workspace/format';
import type {
  CompanySummary,
  FirmDetail,
  Holding,
  HoldingsPageEnvelope,
} from 'src/front-components/thirteen-f-workspace/types';
import { FirmHoldings } from 'src/front-components/thirteen-f-workspace/views';

const STYLES = {
  panel: {
    boxSizing: 'border-box',
    minWidth: 0,
    padding: 16,
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  status: { color: '#667085', fontSize: 13, padding: 16 },
  error: {
    color: '#B42318',
    background: '#FEF3F2',
    border: '1px solid #FDA29B',
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
  },
  loadMore: {
    display: 'block',
    margin: '14px auto 0',
    border: '1px solid #D0D5DD',
    borderRadius: 8,
    background: '#FFFFFF',
    color: '#344054',
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 12,
  },
} as const;

export const CompanyThirteenF = () => {
  const companyId = useRecordId();
  const [firm, setFirm] = useState<FirmDetail | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalReportedValue, setTotalReportedValue] = useState<string | null>(
    null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    'loading',
  );

  useEffect(() => {
    if (!companyId) {
      setStatus('missing');
      return;
    }
    let active = true;
    callThirteenFRoute<CompanySummary>({ action: 'company', companyId })
      .then(async (companySummary) => {
        if (!companySummary) {
          if (active) setStatus('missing');
          return;
        }
        const [firmResult, holdingsResult] = await Promise.all([
          callThirteenFRoute<FirmDetail>({
            action: 'firm',
            firmId: companySummary.thirteenFFirmId,
          }),
          callThirteenFRoute<HoldingsPageEnvelope>({
            action: 'holdings',
            firmId: companySummary.thirteenFFirmId,
            asOfDate: companySummary.firm.latestAsOfDate,
            limit: 100,
            order: 'value_desc',
          }),
        ]);
        if (!active) return;
        setFirm(firmResult);
        setHoldings(holdingsResult.items);
        setTotalCount(holdingsResult.totalCount);
        setTotalReportedValue(holdingsResult.totalReportedValue);
        setNextCursor(holdingsResult.pageInfo.endCursor ?? undefined);
        setHasNextPage(Boolean(holdingsResult.pageInfo.hasNextPage));
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [companyId]);

  const close = () => {
    closeSidePanel();
    unmountFrontComponent();
  };

  const loadMore = async () => {
    if (!firm || !nextCursor || !hasNextPage || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await callThirteenFRoute<HoldingsPageEnvelope>({
        action: 'holdings',
        firmId: firm.id,
        asOfDate: firm.latestAsOfDate,
        cursor: nextCursor,
        limit: 100,
        order: 'value_desc',
      });
      setHoldings((current) => [...current, ...page.items]);
      setTotalCount(page.totalCount);
      setTotalReportedValue(page.totalReportedValue);
      setNextCursor(page.pageInfo.endCursor ?? undefined);
      setHasNextPage(Boolean(page.pageInfo.hasNextPage));
    } catch {
      setStatus('error');
    } finally {
      setLoadingMore(false);
    }
  };

  if (status === 'loading') {
    return (
      <div style={STYLES.status} role="status" aria-live="polite">
        Loading 13F holdings…
      </div>
    );
  }
  if (status === 'missing') {
    return (
      <div style={STYLES.panel}>
        <div style={STYLES.status}>No 13F firm is linked to this company.</div>
      </div>
    );
  }
  if (status === 'error' || !firm) {
    return (
      <div style={STYLES.panel}>
        <div style={STYLES.error} role="alert">
          Could not load this company’s 13F holdings.
        </div>
      </div>
    );
  }

  return (
    <div style={STYLES.panel}>
      <FirmHoldings
        firm={firm}
        holdings={holdings}
        totalCount={totalCount}
        totalReportedValue={totalReportedValue}
        backLabel="Close"
        onBack={close}
      />
      {hasNextPage ? (
        <button
          type="button"
          style={STYLES.loadMore}
          disabled={loadingMore}
          aria-busy={loadingMore}
          onClick={loadMore}
        >
          {loadingMore
            ? 'Loading…'
            : `Load more · ${formatCount(holdings.length)} of ${formatCount(totalCount)}`}
        </button>
      ) : null}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: COMPANY_THIRTEEN_F_FRONT_COMPONENT_ID,
  name: 'Company 13F holdings',
  description:
    'Shows the current 13F positions for the firm linked to the open company.',
  component: CompanyThirteenF,
});

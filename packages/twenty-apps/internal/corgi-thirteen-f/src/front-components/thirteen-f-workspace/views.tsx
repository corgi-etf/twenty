import type { ReactNode } from 'react';

import {
  formatChange,
  formatCount,
  formatDate,
  formatDecimal,
  formatMoney,
  formatPercent,
  formatPercentChange,
} from 'src/front-components/thirteen-f-workspace/format';
import type {
  DateBasis,
  FirmDetail,
  FirmSummary,
  Holding,
  SecuritySummary,
} from 'src/front-components/thirteen-f-workspace/types';

const COLORS = {
  ink: '#141414',
  muted: '#667085',
  border: '#E4E7EC',
  panel: '#FFFFFF',
  soft: '#F8FAFC',
  accent: '#5C3DF5',
  warning: '#9A6700',
  warningBackground: '#FFF8C5',
} as const;

const STYLES = {
  stack: { display: 'flex', flexDirection: 'column', gap: 16 },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  card: {
    width: '100%',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    background: COLORS.panel,
    padding: 16,
    textAlign: 'left',
  },
  title: { margin: 0, color: COLORS.ink, fontSize: 20, lineHeight: 1.25 },
  sectionTitle: { margin: 0, color: COLORS.ink, fontSize: 15 },
  firmName: { color: COLORS.ink, fontSize: 15, fontWeight: 650 },
  muted: { color: COLORS.muted, fontSize: 12, lineHeight: 1.5 },
  strongMetric: { color: COLORS.ink, fontSize: 18, fontWeight: 700 },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 999,
    background: COLORS.warningBackground,
    color: COLORS.warning,
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 8px',
  },
  tableWrap: {
    overflowX: 'auto',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding: '10px 12px',
    color: COLORS.muted,
    background: COLORS.soft,
    borderBottom: `1px solid ${COLORS.border}`,
    textAlign: 'left',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '11px 12px',
    color: COLORS.ink,
    borderBottom: `1px solid ${COLORS.border}`,
    verticalAlign: 'top',
  },
  textButton: {
    border: 0,
    padding: 0,
    background: 'transparent',
    color: COLORS.accent,
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: 650,
  },
  details: { minWidth: 150 },
  detailsSummary: {
    color: COLORS.accent,
    cursor: 'pointer',
    fontWeight: 650,
    whiteSpace: 'nowrap',
  },
  detailsBody: {
    display: 'grid',
    gap: 12,
    minWidth: 280,
    paddingTop: 10,
  },
  detailsList: {
    display: 'grid',
    gridTemplateColumns: 'minmax(110px, auto) minmax(120px, 1fr)',
    gap: '6px 12px',
    margin: 0,
  },
  detailsTerm: { color: COLORS.muted, fontSize: 11 },
  detailsValue: { color: COLORS.ink, fontSize: 11, margin: 0 },
  backButton: {
    alignSelf: 'flex-start',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 7,
    padding: '6px 10px',
    background: COLORS.panel,
    color: COLORS.ink,
    cursor: 'pointer',
    fontSize: 12,
  },
  sectionControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  select: {
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    background: COLORS.panel,
    color: COLORS.ink,
    fontSize: 12,
    padding: '7px 10px',
  },
  empty: {
    border: `1px dashed ${COLORS.border}`,
    borderRadius: 10,
    color: COLORS.muted,
    padding: 24,
    textAlign: 'center',
  },
} as const;

const DateBasisBadge = ({ basis }: { basis: DateBasis }) =>
  basis === 'LEGACY_AS_OF_UNVERIFIED' ? (
    <span style={STYLES.badge}>Legacy date — SEC report period unverified</span>
  ) : null;

const EmptyState = ({ children }: { children: ReactNode }) => (
  <div style={STYLES.empty}>{children}</div>
);

const LegacyContextDetails = ({ holding }: { holding: Holding }) => {
  const context = holding.legacyContext;
  if (!context) return null;
  const legacyValues: Array<[string, string | null]> = [
    ['Portfolio', context.portfolioName],
    ['Target ticker', context.targetTicker],
    ['Latest change', context.latestChange],
    ['Ownership', formatPercent(context.ownershipPercent)],
    ['Portfolio share', formatPercent(context.portfolioPercent)],
    ['Estimated value', formatMoney(context.estimatedValue)],
    ['Change value', formatDecimal(context.changeValue)],
    ['Change percent', formatPercent(context.changePercent)],
  ];
  const values = legacyValues.filter(([, value]) => value && value !== '—');

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={STYLES.badge}>Unverified legacy source</span>
      <dl style={STYLES.detailsList}>
        {values.map(([label, value]) => (
          <div key={label} style={{ display: 'contents' }}>
            <dt style={STYLES.detailsTerm}>{label}</dt>
            <dd style={STYLES.detailsValue}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

const PositionDetails = ({ holding }: { holding: Holding }) => {
  const details: Array<[string, string]> = [
    ['Report period', formatDate(holding.reportPeriod ?? holding.asOfDate)],
    ['Filed', formatDate(holding.filedAt)],
    ['Form', holding.formType ?? '—'],
    ['Coverage', holding.coverage ?? '—'],
    ['CUSIP', holding.cusip ?? '—'],
    ['Security class', holding.titleOfClass ?? '—'],
    ['Put / call', holding.putCall ?? '—'],
    ['Investment discretion', holding.investmentDiscretion ?? '—'],
    ['Other manager', holding.otherManager ?? '—'],
    ['Voting — sole', formatDecimal(holding.votingAuthority.sole)],
    ['Voting — shared', formatDecimal(holding.votingAuthority.shared)],
    ['Voting — none', formatDecimal(holding.votingAuthority.none)],
  ];

  return (
    <details style={STYLES.details}>
      <summary
        style={STYLES.detailsSummary}
        aria-label={`View details for ${holding.ticker ?? holding.issuerName}`}
      >
        View details
      </summary>
      <div style={STYLES.detailsBody}>
        <dl style={STYLES.detailsList}>
          {details.map(([label, value]) => (
            <div key={label} style={{ display: 'contents' }}>
              <dt style={STYLES.detailsTerm}>{label}</dt>
              <dd style={STYLES.detailsValue}>{value}</dd>
            </div>
          ))}
        </dl>
        <LegacyContextDetails holding={holding} />
      </div>
    </details>
  );
};

const HoldingValue = ({ holding }: { holding: Holding }) => {
  const estimatedValue = holding.legacyContext?.estimatedValue ?? null;
  const usesEstimatedValue =
    holding.reportedValue === null && estimatedValue !== null;
  const displayedValue = holding.reportedValue ?? estimatedValue;

  return (
    <>
      {formatMoney(displayedValue)}
      {usesEstimatedValue ? (
        <div style={STYLES.muted}>Estimated · unverified legacy data</div>
      ) : null}
    </>
  );
};

export const FirmDirectory = ({
  firms,
  totalCount = firms.length,
  onSelect,
}: {
  firms: FirmSummary[];
  totalCount?: number;
  onSelect(firm: FirmSummary): void;
}) => (
  <section style={STYLES.stack} aria-label="13F firms">
    <div style={STYLES.row}>
      <div>
        <h2 style={STYLES.title}>Firms</h2>
        <div style={STYLES.muted}>Select a firm to review its positions.</div>
      </div>
      <div style={STYLES.muted}>
        {formatCount(firms.length)} of {formatCount(totalCount)} firms shown
      </div>
    </div>
    {firms.length === 0 ? (
      <EmptyState>No firms match this view.</EmptyState>
    ) : (
      <div style={STYLES.tableWrap}>
        <table style={STYLES.table} aria-label="13F firms">
          <thead>
            <tr>
              <th scope="col" style={STYLES.th}>
                Firm
              </th>
              <th scope="col" style={STYLES.th}>
                Holdings date
              </th>
              <th scope="col" style={STYLES.th}>
                Filed
              </th>
              <th scope="col" style={STYLES.th}>
                Form
              </th>
              <th
                scope="col"
                style={{ ...STYLES.th, textAlign: 'right' }}
              >
                Positions
              </th>
              <th
                scope="col"
                style={{ ...STYLES.th, textAlign: 'right' }}
              >
                Reported value
              </th>
            </tr>
          </thead>
          <tbody>
            {firms.map((firm) => (
              <tr key={firm.id}>
                <td style={STYLES.td}>
                  <button
                    type="button"
                    style={STYLES.textButton}
                    onClick={() => onSelect(firm)}
                  >
                    {firm.legalName}
                  </button>
                  <div style={STYLES.muted}>
                    {firm.cik ? `CIK ${firm.cik}` : 'CIK not available'}
                  </div>
                </td>
                <td style={STYLES.td}>
                  {formatDate(firm.latestReportPeriod ?? firm.latestAsOfDate)}
                  <div style={{ marginTop: 6 }}>
                    <DateBasisBadge basis={firm.latestDateBasis} />
                  </div>
                </td>
                <td style={STYLES.td}>{formatDate(firm.latestFiledAt)}</td>
                <td style={STYLES.td}>{firm.latestFormType ?? '—'}</td>
                <td style={{ ...STYLES.td, textAlign: 'right' }}>
                  {formatCount(firm.positionCount)}
                </td>
                <td style={{ ...STYLES.td, textAlign: 'right' }}>
                  {formatMoney(firm.totalReportedValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

const HoldingsTable = ({
  holdings,
  onSelectSecurity,
  showFirm,
  onSelectFirm,
}: {
  holdings: Holding[];
  onSelectSecurity?(holding: Holding): void;
  showFirm?: boolean;
  onSelectFirm?(holding: Holding): void;
}) =>
  holdings.length === 0 ? (
    <EmptyState>No positions match this view.</EmptyState>
  ) : (
    <div style={STYLES.tableWrap}>
      <table
        style={STYLES.table}
        aria-label={showFirm ? 'Security holding firms' : 'Firm holdings'}
      >
        <thead>
          <tr>
            {showFirm ? <th scope="col" style={STYLES.th}>Firm</th> : null}
            <th scope="col" style={STYLES.th}>Ticker</th>
            <th scope="col" style={STYLES.th}>Issuer</th>
            <th scope="col" style={{ ...STYLES.th, textAlign: 'right' }}>
              Shares / principal
            </th>
            <th scope="col" style={{ ...STYLES.th, textAlign: 'right' }}>
              Value
            </th>
            <th scope="col" style={{ ...STYLES.th, textAlign: 'right' }}>
              Portfolio %
            </th>
            <th
              scope="col"
              style={{ ...STYLES.th, textAlign: 'right' }}
              aria-label="Change versus prior quarter"
            >
              Change
            </th>
            <th scope="col" style={STYLES.th}>As of</th>
            <th scope="col" style={STYLES.th}>Details</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => (
            <tr key={holding.id}>
              {showFirm ? (
                <td style={STYLES.td}>
                  <button
                    type="button"
                    style={STYLES.textButton}
                    onClick={() => onSelectFirm?.(holding)}
                  >
                    {holding.firmName}
                  </button>
                </td>
              ) : null}
              <td style={STYLES.td}>
                {onSelectSecurity ? (
                  <button
                    type="button"
                    style={STYLES.textButton}
                    onClick={() => onSelectSecurity(holding)}
                  >
                    {holding.ticker ?? '—'}
                  </button>
                ) : (
                  (holding.ticker ?? '—')
                )}
              </td>
              <td style={STYLES.td}>{holding.issuerName}</td>
              <td style={{ ...STYLES.td, textAlign: 'right' }}>
                {formatDecimal(holding.sharesOrPrincipal)}
                {holding.shareType ? ` ${holding.shareType}` : ''}
              </td>
              <td style={{ ...STYLES.td, textAlign: 'right' }}>
                <HoldingValue holding={holding} />
              </td>
              <td style={{ ...STYLES.td, textAlign: 'right' }}>
                {formatPercent(holding.portfolioPercent)}
              </td>
              <td style={{ ...STYLES.td, textAlign: 'right' }}>
                <div>Shares {formatChange(holding.quarterChange)}</div>
                <div style={STYLES.muted}>
                  Percent {formatPercentChange(holding.quarterChangePercent)}
                </div>
              </td>
              <td style={STYLES.td}>
                {formatDate(holding.asOfDate)}
                {holding.dateBasis === 'LEGACY_AS_OF_UNVERIFIED' ? (
                  <div style={{ marginTop: 6 }}>
                    <DateBasisBadge basis={holding.dateBasis} />
                  </div>
                ) : null}
              </td>
              <td style={STYLES.td}>
                <PositionDetails holding={holding} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

const FilingHistory = ({ firm }: { firm: FirmDetail }) => (
  <section style={STYLES.stack}>
    <h3 style={STYLES.sectionTitle}>Filing history</h3>
    {firm.filingHistory.length === 0 ? (
      <EmptyState>No earlier filings are available.</EmptyState>
    ) : (
      <div style={STYLES.tableWrap}>
        <table style={STYLES.table} aria-label="Filing history">
          <thead>
            <tr>
              <th scope="col" style={STYLES.th}>As of</th>
              <th scope="col" style={STYLES.th}>Filed</th>
              <th scope="col" style={STYLES.th}>Form</th>
              <th scope="col" style={STYLES.th}>Coverage</th>
              <th scope="col" style={{ ...STYLES.th, textAlign: 'right' }}>
                Positions
              </th>
              <th scope="col" style={{ ...STYLES.th, textAlign: 'right' }}>
                Reported value
              </th>
            </tr>
          </thead>
          <tbody>
            {firm.filingHistory.map((filing) => (
              <tr key={filing.id}>
                <td style={STYLES.td}>
                  {formatDate(filing.asOfDate)}
                  {filing.dateBasis === 'LEGACY_AS_OF_UNVERIFIED' ? (
                    <div style={{ marginTop: 6 }}>
                      <DateBasisBadge basis={filing.dateBasis} />
                    </div>
                  ) : null}
                </td>
                <td style={STYLES.td}>{formatDate(filing.filedAt)}</td>
                <td style={STYLES.td}>{filing.formType ?? '—'}</td>
                <td style={STYLES.td}>{filing.coverage ?? '—'}</td>
                <td style={{ ...STYLES.td, textAlign: 'right' }}>
                  {formatCount(filing.positionCount)}
                </td>
                <td style={{ ...STYLES.td, textAlign: 'right' }}>
                  {formatMoney(filing.totalReportedValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

export const FirmHoldings = ({
  firm,
  holdings,
  totalCount = holdings.length,
  asOfDate,
  order = 'value_desc',
  backLabel = 'All firms',
  onBack,
  onSelectSecurity,
  onOrderChange,
}: {
  firm: FirmDetail;
  holdings: Holding[];
  totalCount?: number;
  asOfDate?: string;
  order?: 'value_desc' | 'shares_desc' | 'ticker_asc';
  backLabel?: string;
  onBack(): void;
  onSelectSecurity?(holding: Holding): void;
  onOrderChange?(order: 'value_desc' | 'shares_desc' | 'ticker_asc'): void;
}) => {
  const selectedFiling = asOfDate
    ? firm.filingHistory.find((filing) => filing.asOfDate === asOfDate)
    : undefined;
  const holdingsAsOf = selectedFiling
    ? selectedFiling.asOfDate
    : firm.latestAsOfDate;
  const filedAt = selectedFiling ? selectedFiling.filedAt : firm.latestFiledAt;
  const formType = selectedFiling
    ? selectedFiling.formType
    : firm.latestFormType;
  const coverage = selectedFiling
    ? selectedFiling.coverage
    : firm.latestCoverage;
  const dateBasis = selectedFiling
    ? selectedFiling.dateBasis
    : firm.latestDateBasis;
  const positionCount = selectedFiling
    ? selectedFiling.positionCount
    : firm.positionCount;
  const totalReportedValue = selectedFiling
    ? selectedFiling.totalReportedValue
    : firm.totalReportedValue;
  const holdingsDateLabel =
    dateBasis === 'SEC_REPORT_PERIOD' ? 'SEC report period' : 'Holdings as of';

  return <article style={STYLES.stack}>
    <button type="button" style={STYLES.backButton} onClick={onBack}>
      ← {backLabel}
    </button>
    <div style={STYLES.card}>
      <div style={STYLES.row}>
        <div>
          <h2 style={STYLES.title}>{firm.legalName}</h2>
          <div style={STYLES.muted}>
            {firm.cik ? `CIK ${firm.cik}` : 'CIK not available'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={STYLES.strongMetric}>
            {formatMoney(totalReportedValue)}
          </div>
          <div style={STYLES.muted}>
            {formatCount(positionCount)} positions
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ ...STYLES.firmName, fontSize: 18 }}>
          {holdingsDateLabel} {formatDate(holdingsAsOf)}
        </div>
        <div style={STYLES.muted}>
          Filed {formatDate(filedAt)} · {formType ?? 'Form not available'}
          {coverage ? ` · ${coverage}` : ''}
        </div>
        <div style={{ marginTop: 8 }}>
          <DateBasisBadge basis={dateBasis} />
        </div>
      </div>
    </div>
    <section style={STYLES.stack}>
      <div style={STYLES.sectionControls}>
        <div>
          <h3 style={STYLES.sectionTitle}>Holdings</h3>
          <div style={STYLES.muted}>
            {formatCount(holdings.length)} of {formatCount(totalCount)}{' '}
            positions shown
          </div>
        </div>
        {onOrderChange ? (
          <label style={STYLES.muted}>
            Sort positions{' '}
            <select
              style={STYLES.select}
              value={order}
              aria-label="Sort firm holdings"
              onChange={(event) =>
                onOrderChange(event.target.value as typeof order)
              }
            >
              <option value="value_desc">Highest value</option>
              <option value="shares_desc">Most shares</option>
              <option value="ticker_asc">Ticker A–Z</option>
            </select>
          </label>
        ) : null}
      </div>
      <HoldingsTable
        holdings={holdings}
        onSelectSecurity={onSelectSecurity}
      />
    </section>
    <FilingHistory firm={firm} />
  </article>;
};

export const SecurityHolders = ({
  security,
  holdings,
  totalCount = holdings.length,
  onBack,
  onSelectFirm,
}: {
  security: SecuritySummary;
  holdings: Holding[];
  totalCount?: number;
  onBack(): void;
  onSelectFirm(holding: Holding): void;
}) => (
  <article style={STYLES.stack}>
    <button type="button" style={STYLES.backButton} onClick={onBack}>
      ← Back
    </button>
    <div style={STYLES.card}>
      <h2 style={STYLES.title}>
        Firms holding {security.ticker ?? security.issuerName}
      </h2>
      <div style={STYLES.muted}>
        {security.issuerName}
        {security.cusip ? ` · CUSIP ${security.cusip}` : ''}
      </div>
      <div style={{ ...STYLES.muted, marginTop: 8 }}>
        {formatCount(holdings.length)} of {formatCount(totalCount)} reported
        positions shown
      </div>
    </div>
    <HoldingsTable
      holdings={holdings}
      showFirm
      onSelectFirm={onSelectFirm}
    />
  </article>
);

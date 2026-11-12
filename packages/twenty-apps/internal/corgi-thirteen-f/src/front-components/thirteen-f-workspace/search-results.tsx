import {
  formatCount,
  formatDate,
  formatMoney,
} from 'src/front-components/thirteen-f-workspace/format';
import type {
  FirmSummary,
  SearchResults,
  SecuritySummary,
} from 'src/front-components/thirteen-f-workspace/types';

const STYLES = {
  stack: { display: 'flex', flexDirection: 'column', gap: 16 },
  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  heading: { margin: 0, fontSize: 14, color: '#141414' },
  result: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
    border: '1px solid #E4E7EC',
    borderRadius: 9,
    background: '#FFFFFF',
    padding: '12px 14px',
    textAlign: 'left',
    cursor: 'pointer',
  },
  name: { color: '#141414', fontSize: 14, fontWeight: 650 },
  detail: { color: '#667085', fontSize: 12 },
  details: { display: 'flex', flexDirection: 'column', gap: 3 },
  action: {
    alignSelf: 'center',
    color: '#5C3DF5',
    fontSize: 12,
    fontWeight: 650,
    whiteSpace: 'nowrap',
  },
  empty: { color: '#667085', fontSize: 13 },
} as const;

type FirmSearchResultProps = {
  firm: FirmSummary;
  onSelect(firm: FirmSummary): void;
};

const FirmSearchResult = ({ firm, onSelect }: FirmSearchResultProps) => (
  <button type="button" style={STYLES.result} onClick={() => onSelect(firm)}>
    <span style={STYLES.details}>
      <span style={STYLES.name}>{firm.legalName}</span>
      <span style={STYLES.detail}>
        {firm.cik ? `CIK ${firm.cik}` : 'CIK not available'} ·{' '}
        {formatCount(firm.positionCount)}{' '}
        {firm.positionCount === 1 ? 'position' : 'positions'} ·{' '}
        {formatMoney(firm.totalReportedValue)}
      </span>
      <span style={STYLES.detail}>
        Holdings {formatDate(firm.latestReportPeriod ?? firm.latestAsOfDate)} ·
        Filed {formatDate(firm.latestFiledAt)} · {firm.latestFormType ?? 'Form unavailable'}
      </span>
    </span>
    <span style={STYLES.action}>Review firm →</span>
  </button>
);

type SecuritySearchResultProps = {
  security: SecuritySummary;
  onSelect(security: SecuritySummary): void;
};

const SecuritySearchResult = ({
  security,
  onSelect,
}: SecuritySearchResultProps) => (
  <button
    type="button"
    style={STYLES.result}
    onClick={() => onSelect(security)}
  >
    <span style={STYLES.details}>
      <span style={STYLES.name}>{security.ticker ?? security.issuerName}</span>
      <span style={STYLES.detail}>{security.issuerName}</span>
      <span style={STYLES.detail}>
        {security.cusip ? `CUSIP ${security.cusip}` : 'CUSIP not available'}
      </span>
    </span>
    <span style={STYLES.action}>Find holding firms →</span>
  </button>
);

export const UnifiedSearchResults = ({
  results,
  onSelectFirm,
  onSelectSecurity,
}: {
  results: SearchResults;
  onSelectFirm(firm: FirmSummary): void;
  onSelectSecurity(security: SecuritySummary): void;
}) => {
  const isEmpty =
    results.firms.length === 0 && results.securities.length === 0;
  if (isEmpty) return <div style={STYLES.empty}>No matches found.</div>;

  return (
    <div style={STYLES.stack}>
      {results.firms.length > 0 ? (
        <section style={STYLES.section}>
          <h2 style={STYLES.heading}>
            Firms ({formatCount(results.firms.length)})
          </h2>
          {results.firms.map((firm) => (
            <FirmSearchResult
              key={firm.id}
              firm={firm}
              onSelect={onSelectFirm}
            />
          ))}
        </section>
      ) : null}
      {results.securities.length > 0 ? (
        <section style={STYLES.section}>
          <h2 style={STYLES.heading}>
            Securities ({formatCount(results.securities.length)})
          </h2>
          {results.securities.map((security) => (
            <SecuritySearchResult
              key={security.id}
              security={security}
              onSelect={onSelectSecurity}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
};

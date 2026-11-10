import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  FirmDirectory,
  FirmHoldings,
  SecurityHolders,
} from 'src/front-components/thirteen-f-workspace/views';
import { callThirteenFRoute } from 'src/front-components/thirteen-f-workspace/client';
import {
  formatDecimal,
  formatMoney,
} from 'src/front-components/thirteen-f-workspace/format';
import { parseWorkspaceQuery, serializeWorkspaceQuery } from 'src/front-components/thirteen-f-workspace/query-state';
import type {
  FirmDetail,
  Holding,
  SecuritySummary,
} from 'src/front-components/thirteen-f-workspace/types';

const holding: Holding = {
  id: 'holding-1',
  firmId: 'firm-1',
  firmName: 'Example Capital',
  crmCompanyId: 'company-1',
  filingId: 'filing-1',
  reportPeriod: null,
  asOfDate: '2026-09-30',
  dateBasis: 'LEGACY_AS_OF_UNVERIFIED',
  filedAt: '2026-11-09T18:30:00.000Z',
  formType: '13F-HR',
  coverage: 'FULL',
  securityId: 'security-1',
  issuerName: 'NVIDIA Corporation',
  titleOfClass: 'COM',
  cusip: '67066G104',
  ticker: 'NVDA',
  reportedValue: '125000000',
  sharesOrPrincipal: '800000',
  shareType: 'SH',
  putCall: null,
  investmentDiscretion: 'SOLE',
  otherManager: null,
  votingAuthority: { sole: '800000', shared: '0', none: '0' },
  portfolioPercent: '12.5',
  quarterChange: null,
  quarterChangePercent: null,
  legacyContext: null,
};

const firm: FirmDetail = {
  id: 'firm-1',
  legalName: 'Example Capital',
  cik: '0001234567',
  crmCompanyId: 'company-1',
  latestAsOfDate: '2026-09-30',
  latestDateBasis: 'LEGACY_AS_OF_UNVERIFIED',
  latestReportPeriod: null,
  latestFiledAt: '2026-11-09T18:30:00.000Z',
  latestFormType: '13F-HR',
  latestCoverage: 'FULL',
  positionCount: 1,
  totalReportedValue: '125000000',
  topHoldings: [holding],
  filingHistory: [
    {
      id: 'filing-1',
      asOfDate: '2026-09-30',
      dateBasis: 'LEGACY_AS_OF_UNVERIFIED',
      reportPeriod: null,
      filedAt: '2026-11-09T18:30:00.000Z',
      formType: '13F-HR',
      coverage: 'FULL',
      positionCount: 1,
      totalReportedValue: '125000000',
    },
  ],
};

describe('13F workspace journeys', () => {
  it('formats decimal strings without converting them to imprecise numbers', () => {
    expect(formatDecimal('900719925474099312345.6700')).toBe(
      '900,719,925,474,099,312,345.67',
    );
    expect(formatMoney('-900719925474099312345.6700')).toBe(
      '-$900,719,925,474,099,312,345.67',
    );
  });

  it('renders a firm-first directory by default', () => {
    const html = renderToStaticMarkup(
      <FirmDirectory firms={[firm]} onSelect={() => undefined} />,
    );

    expect(html).toContain('Example Capital');
    expect(html).toContain('CIK 0001234567');
    expect(html).toContain('As of Sep 30, 2026');
    expect(html).toContain('$125,000,000');
    expect(html).not.toMatch(/workbook|download|import|parser/i);
  });

  it('separates holdings date from filing metadata and flags legacy dates', () => {
    const html = renderToStaticMarkup(
      <FirmHoldings
        firm={firm}
        holdings={[holding]}
        onBack={() => undefined}
        onSelectSecurity={() => undefined}
      />,
    );

    expect(html).toContain('Holdings as of Sep 30, 2026');
    expect(html).toContain('Legacy date — SEC report period unverified');
    expect(html).toContain('Filed Nov 9, 2026');
    expect(html).toContain('NVIDIA Corporation');
    expect(html).toContain('67066G104');
    expect(html).toContain('12.5%');
  });

  it('uses the selected filing metadata when reviewing an earlier date', () => {
    const earlierFirm: FirmDetail = {
      ...firm,
      filingHistory: [
        ...firm.filingHistory,
        {
          id: 'filing-older',
          asOfDate: '2026-06-30',
          dateBasis: 'SEC_REPORT_PERIOD',
          reportPeriod: '2026-06-30',
          filedAt: '2026-08-14T12:00:00.000Z',
          formType: '13F-HR/A',
          coverage: 'FULL',
          positionCount: 90,
          totalReportedValue: '90000000',
        },
      ],
    };
    const html = renderToStaticMarkup(
      <FirmHoldings
        firm={earlierFirm}
        holdings={[]}
        asOfDate="2026-06-30"
        onBack={() => undefined}
        onSelectSecurity={() => undefined}
      />,
    );

    expect(html).toContain('Holdings as of Jun 30, 2026');
    expect(html).toContain('Filed Aug 14, 2026');
    expect(html).toContain('13F-HR/A');
    expect(html).toContain('$90,000,000');
  });

  it('renders reverse lookup results with every holding firm and date', () => {
    const security: SecuritySummary = {
      id: 'security-1',
      issuerName: 'NVIDIA Corporation',
      ticker: 'NVDA',
      cusip: '67066G104',
    };
    const html = renderToStaticMarkup(
      <SecurityHolders
        security={security}
        holdings={[holding]}
        onBack={() => undefined}
        onSelectFirm={() => undefined}
      />,
    );

    expect(html).toContain('Firms holding NVDA');
    expect(html).toContain('Example Capital');
    expect(html).toContain('Sep 30, 2026');
  });

  it('labels only comparable SEC changes as change versus the prior quarter', () => {
    const security: SecuritySummary = {
      id: 'security-1',
      issuerName: 'NVIDIA Corporation',
      ticker: 'NVDA',
      cusip: '67066G104',
    };
    const comparableHolding: Holding = {
      ...holding,
      dateBasis: 'SEC_REPORT_PERIOD',
      reportPeriod: '2026-09-30',
      quarterChange: '1200',
      quarterChangePercent: '0.15',
    };
    const html = renderToStaticMarkup(
      <SecurityHolders
        security={security}
        holdings={[comparableHolding]}
        onBack={() => undefined}
        onSelectFirm={() => undefined}
      />,
    );

    expect(html).toContain('Change vs prior quarter');
    expect(html).toContain('+1,200');
    expect(html).toContain('+0.15%');

    const legacyHtml = renderToStaticMarkup(
      <SecurityHolders
        security={security}
        holdings={[
          {
            ...holding,
            quarterChange: null,
            legacyContext: {
              portfolioName: 'Levered portfolio',
              targetTicker: 'NVDA',
              latestChange: '1200',
              ownershipPercent: '1.25',
              portfolioPercent: '12.5',
              estimatedValue: '125000000',
              changeValue: '1200',
              changePercent: '0.15',
            },
          },
        ]}
        onBack={() => undefined}
        onSelectFirm={() => undefined}
      />,
    );
    expect(legacyHtml).not.toContain('+1,200');
    expect(legacyHtml).toContain('Unverified legacy source');
    expect(legacyHtml).toContain('Target ticker: NVDA');
    expect(legacyHtml).toContain('Change value: 1,200');
  });

  it('preserves workspace selection in URL query state', () => {
    const serialized = serializeWorkspaceQuery({
      q: 'NVDA',
      asOfDate: '2026-09-30',
      firmId: 'firm-1',
      securityId: undefined,
    });

    expect(serialized).toBe('?q=NVDA&asOfDate=2026-09-30&firmId=firm-1');
    expect(parseWorkspaceQuery(serialized)).toEqual({
      q: 'NVDA',
      asOfDate: '2026-09-30',
      firmId: 'firm-1',
      securityId: undefined,
    });
  });

  it('calls only the authenticated Twenty function route from the browser', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new globalThis.Response(JSON.stringify({ managerCount: 4 }), {
        status: 200,
      });
    };

    await callThirteenFRoute(
      { action: 'summary' },
      {
        apiUrl: 'https://crm.example.test',
        accessToken: 'twenty-user-token',
        fetcher,
      },
    );

    expect(calls).toEqual([
      [
        'https://crm.example.test/s/thirteen-f/query',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer twenty-user-token',
            'Content-Type': 'application/json',
          },
        }),
      ],
    ]);
    expect(JSON.stringify(calls)).not.toContain('/api/internal/thirteen-f');
  });
});

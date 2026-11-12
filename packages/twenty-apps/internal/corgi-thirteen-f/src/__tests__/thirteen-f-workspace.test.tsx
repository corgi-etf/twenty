import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FirmDirectory,
  FirmHoldings,
  SecurityHolders,
} from 'src/front-components/thirteen-f-workspace/views';
import { UnifiedSearchResults } from 'src/front-components/thirteen-f-workspace/search-results';
import { callThirteenFRoute } from 'src/front-components/thirteen-f-workspace/client';
import {
  formatDecimal,
  formatMoney,
} from 'src/front-components/thirteen-f-workspace/format';
import {
  parseWorkspaceQuery,
  replaceBrowserWorkspaceQuery,
  serializeWorkspaceQuery,
} from 'src/front-components/thirteen-f-workspace/query-state';
import {
  periodOptionValue,
  secReportPeriods,
} from 'src/front-components/thirteen-f-workspace/periods';
import type {
  FirmDetail,
  Holding,
  SearchResults,
  SecuritySummary,
} from 'src/front-components/thirteen-f-workspace/types';

const holding: Holding = {
  id: 'holding-1',
  firmId: 'firm-1',
  firmName: 'Example Capital',
  crmCompanyId: 'company-1',
  filingId: 'filing-1',
  reportPeriod: '2026-09-30',
  asOfDate: '2026-09-30',
  dateBasis: 'SEC_REPORT_PERIOD',
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
};

const firm: FirmDetail = {
  id: 'firm-1',
  legalName: 'Example Capital',
  cik: '0001234567',
  crmCompanyId: 'company-1',
  latestAsOfDate: '2026-09-30',
  latestDateBasis: 'SEC_REPORT_PERIOD',
  latestReportPeriod: '2026-09-30',
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
      dateBasis: 'SEC_REPORT_PERIOD',
      reportPeriod: '2026-09-30',
      filedAt: '2026-11-09T18:30:00.000Z',
      formType: '13F-HR',
      coverage: 'FULL',
      positionCount: 1,
      totalReportedValue: '125000000',
    },
  ],
};

const workspaceSource = readFileSync(
  new URL(
    '../front-components/thirteen-f-workspace/workspace.tsx',
    import.meta.url,
  ),
  'utf8',
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('13F workspace journeys', () => {
  it('uses worker-safe timers in the FrontComponent runtime', () => {
    expect(workspaceSource).toContain('globalThis.setTimeout');
    expect(workspaceSource).toContain('globalThis.clearTimeout');
    expect(workspaceSource).not.toContain('window.setTimeout');
    expect(workspaceSource).not.toContain('window.clearTimeout');
  });

  it('keeps visible browser focus treatment on interactive controls', () => {
    expect(workspaceSource).not.toContain("outline: 'none'");
  });

  it('identifies SEC periods by both report date and date basis', () => {
    const periods = secReportPeriods([
      { asOfDate: '2026-09-30', dateBasis: 'LEGACY_AS_OF_UNVERIFIED' },
      { asOfDate: '2026-06-30', dateBasis: 'SEC_REPORT_PERIOD' },
      { asOfDate: '2026-09-30', dateBasis: 'SEC_REPORT_PERIOD' },
    ]);

    expect(periods).toEqual([
      { asOfDate: '2026-09-30', dateBasis: 'SEC_REPORT_PERIOD' },
      { asOfDate: '2026-06-30', dateBasis: 'SEC_REPORT_PERIOD' },
    ]);
    expect(periodOptionValue(periods[0])).toBe(
      '2026-09-30:SEC_REPORT_PERIOD',
    );
  });

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
      <FirmDirectory
        firms={[firm]}
        totalCount={267}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain('Example Capital');
    expect(html).toContain('CIK 0001234567');
    expect(html).toContain('Holdings date');
    expect(html).toContain('Sep 30, 2026');
    expect(html).toContain('1 of 267 firms shown');
    expect(html).toContain('Filed');
    expect(html).toContain('Form');
    expect(html).toContain('$125,000,000');
    expect(html).not.toMatch(/workbook|download|import|parser/i);
  });

  it('renders a native SEC holdings view without workbook-only context', () => {
    const html = renderToStaticMarkup(
      <FirmHoldings
        firm={firm}
        holdings={[holding]}
        onBack={() => undefined}
        onSelectSecurity={() => undefined}
        totalCount={125}
        totalReportedValue="125000000"
        asOfDate="2026-09-30"
        dateBasis="SEC_REPORT_PERIOD"
        order="value_desc"
        onOrderChange={() => undefined}
      />,
    );

    expect(html).toContain('SEC report period Sep 30, 2026');
    expect(html).toContain('1 of 125 positions shown');
    expect(html).toContain('aria-label="Sort firm holdings"');
    expect(html).toContain('Highest value');
    expect(html).toContain('Most shares');
    expect(html).toContain('Ticker A–Z');
    expect(html).toContain('Composed from the applicable SEC filing accessions');
    expect(html).toContain('NVIDIA Corporation');
    expect(html).toContain('67066G104');
    expect(html).toContain('12.5%');
    expect(html).toMatch(
      /Ticker<\/th>.*Issuer<\/th>.*Shares \/ principal<\/th>.*Value<\/th>.*Portfolio %<\/th>.*Change<\/th>.*As of<\/th>.*Details<\/th>/s,
    );
    expect(html).not.toMatch(/<th[^>]*>CUSIP<\/th>/);
    expect(html).not.toMatch(/<th[^>]*>Voting authority<\/th>/);
    expect(html).not.toMatch(/<th[^>]*>Legacy context<\/th>/);
    expect(html).toContain('<details');
    expect(html).toContain('View details');
    expect(html).toContain('aria-label="View details for NVDA"');
    expect(html).toContain('Security class');
    expect(html).toContain('Put / call');
    expect(html).toContain('Investment discretion');
    expect(html).toContain('Other manager');
    expect(html).toContain('Voting — sole');
    expect(html).toContain('Report period');
    expect(html).toContain('Coverage');
    expect(html).not.toMatch(/Legacy|Portfolio share|Target ticker/i);
  });

  it('never substitutes a workbook estimate for the SEC filed value', () => {
    const estimatedHolding = {
      ...holding,
      reportedValue: null,
      legacyContext: {
        portfolioName: 'Levered portfolio',
        targetTicker: 'NVDA',
        latestChange: null,
        ownershipPercent: null,
        portfolioPercent: '12.5',
        estimatedValue: '900719925474099312345.67',
        changeValue: null,
        changePercent: null,
      },
    } satisfies Holding & {
      legacyContext: {
        portfolioName: string;
        targetTicker: string;
        latestChange: null;
        ownershipPercent: null;
        portfolioPercent: string;
        estimatedValue: string;
        changeValue: null;
        changePercent: null;
      };
    };
    const estimatedHtml = renderToStaticMarkup(
      <FirmHoldings
        firm={firm}
        holdings={[estimatedHolding]}
        totalCount={1}
        totalReportedValue={null}
        asOfDate="2026-09-30"
        dateBasis="SEC_REPORT_PERIOD"
        onBack={() => undefined}
      />,
    );

    expect(estimatedHtml).not.toContain('$900,719,925,474,099,312,345.67');
    expect(estimatedHtml).not.toContain('Estimated · unverified legacy data');
    expect(estimatedHtml).not.toContain('Levered portfolio');

    const officialHtml = renderToStaticMarkup(
      <FirmHoldings
        firm={firm}
        holdings={[
          {
            ...estimatedHolding,
            reportedValue: '125000000',
          },
        ]}
        totalCount={1}
        totalReportedValue="125000000"
        asOfDate="2026-09-30"
        dateBasis="SEC_REPORT_PERIOD"
        onBack={() => undefined}
      />,
    );

    expect(officialHtml).toMatch(
      /<td[^>]*>\$125,000,000<\/td><td[^>]*>12\.5%<\/td>/,
    );
    expect(officialHtml).not.toContain('Estimated · unverified legacy data');
  });

  it('renders raw accession totals from the selected filing response', () => {
    const historicalFirmResponse = {
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
        {
          id: 'filing-with-null-total',
          asOfDate: '2026-03-31',
          dateBasis: 'SEC_REPORT_PERIOD',
          reportPeriod: '2026-03-31',
          filedAt: null,
          formType: null,
          coverage: null,
          positionCount: 0,
          totalReportedValue: null,
        },
      ],
    } satisfies FirmDetail;
    const populatedHtml = renderToStaticMarkup(
      <FirmHoldings
        firm={historicalFirmResponse}
        holdings={[]}
        totalCount={90}
        totalReportedValue="90000000"
        asOfDate="2026-06-30"
        dateBasis="SEC_REPORT_PERIOD"
        onBack={() => undefined}
        onSelectSecurity={() => undefined}
      />,
    );

    expect(populatedHtml).toContain('SEC report period Jun 30, 2026');
    expect(populatedHtml).toContain(
      'Composed from the applicable SEC filing accessions shown below.',
    );
    expect(populatedHtml).not.toContain('Filed Aug 14, 2026');
    expect(populatedHtml).toContain('13F-HR/A');
    expect(populatedHtml).toContain('90 positions');
    expect(populatedHtml).toContain('$90,000,000');

    const nullTotalHtml = renderToStaticMarkup(
      <FirmHoldings
        firm={historicalFirmResponse}
        holdings={[]}
        totalCount={0}
        totalReportedValue={null}
        asOfDate="2026-03-31"
        dateBasis="SEC_REPORT_PERIOD"
        onBack={() => undefined}
      />,
    );

    expect(nullTotalHtml).toContain('SEC report period Mar 31, 2026');
    expect(nullTotalHtml).not.toContain('Filed Not available');
    expect(nullTotalHtml).not.toContain('Form not available');
    expect(nullTotalHtml).toContain('0 positions');
    expect(nullTotalHtml).toMatch(/<div[^>]*>—<\/div><div[^>]*>0 positions<\/div>/);
  });

  it('separates composed base plus add-new totals from accession history', () => {
    const highTowerResponse = {
      ...firm,
      legalName: 'HIGHTOWER ADVISORS, LLC',
      cik: '0001462245',
      latestAsOfDate: '2026-06-30',
      latestDateBasis: 'SEC_REPORT_PERIOD',
      latestReportPeriod: '2026-06-30',
      latestFiledAt: '2026-08-14T12:00:00.000Z',
      latestFormType: '13F-HR/A',
      latestCoverage: 'ADD_NEW',
      positionCount: 1,
      totalReportedValue: '943081885',
      filingHistory: [
        {
          id: 'hightower-base',
          asOfDate: '2026-06-30',
          dateBasis: 'SEC_REPORT_PERIOD',
          reportPeriod: '2026-06-30',
          filedAt: '2026-08-13T12:00:00.000Z',
          formType: '13F-HR',
          coverage: 'FULL',
          positionCount: 3797,
          totalReportedValue: '103188726150',
        },
        {
          id: 'hightower-add-new',
          asOfDate: '2026-06-30',
          dateBasis: 'SEC_REPORT_PERIOD',
          reportPeriod: '2026-06-30',
          filedAt: '2026-08-14T12:00:00.000Z',
          formType: '13F-HR/A',
          coverage: 'ADD_NEW',
          positionCount: 1,
          totalReportedValue: '943081885',
        },
      ],
    } satisfies FirmDetail;
    const html = renderToStaticMarkup(
      <FirmHoldings
        firm={highTowerResponse}
        holdings={[]}
        totalCount={3798}
        totalReportedValue="104131808035"
        asOfDate="2026-06-30"
        dateBasis="SEC_REPORT_PERIOD"
        onBack={() => undefined}
      />,
    );

    expect(html).toContain('Effective portfolio');
    expect(html).toContain(
      'Composed from the applicable SEC filing accessions shown below.',
    );
    expect(html).not.toContain('Filed Aug 13, 2026');
    expect(html).not.toContain('Filed Aug 14, 2026');
    expect(html).toMatch(/\$104,131,808,035<\/div><div[^>]*>3,798 positions/);
    expect(html).toContain('Accession positions');
    expect(html).toContain('Accession reported value');
    expect(html).toMatch(
      /13F-HR\/A<\/td><td[^>]*>ADD_NEW<\/td><td[^>]*>1<\/td><td[^>]*>\$943,081,885<\/td>/,
    );
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
        totalCount={46}
        onBack={() => undefined}
        onSelectFirm={() => undefined}
      />,
    );

    expect(html).toContain('Firms holding NVDA');
    expect(html).toContain('Example Capital');
    expect(html).toContain('Sep 30, 2026');
    expect(html).toContain('1 of 46 reported positions shown');
    expect(html).toMatch(/Firm<\/th>.*Ticker<\/th>/s);
  });

  it('shows filing context for firm search and an explicit holder lookup action', () => {
    const searchResults: SearchResults = {
      firms: [firm],
      securities: [
        {
          id: 'security-1',
          issuerName: 'NVIDIA Corporation',
          ticker: 'NVDA',
          cusip: '67066G104',
        },
      ],
    };
    const html = renderToStaticMarkup(
      <UnifiedSearchResults
        results={searchResults}
        onSelectFirm={() => undefined}
        onSelectSecurity={() => undefined}
      />,
    );

    expect(html).toContain('Firms (1)');
    expect(html).toContain('1 position');
    expect(html).toContain('$125,000,000');
    expect(html).toContain('Filed Nov 9, 2026');
    expect(html).toContain('Review firm →');
    expect(html).toContain('Securities (1)');
    expect(html).toContain('Find holding firms →');
    expect(html).toContain('CUSIP 67066G104');
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

    expect(html).toContain('aria-label="Change versus prior quarter"');
    expect(html).toContain('+1,200');
    expect(html).toContain('+0.15%');

    const workbookEnrichedHolding = {
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
    };
    const legacyHtml = renderToStaticMarkup(
      <SecurityHolders
        security={security}
        holdings={[workbookEnrichedHolding]}
        onBack={() => undefined}
        onSelectFirm={() => undefined}
      />,
    );
    expect(legacyHtml).not.toContain('+1,200');
    expect(legacyHtml).not.toContain('Unverified legacy source');
    expect(legacyHtml).not.toContain('Target ticker');
    expect(legacyHtml).not.toContain('Change value');
  });

  it('preserves workspace selection in URL query state', () => {
    const serialized = serializeWorkspaceQuery({
      q: 'NVDA',
      asOfDate: '2026-09-30',
      dateBasis: 'SEC_REPORT_PERIOD',
      firmId: 'firm-1',
      securityId: undefined,
    });

    expect(serialized).toBe(
      '?q=NVDA&asOfDate=2026-09-30&dateBasis=SEC_REPORT_PERIOD&firmId=firm-1',
    );
    expect(parseWorkspaceQuery(serialized)).toEqual({
      q: 'NVDA',
      asOfDate: '2026-09-30',
      dateBasis: 'SEC_REPORT_PERIOD',
      firmId: 'firm-1',
      securityId: undefined,
    });
    expect(parseWorkspaceQuery('?dateBasis=WORKBOOK_AS_OF_DATE').dateBasis).toBe(
      undefined,
    );
  });

  it('does not require the History API in the FrontComponent runtime', () => {
    vi.stubGlobal('window', {
      location: {
        hash: '',
        pathname: '/objects/companies',
        search: '',
      },
    });

    expect(() =>
      replaceBrowserWorkspaceQuery({
        q: 'NVDA',
        asOfDate: '2026-09-30',
        dateBasis: 'SEC_REPORT_PERIOD',
        firmId: undefined,
        securityId: undefined,
      }),
    ).not.toThrow();
  });

  it('replaces workspace URL state when the History API is available', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      history: { replaceState },
      location: {
        hash: '#holdings',
        pathname: '/objects/companies',
        search: '?view=active&q=old',
      },
    });

    replaceBrowserWorkspaceQuery({
      q: 'NVDA',
      asOfDate: '2026-09-30',
      dateBasis: 'SEC_REPORT_PERIOD',
      firmId: undefined,
      securityId: undefined,
    });

    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/objects/companies?view=active&q=NVDA&asOfDate=2026-09-30&dateBasis=SEC_REPORT_PERIOD#holdings',
    );
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

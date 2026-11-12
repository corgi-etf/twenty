export type DateBasis = 'SEC_REPORT_PERIOD' | 'LEGACY_AS_OF_UNVERIFIED';

export type VotingAuthority = {
  sole: string | null;
  shared: string | null;
  none: string | null;
};

export type Holding = {
  id: string;
  firmId: string;
  firmName: string;
  crmCompanyId: string | null;
  filingId: string;
  reportPeriod: string | null;
  asOfDate: string;
  dateBasis: DateBasis;
  filedAt: string | null;
  formType: string | null;
  coverage: string | null;
  securityId: string;
  issuerName: string;
  titleOfClass: string | null;
  cusip: string | null;
  ticker: string | null;
  reportedValue: string | null;
  sharesOrPrincipal: string | null;
  shareType: string | null;
  putCall: string | null;
  investmentDiscretion: string | null;
  otherManager: string | null;
  votingAuthority: VotingAuthority;
  portfolioPercent: string | null;
  quarterChange: string | null;
  quarterChangePercent: string | null;
};

export type FilingSummary = {
  id: string;
  reportPeriod: string | null;
  asOfDate: string;
  dateBasis: DateBasis;
  filedAt: string | null;
  formType: string | null;
  coverage: string | null;
  positionCount: number;
  totalReportedValue: string | null;
};

export type FirmSummary = {
  id: string;
  legalName: string;
  cik: string | null;
  crmCompanyId: string | null;
  latestAsOfDate: string;
  latestDateBasis: DateBasis;
  latestReportPeriod: string | null;
  latestFiledAt: string | null;
  latestFormType: string | null;
  latestCoverage: string | null;
  positionCount: number;
  totalReportedValue: string | null;
  topHoldings: Holding[];
};

export type FirmDetail = FirmSummary & { filingHistory: FilingSummary[] };

export type SecuritySummary = {
  id: string;
  issuerName: string;
  ticker: string | null;
  cusip: string | null;
};

export type PageInfo = {
  endCursor?: string | null;
  hasNextPage?: boolean;
};

export type PageEnvelope<T> = {
  items: T[];
  pageInfo: PageInfo;
  totalCount: number;
};

export type HoldingsPageEnvelope = PageEnvelope<Holding> & {
  totalReportedValue: string | null;
};

export type SearchResults = {
  firms: FirmSummary[];
  securities: SecuritySummary[];
};

export type PeriodOption = { asOfDate: string; dateBasis: DateBasis };

export type CompanySummary = {
  thirteenFFirmId: string;
  firm: FirmSummary;
} | null;

export type HoldingsOrder = 'value_desc' | 'shares_desc' | 'ticker_asc';
export type HoldersMode = 'exact' | 'latest';

export type ThirteenFQuery =
  | { action: 'summary' }
  | { action: 'periods' }
  | {
      action: 'firms';
      q?: string;
      asOfDate?: string;
      dateBasis?: DateBasis;
      cursor?: string;
      limit?: number;
    }
  | { action: 'search'; q: string; dateBasis?: DateBasis; limit?: number }
  | { action: 'firm'; firmId: string }
  | {
      action: 'holdings';
      firmId: string;
      asOfDate?: string;
      dateBasis?: DateBasis;
      q?: string;
      cursor?: string;
      limit?: number;
      order?: HoldingsOrder;
    }
  | {
      action: 'holders';
      securityId: string;
      asOfDate?: string;
      dateBasis?: DateBasis;
      mode?: HoldersMode;
      cursor?: string;
      limit?: number;
    }
  | { action: 'company'; companyId: string };

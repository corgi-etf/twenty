export type IngestionSourceSystem = 'LEGACY_NORMALIZED' | 'SEC_EDGAR';
export type IngestionCoverage = 'PARTIAL' | 'COMPLETE';
export type FilingDateBasis = 'SEC_REPORT_PERIOD' | 'LEGACY_AS_OF_UNVERIFIED';

export type NormalizedManager = {
  sourceKey: string;
  legalName: string;
  cik?: string;
  aliases?: string[];
  crmCompanyId?: string;
};

export type NormalizedFiling = {
  sourceKey: string;
  managerSourceKey: string;
  reportPeriod?: string;
  legacyAsOfDate?: string;
  dateBasis: FilingDateBasis;
  filedAt?: string;
  formType?: '13F-HR' | '13F-HR/A' | '13F-NT' | '13F-NT/A';
  accessionNumber?: string;
  amendmentNumber?: string;
  isRestatement?: boolean;
  otherIncludedManagersCount?: number;
  informationTableEntryTotal?: number;
  informationTableValueTotal?: string;
  contentSha256?: string;
};

export type NormalizedSecurity = {
  sourceKey: string;
  issuerName?: string;
  titleOfClass?: string;
  cusip?: string;
  ticker?: string;
};

export type LegacyHoldingContext = {
  portfolioName?: string;
  targetTicker?: string;
  latestChange?: string;
  ownershipPercent?: string;
  portfolioPercent?: string;
  estimatedValue?: string;
  changeValue?: string;
  changePercent?: string;
};

export type NormalizedHolding = {
  rowKey: string;
  filingSourceKey: string;
  securitySourceKey: string;
  reportedValue?: string;
  sharesOrPrincipal?: string;
  shareType?: 'SH' | 'PRN';
  putCall?: 'PUT' | 'CALL';
  investmentDiscretion?: 'SOLE' | 'SHARED_DEFINED' | 'SHARED_OTHER';
  otherManager?: string;
  votingAuthority?: {
    sole?: string;
    shared?: string;
    none?: string;
  };
  legacyContext?: LegacyHoldingContext;
};

export type NormalizedDataset = {
  managers: NormalizedManager[];
  filings: NormalizedFiling[];
  securities: NormalizedSecurity[];
  holdings: NormalizedHolding[];
};

export type IngestionCounts = {
  managers: number;
  filings: number;
  securities: number;
  holdings: number;
};

export type IngestionExpectedCounts = IngestionCounts & { chunks: number };

export type CompletedIngestionReceipt = {
  batchId: string;
  batchKey: string;
  status: 'COMPLETED';
  receivedCounts: IngestionCounts;
  published: IngestionCounts;
  companyMappings?: Array<{
    crmCompanyId: string;
    thirteenFFirmId: string;
  }>;
  completedAt: string;
};

export interface NormalizedSourceAdapter<Input> {
  readonly sourceSystem: IngestionSourceSystem;
  readonly coverage: IngestionCoverage;
  normalize(input: Input): Promise<NormalizedDataset>;
}

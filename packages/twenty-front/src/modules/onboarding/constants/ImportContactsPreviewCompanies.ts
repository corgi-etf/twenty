export type ImportContactsPreviewCompany = {
  id: string;
  name: string;
  domainName: string;
};

// Placeholder preview only. Deliberately generic: naming real firms or real
// people here puts them in front of every user going through onboarding.
export const IMPORT_CONTACTS_PREVIEW_COMPANIES = [
  { id: 'northgate', name: 'Northgate Advisors', domainName: 'example.com' },
  { id: 'lakeshore', name: 'Lakeshore Capital', domainName: 'example.com' },
  { id: 'brightpath', name: 'Brightpath Wealth', domainName: 'example.com' },
  { id: 'cedarline', name: 'Cedarline Partners', domainName: 'example.com' },
  { id: 'harborview', name: 'Harborview Group', domainName: 'example.com' },
  { id: 'stonebridge', name: 'Stonebridge Advisory', domainName: 'example.com' },
] satisfies ImportContactsPreviewCompany[];

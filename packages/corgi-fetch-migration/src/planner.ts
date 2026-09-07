export type SourceCompany = {
  id: string;
  name: string;
  normalized_name?: string | null;
  website?: string | null;
};

export type SourceContact = {
  id: string;
  company_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

export type MinimalSnapshot = {
  companies: SourceCompany[];
  contacts: SourceContact[];
};

export type PlannedRecord = {
  objectPlural: string;
  sourceId: string;
  targetId: string;
  payload: Record<string, unknown>;
};

export type MigrationWarning = {
  code: string;
  sourceIds: string[];
};

export type MinimalPlan = {
  records: PlannedRecord[];
  warnings: MigrationWarning[];
};

export const buildPlan = (
  snapshot: MinimalSnapshot,
  options: { migrationRunId: string; hmacKey: string },
): MinimalPlan => {
  const companies = [...snapshot.companies].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const contacts = [...snapshot.contacts].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const warnings: MigrationWarning[] = [];

  const recordCollisions = (
    code: string,
    rows: readonly { id: string }[],
    key: (row: (typeof rows)[number]) => string,
  ) => {
    const groups = new Map<string, string[]>();

    for (const row of rows) {
      const value = key(row).trim().toLowerCase();

      if (value === '') continue;
      groups.set(value, [...(groups.get(value) ?? []), row.id]);
    }

    for (const ids of groups.values()) {
      if (ids.length > 1) {
        warnings.push({ code, sourceIds: [...ids].sort() });
      }
    }
  };

  recordCollisions(
    'COMPANY_NAME_COLLISION',
    companies,
    (row) => (row as SourceCompany).normalized_name ?? '',
  );

  const normalizeDomain = (website: string | null | undefined) => {
    if (!website?.trim()) return '';

    try {
      return new URL(
        website.includes('://') ? website : `https://${website}`,
      ).hostname
        .toLowerCase()
        .replace(/^www\./, '');
    } catch {
      return '';
    }
  };
  recordCollisions(
    'COMPANY_DOMAIN_COLLISION',
    companies,
    (row) => normalizeDomain((row as SourceCompany).website),
  );
  recordCollisions(
    'PERSON_EMAIL_COLLISION',
    contacts,
    (row) => (row as SourceContact).email ?? '',
  );

  const canonicalIdByValue = <T extends { id: string }>(
    rows: readonly T[],
    key: (row: T) => string,
  ) => {
    const result = new Map<string, string>();

    for (const row of rows) {
      const value = key(row).trim().toLowerCase();

      if (value && !result.has(value)) result.set(value, row.id);
    }

    return result;
  };
  const domainHolder = canonicalIdByValue(companies, (row) =>
    normalizeDomain(row.website),
  );
  const emailHolder = canonicalIdByValue(
    contacts,
    (row) => row.email?.trim().toLowerCase() ?? '',
  );

  const companyRecords: PlannedRecord[] = companies.map((row) => {
    const domain = normalizeDomain(row.website);
    const payload: Record<string, unknown> = {
      id: deterministicId('company', row.id),
      name: row.name,
      legacyFetchId: row.id,
      normalizedName: row.normalized_name ?? null,
      legacyWebsite: row.website ?? null,
      migrationRunId: options.migrationRunId,
      sourceRowHmac: sourceRowHmac(row, options.hmacKey),
    };

    if (domain && domainHolder.get(domain) === row.id) {
      payload.domainName = {
        primaryLinkLabel: domain,
        primaryLinkUrl: `https://${domain}`,
        secondaryLinks: [],
      };
    }

    return {
      objectPlural: 'companies',
      sourceId: row.id,
      targetId: payload.id as string,
      payload,
    };
  });
  const peopleRecords: PlannedRecord[] = contacts.map((row) => {
    const email = row.email?.trim().toLowerCase() ?? '';
    const payload: Record<string, unknown> = {
      id: deterministicId('person', row.id),
      name: {
        firstName: row.first_name ?? '',
        lastName: row.last_name ?? '',
      },
      companyId: deterministicId('company', row.company_id),
      legacyFetchId: row.id,
      legacyEmail: email || null,
      migrationRunId: options.migrationRunId,
      sourceRowHmac: sourceRowHmac(row, options.hmacKey),
    };

    if (email && emailHolder.get(email) === row.id) {
      payload.emails = { primaryEmail: email, additionalEmails: [] };
    }

    return {
      objectPlural: 'people',
      sourceId: row.id,
      targetId: payload.id as string,
      payload,
    };
  });

  warnings.sort((left, right) =>
    `${left.code}:${left.sourceIds.join(',')}`.localeCompare(
      `${right.code}:${right.sourceIds.join(',')}`,
    ),
  );

  return { records: [...companyRecords, ...peopleRecords], warnings };
};
import { deterministicId } from './deterministic-id.ts';
import { sourceRowHmac } from './integrity.ts';

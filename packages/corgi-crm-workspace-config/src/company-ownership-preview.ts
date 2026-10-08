import { createHash } from 'node:crypto';

export type OwnerCompany = {
  id: string;
  updatedAt: string;
  accountOwnerId?: string | null;
  accountOwner?: { id: string } | null;
  historicalOwnerId?: string | null;
  historicalOwner?: { id: string } | null;
};
export type OwnerWholesaler = {
  id: string;
  workspaceMemberId?: string | null;
  workspaceMember?: { id: string } | null;
};
export type Ownership = {
  id: string;
  companyId: string;
  wholesalerId: string;
  isPrimary: boolean;
  deletedAt?: string | null;
  updatedAt?: string;
};
export type CompanyOwnershipPreview = {
  companyCount: number;
  additions: Array<Ownership & { expectedCompanyUpdatedAt: string }>;
  review: Array<{
    companyId: string;
    severity: 'informational' | 'blocking';
    reason:
      | 'unmapped-account-owner'
      | 'ambiguous-account-owner'
      | 'missing-historical-owner'
      | 'different-legacy-owners'
      | 'multiple-primary-owners';
    legacyOwnerIds: string[];
  }>;
};

// Match UUID v5(URL, company:wholesaler) used by the interactive form.
export const companyOwnershipId = (
  companyId: string,
  wholesalerId: string,
): string => {
  const hash = createHash('sha1')
    .update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex'))
    .update(`${companyId}:${wholesalerId}`)
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const value = hash.subarray(0, 16).toString('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};

export const buildCompanyOwnershipPreview = ({
  companies,
  wholesalers,
  existingOwnerships,
  expectedCompanyCount,
}: {
  companies: OwnerCompany[];
  wholesalers: OwnerWholesaler[];
  existingOwnerships: Ownership[];
  expectedCompanyCount: number;
}): CompanyOwnershipPreview => {
  const distinctCompanyCount = new Set(companies.map(({ id }) => id)).size;
  if (
    companies.length !== expectedCompanyCount ||
    distinctCompanyCount !== expectedCompanyCount
  )
    // Report what was scanned. Every tool in this family takes the count as an
    // input and validates it, and none reports one, so a stale figure left the
    // operator with no way to discover the current value. These are counts of
    // company rows, not company data.
    throw new Error(
      `Ownership preview requires exact distinct company coverage: expected ${expectedCompanyCount}, scanned ${companies.length} rows with ${distinctCompanyCount} distinct ids`,
    );
  const additions: CompanyOwnershipPreview['additions'] = [];
  const review: CompanyOwnershipPreview['review'] = [];
  for (const company of companies) {
    if (
      !company.id ||
      !company.updatedAt ||
      Number.isNaN(Date.parse(company.updatedAt))
    )
      throw new Error('Invalid ownership source revision');
    const accountOwnerId = company.accountOwnerId ?? company.accountOwner?.id;
    const historicalOwnerId =
      company.historicalOwnerId ?? company.historicalOwner?.id;
    const candidates = accountOwnerId
      ? wholesalers.filter(
          (wholesaler) =>
            (wholesaler.workspaceMemberId ?? wholesaler.workspaceMember?.id) ===
            accountOwnerId,
        )
      : [];
    const report = (
      reason: CompanyOwnershipPreview['review'][number]['reason'],
    ) =>
      review.push({
        companyId: company.id,
        severity:
          reason === 'different-legacy-owners' ? 'informational' : 'blocking',
        reason,
        legacyOwnerIds: [accountOwnerId, historicalOwnerId].filter(
          (id): id is string => Boolean(id),
        ),
      });
    if (accountOwnerId && candidates.length === 0)
      report('unmapped-account-owner');
    if (candidates.length > 1) report('ambiguous-account-owner');
    const historicalOwner = wholesalers.find(
      ({ id }) => id === historicalOwnerId,
    );
    if (historicalOwnerId && !historicalOwner)
      report('missing-historical-owner');
    const accountOwner = candidates.length === 1 ? candidates[0] : undefined;
    if (
      historicalOwner &&
      accountOwner &&
      historicalOwner.id !== accountOwner.id
    )
      report('different-legacy-owners');
    const existing = existingOwnerships.filter(
      ({ companyId }) => companyId === company.id,
    );
    if (
      existing.filter(({ isPrimary, deletedAt }) => isPrimary && !deletedAt)
        .length > 1
    )
      report('multiple-primary-owners');
    const primary =
      existing.find(({ isPrimary, deletedAt }) => isPrimary && !deletedAt)
        ?.wholesalerId ??
      accountOwner?.id ??
      historicalOwner?.id;
    const desired = new Set(
      [historicalOwner?.id, accountOwner?.id].filter((id): id is string =>
        Boolean(id),
      ),
    );
    for (const wholesalerId of desired) {
      if (existing.some((ownership) => ownership.wholesalerId === wholesalerId))
        continue;
      additions.push({
        id: companyOwnershipId(company.id, wholesalerId),
        companyId: company.id,
        wholesalerId,
        isPrimary: wholesalerId === primary,
        expectedCompanyUpdatedAt: company.updatedAt,
      });
    }
  }
  return {
    companyCount: companies.length,
    additions: additions.sort((left, right) => left.id.localeCompare(right.id)),
    review,
  };
};

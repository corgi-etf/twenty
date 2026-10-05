import { createHash } from 'node:crypto';
import {
  buildCompanyOwnershipPreview,
  type OwnerCompany,
  type OwnerWholesaler,
  type Ownership,
} from './company-ownership-preview.ts';
import { WORKSPACE_CONFIG_APPROVED_ORIGIN } from './twenty-api.ts';
export type OwnershipSnapshot = {
  companies: OwnerCompany[];
  wholesalers: OwnerWholesaler[];
  existingOwnerships: Ownership[];
};
export type OwnershipManifest = {
  version: 1;
  origin: string;
  workspaceId: string;
  generatedAt: string;
  expectedCompanyCount: number;
  snapshot: OwnershipSnapshot;
  preview: ReturnType<typeof buildCompanyOwnershipPreview>;
};
export type OwnershipJournalEntry = {
  digest: string;
  kind: 'intent' | 'created' | 'confirmed' | 'ambiguous';
  ownershipId: string;
  at: string;
  record?: Ownership;
};
export type OwnershipBackfillApi = {
  readSnapshot(): Promise<OwnershipSnapshot>;
  readCompany(id: string): Promise<OwnerCompany>;
  readWholesalers(): Promise<OwnerWholesaler[]>;
  readOwnerships(companyId: string): Promise<Ownership[]>;
  createOwnership(
    input: Pick<Ownership, 'id' | 'companyId' | 'wholesalerId' | 'isPrimary'>,
  ): Promise<Ownership>;
};
export const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
export const ownershipManifestDigest = (manifest: unknown) =>
  createHash('sha256').update(stableJson(manifest)).digest('hex');
const rows = <T extends { id: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.id.localeCompare(b.id));
const equalRows = (left: Array<{ id: string }>, right: Array<{ id: string }>) =>
  stableJson(rows(left)) === stableJson(rows(right));
export const buildOwnershipManifest = ({
  snapshot,
  workspaceId,
  expectedCompanyCount,
}: {
  snapshot: OwnershipSnapshot;
  workspaceId: string;
  expectedCompanyCount: number;
}): OwnershipManifest => ({
  version: 1,
  origin: WORKSPACE_CONFIG_APPROVED_ORIGIN,
  workspaceId,
  generatedAt: new Date().toISOString(),
  expectedCompanyCount,
  snapshot: structuredClone(snapshot),
  preview: buildCompanyOwnershipPreview({ ...snapshot, expectedCompanyCount }),
});

// Guarded comparisons detect concurrent changes; they are not an atomic CAS.
export const applyOwnershipManifest = async ({
  api,
  manifest,
  reviewedDigest,
  workspaceId,
  journal,
  appendJournal,
}: {
  api: OwnershipBackfillApi;
  manifest: OwnershipManifest;
  reviewedDigest: string;
  workspaceId: string;
  journal: OwnershipJournalEntry[];
  appendJournal(entry: OwnershipJournalEntry): Promise<void>;
}) => {
  const digest = ownershipManifestDigest(manifest);
  if (!reviewedDigest || reviewedDigest !== digest)
    throw new Error('Reviewed manifest digest does not match');
  if (
    manifest.version !== 1 ||
    manifest.origin !== WORKSPACE_CONFIG_APPROVED_ORIGIN ||
    manifest.workspaceId !== workspaceId
  )
    throw new Error('Ownership manifest tenant mismatch');
  const rebuilt = buildCompanyOwnershipPreview({
    ...manifest.snapshot,
    expectedCompanyCount: manifest.expectedCompanyCount,
  });
  if (stableJson(rebuilt) !== stableJson(manifest.preview))
    throw new Error('Ownership manifest plan is inconsistent');
  if (rebuilt.review.length)
    throw new Error(
      'Ownership conflicts require manual review and a fresh preview',
    );
  if (journal.some((row) => row.digest !== digest || row.kind === 'ambiguous'))
    throw new Error(
      'Journal digest mismatch or ambiguous prior write requires manual review',
    );
  const created = new Map<string, Ownership>();
  for (const entry of journal) {
    if (!rebuilt.additions.some(({ id }) => id === entry.ownershipId))
      throw new Error('Journal contains an unexpected ownership');
    if (entry.kind === 'created' && entry.record)
      created.set(entry.ownershipId, entry.record);
  }
  for (const entry of journal.filter((row) => row.kind === 'intent')) {
    if (
      !journal.some(
        (row) =>
          row.ownershipId === entry.ownershipId && row.kind === 'confirmed',
      )
    )
      throw new Error('Unconfirmed prior insertion requires manual review');
  }
  const live = await api.readSnapshot();
  if (
    !equalRows(live.companies, manifest.snapshot.companies) ||
    !equalRows(live.wholesalers, manifest.snapshot.wholesalers) ||
    !equalRows(live.existingOwnerships, [
      ...manifest.snapshot.existingOwnerships,
      ...created.values(),
    ])
  )
    throw new Error('Ownership source changed since reviewed manifest');
  let inserted = 0;
  for (const planned of rebuilt.additions) {
    if (created.has(planned.id)) continue;
    const source = manifest.snapshot.companies.find(
      ({ id }) => id === planned.companyId,
    )!;
    const expectedJoins = () =>
      [...manifest.snapshot.existingOwnerships, ...created.values()].filter(
        ({ companyId }) => companyId === source.id,
      );
    const verify = async () => {
      if (stableJson(await api.readCompany(source.id)) !== stableJson(source))
        throw new Error('Company source changed before ownership insertion');
      if (
        !equalRows(await api.readWholesalers(), manifest.snapshot.wholesalers)
      )
        throw new Error('Wholesaler identity source changed');
      if (!equalRows(await api.readOwnerships(source.id), expectedJoins()))
        throw new Error('Company junctions changed, including deleted links');
    };
    await verify();
    const append = (kind: OwnershipJournalEntry['kind'], record?: Ownership) =>
      appendJournal({
        digest,
        kind,
        ownershipId: planned.id,
        at: new Date().toISOString(),
        ...(record ? { record } : {}),
      });
    await append('intent');
    const { id, companyId, wholesalerId, isPrimary } = planned;
    const record = await api.createOwnership({
      id,
      companyId,
      wholesalerId,
      isPrimary,
    });
    await append('created', record);
    created.set(id, record);
    try {
      if (
        record.id !== id ||
        record.companyId !== companyId ||
        record.wholesalerId !== wholesalerId ||
        record.isPrimary !== isPrimary ||
        record.deletedAt
      )
        throw new Error('Unexpected insertion result');
      await verify();
    } catch {
      await append('ambiguous', record);
      throw new Error(
        `Ownership ${id}: ambiguous post-check; retained inserted row and stopped. Review journal before continuing.`,
      );
    }
    await append('confirmed', record);
    inserted++;
  }
  return { inserted, alreadyApplied: created.size - inserted };
};

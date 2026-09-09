import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const HASH_PATTERN = /^[a-f0-9]{64}$/;

type MetadataCleanupOperation = {
  key?: unknown;
};

type MetadataCleanupJournal = {
  schemaVersion?: unknown;
  status?: unknown;
  operations?: unknown;
  completedOperationKeys?: unknown;
  preflightEvidence?: {
    companyCount?: unknown;
    rowCoverageHash?: unknown;
    businessContentHash?: unknown;
  };
};

const assertCompletedOperationCoverage = (
  journal: MetadataCleanupJournal,
): void => {
  if (
    !Array.isArray(journal.operations) ||
    !Array.isArray(journal.completedOperationKeys)
  ) {
    throw new Error(
      'Metadata cleanup prerequisite operation coverage is invalid',
    );
  }

  const operationKeys = journal.operations.map((operation) => {
    if (
      !operation ||
      typeof operation !== 'object' ||
      Array.isArray(operation) ||
      typeof (operation as MetadataCleanupOperation).key !== 'string' ||
      (operation as MetadataCleanupOperation).key === ''
    ) {
      throw new Error(
        'Metadata cleanup prerequisite operation coverage is invalid',
      );
    }

    return (operation as { key: string }).key;
  });
  const completedOperationKeys = journal.completedOperationKeys;
  if (
    completedOperationKeys.some(
      (key) => typeof key !== 'string' || key.length === 0,
    ) ||
    new Set(operationKeys).size !== operationKeys.length ||
    new Set(completedOperationKeys).size !== completedOperationKeys.length ||
    operationKeys.length !== completedOperationKeys.length
  ) {
    throw new Error(
      'Metadata cleanup prerequisite operation coverage is invalid',
    );
  }

  const completedKeySet = new Set(completedOperationKeys);
  if (operationKeys.some((key) => !completedKeySet.has(key))) {
    throw new Error(
      'Metadata cleanup prerequisite operation coverage is incomplete',
    );
  }
};

export const assertCompletedMetadataCleanup = async ({
  journalPath,
  expectedCompanyCount,
  expectedRowCoverageHash,
  expectedBusinessContentHash,
}: {
  journalPath: string;
  expectedCompanyCount: number;
  expectedRowCoverageHash: string;
  expectedBusinessContentHash: string;
}): Promise<void> => {
  if (!Number.isSafeInteger(expectedCompanyCount) || expectedCompanyCount < 1) {
    throw new Error('Metadata cleanup prerequisite company count is invalid');
  }
  if (
    !HASH_PATTERN.test(expectedRowCoverageHash) ||
    !HASH_PATTERN.test(expectedBusinessContentHash)
  ) {
    throw new Error('Metadata cleanup prerequisite hashes are invalid');
  }
  let envelope: { sha256?: unknown; journal?: unknown };
  try {
    envelope = JSON.parse(
      await readFile(journalPath, 'utf8'),
    ) as typeof envelope;
  } catch {
    throw new Error('Metadata cleanup prerequisite artifact is invalid JSON');
  }
  const journal = envelope.journal as MetadataCleanupJournal | undefined;
  const serializedJournal = JSON.stringify(journal);
  const actualHash = createHash('sha256')
    .update(serializedJournal, 'utf8')
    .digest('hex');
  if (envelope.sha256 !== actualHash) {
    throw new Error('Metadata cleanup prerequisite failed its integrity check');
  }
  if (
    journal?.schemaVersion !== 1 ||
    journal.status !== 'complete' ||
    journal.preflightEvidence?.companyCount !== expectedCompanyCount ||
    journal.preflightEvidence.rowCoverageHash !== expectedRowCoverageHash ||
    journal.preflightEvidence.businessContentHash !==
      expectedBusinessContentHash
  ) {
    throw new Error(
      'Metadata cleanup prerequisite is not complete and approved',
    );
  }

  assertCompletedOperationCoverage(journal);
};

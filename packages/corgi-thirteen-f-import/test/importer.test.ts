import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  runConvergentImport,
  type CrmFileValue,
  type DownloadedSourceFile,
  type FilingCreateInput,
  type ThirteenFFilingRecord,
  type ThirteenFImportApi,
  type UploadReservation,
} from '../src/importer.ts';

const source = (
  overrides: Partial<DownloadedSourceFile> = {},
): DownloadedSourceFile => {
  const bytes = overrides.bytes ?? Buffer.from('approved source bytes');

  return {
    id: randomUUID(),
    name: 'AAAB competitor holders.xlsx',
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: bytes.byteLength,
    sourceVersionId: 'version-1',
    updatedAt: '2026-11-08T12:00:00.000Z',
    ticker: 'AAAB',
    bytes,
    contentSha256: createHash('sha256').update(bytes).digest('hex'),
    ...overrides,
  };
};

class MemoryApi implements ThirteenFImportApi {
  records: ThirteenFFilingRecord[] = [];
  events: string[] = [];
  reservations = new Map<string, UploadReservation>();
  uploaded = new Map<string, Uint8Array>();
  pendingAttachOutcomes = new Map<
    string,
    Array<'attached' | 'pending' | 'missing'>
  >();
  loseNextCreateResponse = false;

  async listFilings(): Promise<ThirteenFFilingRecord[]> {
    return structuredClone(this.records);
  }

  async createFiling(data: FilingCreateInput): Promise<ThirteenFFilingRecord> {
    this.events.push(`create-record:${String(data.sourceNodeId)}`);
    const record = { id: randomUUID(), ...structuredClone(data) };
    this.records.push(record);
    if (this.loseNextCreateResponse) {
      this.loseNextCreateResponse = false;
      throw new Error('simulated response loss');
    }

    return structuredClone(record);
  }

  async patchFiling(
    recordId: string,
    data: Partial<FilingCreateInput>,
  ): Promise<void> {
    this.events.push(
      data.importPendingFileId
        ? `checkpoint:${data.importPendingFileId}`
        : `patch-record:${recordId}`,
    );
    const record = this.records.find(({ id }) => id === recordId);
    assert.ok(record);
    Object.assign(record, structuredClone(data));
  }

  async createFileUpload(input: {
    filename: string;
    sizeBytes: number;
  }): Promise<UploadReservation> {
    const fileId = randomUUID();
    const reservation = {
      fileId,
      uploadUrl: `https://crm.corgiinvest.com/file-upload/${fileId}?token=masked`,
      contentType: 'application/octet-stream',
      expiresAt: '2026-11-09T18:05:00.000Z',
    };
    this.events.push(`reserve:${input.filename}:${input.sizeBytes}:${fileId}`);
    this.reservations.set(fileId, reservation);

    return reservation;
  }

  async putFile(
    reservation: UploadReservation,
    bytes: Uint8Array,
  ): Promise<void> {
    this.events.push(`put:${reservation.fileId}`);
    this.uploaded.set(reservation.fileId, Uint8Array.from(bytes));
  }

  async completeFileUpload(
    fileId: string,
  ): Promise<'ready' | 'incomplete' | 'unknown'> {
    this.events.push(`complete:${fileId}`);

    return this.uploaded.has(fileId) ? 'ready' : 'incomplete';
  }

  async attachFile({
    recordId,
    fileId,
    label,
  }: {
    recordId: string;
    fileId: string;
    label: string;
  }): Promise<'attached' | 'pending' | 'missing'> {
    this.events.push(`attach:${fileId}`);
    const configured = this.pendingAttachOutcomes.get(fileId);
    const outcome = configured?.shift();
    if (outcome && outcome !== 'attached') return outcome;
    if (!this.uploaded.has(fileId)) return 'pending';
    const record = this.records.find(({ id }) => id === recordId);
    assert.ok(record);
    record.file = [
      {
        fileId,
        label,
        extension: label.toLowerCase().endsWith('.pdf') ? '.pdf' : '.xlsx',
        url: `https://crm.corgiinvest.com/file/FilesField/${fileId}?token=masked`,
      },
    ];
    record.importPendingFileId = null;

    return 'attached';
  }

  async downloadAttachedFile(file: CrmFileValue): Promise<Uint8Array> {
    this.events.push(`verify:${file.fileId}`);
    const bytes = this.uploaded.get(file.fileId);
    assert.ok(bytes);

    return Uint8Array.from(bytes);
  }
}

const filingFor = (
  input: DownloadedSourceFile,
  overrides: Partial<ThirteenFFilingRecord> = {},
): ThirteenFFilingRecord => ({
  id: randomUUID(),
  name: input.name,
  ticker: input.ticker,
  managerName: null,
  reportPeriod: null,
  file: [],
  sourceDriveId: 'c02c52ee-2c33-4384-adf9-51d4c6c1f202',
  sourceNodeId: input.id,
  sourceVersionId: input.sourceVersionId,
  sourceUpdatedAt: input.updatedAt,
  sourceLink: {
    primaryLinkUrl:
      'https://admin.corgiinvest.com/files/c02c52ee-2c33-4384-adf9-51d4c6c1f202/folders/c4d99acb-e7a6-4322-8a11-ae17ff3b3ea2',
    primaryLinkLabel: 'Tony Sales folder',
    secondaryLinks: [],
  },
  importPendingFileId: null,
  ...overrides,
});

test('creates the record before upload and checkpoints the file ID before PUT', async () => {
  const api = new MemoryApi();
  const input = source();

  const result = await runConvergentImport(api, [input]);

  assert.deepEqual(result, {
    created: 1,
    metadataUpdated: 0,
    repaired: 1,
    skipped: 0,
    verified: 1,
  });
  const createIndex = api.events.findIndex((event) =>
    event.startsWith('create-record:'),
  );
  const checkpointIndex = api.events.findIndex((event) =>
    event.startsWith('checkpoint:'),
  );
  const putIndex = api.events.findIndex((event) => event.startsWith('put:'));
  assert.ok(createIndex >= 0 && createIndex < checkpointIndex);
  assert.ok(checkpointIndex < putIndex);
  assert.equal(api.records[0]?.file?.length, 1);
  assert.equal(api.records[0]?.importPendingFileId, null);
});

test('stores a local master attachment without claiming Tony Drive provenance', async () => {
  const api = new MemoryApi();
  const input = source({ sourceDriveId: null, sourceLink: null, ticker: null });

  await runConvergentImport(api, [input]);

  assert.equal(api.records[0]?.sourceDriveId, null);
  assert.equal(api.records[0]?.sourceLink, null);
  assert.equal(api.records[0]?.ticker, null);
});

test('recovers a lost record-create response without creating a duplicate', async () => {
  const api = new MemoryApi();
  api.loseNextCreateResponse = true;

  const result = await runConvergentImport(api, [source()]);

  assert.equal(result.created, 1);
  assert.equal(api.records.length, 1);
});

test('attaches an already completed checkpoint without reserving another upload', async () => {
  const api = new MemoryApi();
  const input = source();
  const fileId = randomUUID();
  api.uploaded.set(fileId, Uint8Array.from(input.bytes));
  api.records.push(filingFor(input, { importPendingFileId: fileId }));

  const result = await runConvergentImport(api, [input]);

  assert.equal(result.created, 0);
  assert.equal(result.repaired, 1);
  assert.equal(
    api.events.some((event) => event.startsWith('reserve:')),
    false,
  );
  assert.equal(api.records[0]?.file?.[0]?.fileId, fileId);
});

test('replaces only an explicitly incomplete pending upload and retains its record', async () => {
  const api = new MemoryApi();
  const input = source();
  const staleFileId = randomUUID();
  api.records.push(
    filingFor(input, { importPendingFileId: staleFileId, file: [] }),
  );
  api.pendingAttachOutcomes.set(staleFileId, ['pending']);

  const result = await runConvergentImport(api, [input]);

  assert.equal(result.created, 0);
  assert.equal(result.repaired, 1);
  assert.equal(api.records.length, 1);
  assert.notEqual(api.records[0]?.file?.[0]?.fileId, staleFileId);
  assert.equal(api.events.includes(`complete:${staleFileId}`), true);
});

test('verifies an attached file without mutating the record', async () => {
  const api = new MemoryApi();
  const input = source();
  const fileId = randomUUID();
  api.uploaded.set(fileId, Uint8Array.from(input.bytes));
  api.records.push(
    filingFor(input, {
      file: [
        {
          fileId,
          label: input.name,
          url: `https://crm.corgiinvest.com/file/FilesField/${fileId}?token=masked`,
        },
      ],
    }),
  );

  const result = await runConvergentImport(api, [input]);

  assert.equal(result.skipped, 1);
  assert.equal(result.verified, 1);
  assert.deepEqual(
    api.events.filter((event) => event !== `verify:${fileId}`),
    [],
  );
});

test('accepts Twenty empty-string serialization for nullable fields', async () => {
  const api = new MemoryApi();
  const input = source({
    name: 'Corgi_FI_Consolidated_Leads_20261104.xlsx',
    ticker: null,
  });
  const fileId = randomUUID();
  api.uploaded.set(fileId, Uint8Array.from(input.bytes));
  api.records.push(
    filingFor(input, {
      ticker: '',
      importPendingFileId: '',
      file: [
        {
          fileId,
          label: input.name,
          url: `https://crm.corgiinvest.com/file/files-field/${fileId}?token=masked`,
        },
      ],
    }),
  );

  const result = await runConvergentImport(api, [input]);

  assert.equal(result.metadataUpdated, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.verified, 1);
  assert.deepEqual(api.events, [`verify:${fileId}`]);
});

test('repairs safe metadata drift without overwriting manually curated fields', async () => {
  const api = new MemoryApi();
  const input = source();
  const fileId = randomUUID();
  api.uploaded.set(fileId, Uint8Array.from(input.bytes));
  api.records.push(
    filingFor(input, {
      name: 'old.xlsx',
      managerName: 'Curated manager',
      reportPeriod: '2026-06-30',
      file: [{ fileId, label: input.name }],
    }),
  );

  const result = await runConvergentImport(api, [input]);

  assert.equal(result.metadataUpdated, 1);
  assert.equal(api.records[0]?.name, input.name);
  assert.equal(api.records[0]?.managerName, 'Curated manager');
  assert.equal(api.records[0]?.reportPeriod, '2026-06-30');
});

test('fails closed on duplicate nodes, changed versions, and mismatched bytes', async () => {
  const input = source();
  const cases = [
    () => {
      const api = new MemoryApi();
      api.records.push(filingFor(input), filingFor(input));
      return api;
    },
    () => {
      const api = new MemoryApi();
      api.records.push(filingFor(input, { sourceVersionId: 'changed' }));
      return api;
    },
    () => {
      const api = new MemoryApi();
      const fileId = randomUUID();
      api.uploaded.set(fileId, Buffer.from('wrong bytes'));
      api.records.push(
        filingFor(input, { file: [{ fileId, label: input.name }] }),
      );
      return api;
    },
  ];

  for (const createApi of cases) {
    await assert.rejects(
      runConvergentImport(createApi(), [input]),
      /conflict|verification/,
    );
  }
});

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { utils, write } from 'xlsx-ugnis';

import {
  runHoldingsImport,
  type ExistingImportRun,
  type HoldingsImportApi,
} from '../src/holdings-importer.ts';
import {
  safelyParseHoldingsSource,
  type HoldingsSource,
} from '../src/holdings-parser.ts';

const HEADERS = [
  'Holder Name',
  'Portfolio Name',
  'Position',
  'Latest Chg',
  'Filing Date',
  'Source',
  '% Out',
  '% Portfolio',
  'Insider Status',
  'Institution Type',
  'Metro Area',
  'Country',
  null,
  'AUM to attack',
  null,
  'Managing Director/Partner',
  'CIO if otherwise',
  'MD Phone',
  'CIO Phone',
  'MD email',
  'CIO email',
  'Firm AUM',
  'Website',
  'Firm Main Phone',
  'Firm General Email',
  'Notes',
  'Source',
];

const MASTER_HEADERS = [
  'Competitor',
  'Our fund',
  'Holder Name',
  'Portfolio Name',
  'Institution Type',
  'Est. 13F book $',
  'Book estimate',
  'Metro Area',
  'Country',
  'Shares',
  'Est $ value',
  '% of fund shares out',
  '% of holder portfolio',
  'Move',
  'Share change',
  'Change $',
  'Change %',
  'Filing Date',
  'Source',
  'Not a buyer',
  'Category',
  'Their mgmt fee %',
  'Our mgmt fee %',
  'Fee gap (bp)',
  'Annual fee saving $',
  'Fund turnover %/day',
  'Fund return since 6/30',
  'Fund return YTD',
  'Est. return on position',
  'Est. $ gain/loss',
  'Entry basis',
  'Manager research / DD contact',
  'Title',
  'Owner (wholesaler)',
  'Status',
  'Notes',
];

const digest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

const source = (
  name: string,
  bytes: Uint8Array,
  filingId = randomUUID(),
): HoldingsSource => ({
  filingId,
  sourceNodeId: randomUUID(),
  sourceVersionId: 'version-1',
  sourceFileName: name,
  contentSha256: digest(bytes),
  bytes,
  file: { fileId: randomUUID(), label: name },
});

const workbookBytes = (): Uint8Array => {
  const workbook = utils.book_new();
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([
      HEADERS,
      [
        'Acme Advisors',
        'Income',
        125,
        10,
        46203,
        '13F',
        1.2,
        0.5,
        'N-P',
        'Investment Advisor',
        'Chicago',
        'US',
        null,
        null,
        null,
        'Jane Doe',
        'John Doe',
        null,
        null,
        null,
        null,
        1_000_000,
        'https://example.com',
        null,
        null,
        null,
        'SEC',
      ],
    ]),
    'AGG',
  );

  return new Uint8Array(write(workbook, { type: 'buffer', bookType: 'xlsx' }));
};

const combinedWorkbookBytes = (): Uint8Array => {
  const workbook = utils.book_new();
  const rows = [
    ['Title'],
    ['Description'],
    [],
    MASTER_HEADERS,
    [
      'AGG',
      'XA',
      'Acme Advisors',
      'Income',
      'Investment Advisor',
      1_000_000,
      'ok',
      'Chicago',
      'US',
      999,
      10_000,
      1.2,
      0.5,
      'added',
      10,
      1_000,
      11.1,
      46203,
      '13F',
    ],
  ];
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(rows),
    'Thematic - All holders',
  );
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([rows[0], rows[1], rows[2], rows[3]]),
    'Levered - All holders',
  );

  return new Uint8Array(write(workbook, { type: 'buffer', bookType: 'xlsx' }));
};

class MemoryHoldingsApi implements HoldingsImportApi {
  runs = new Map<string, ExistingImportRun>();
  events: string[] = [];
  importRunRecords: Record<string, unknown>[] = [];
  holdingRecords: Record<string, unknown>[] = [];
  oldIds = [randomUUID()];
  globalDuplicateIds: string[] = [];

  async findImportRun(importKey: string) {
    return this.runs.get(importKey);
  }

  async listHoldingIds(filter: string) {
    if (filter.includes('positionKey[in]')) {
      this.events.push('list-duplicate-positions');

      return [...this.globalDuplicateIds];
    }
    this.events.push('list-old');

    return [...this.oldIds];
  }

  async upsertBatch(
    objectPlural: string,
    records: readonly Record<string, unknown>[],
  ) {
    this.events.push(`upsert:${objectPlural}:${records.length}`);
    if (objectPlural === 'thirteenFImportRuns') {
      for (const record of records) {
        this.importRunRecords.push({ ...record });
        this.runs.set(String(record.importKey), {
          id: String(record.id),
          importKey: String(record.importKey),
          status: record.status as ExistingImportRun['status'],
          contentSha256: String(record.contentSha256),
          parserVersion: String(record.parserVersion),
        });
      }
    }
    if (objectPlural === 'thirteenFHoldings') {
      this.holdingRecords.push(...records.map((record) => ({ ...record })));
    }
  }

  async patchMany(
    _objectPlural: string,
    filter: string,
    data: Record<string, unknown>,
  ) {
    const match = filter.match(/^id\[in\]:(.+)$/);
    assert.ok(match);
    const ids = JSON.parse(match[1]!) as string[];
    this.events.push(`patch:${String(data.isActive)}:${ids.join(',')}`);

    return ids.length;
  }
}

test('stages, reconciles, promotes, supersedes, and no-ops deterministically', async () => {
  const api = new MemoryHoldingsApi();
  const holdings = source('AGGB competitor holders.xlsx', workbookBytes());
  const ancillary = source(
    'Corgi_FI_RIA_Priority_Ranking_20261022.xlsx',
    Buffer.from('not parsed'),
  );

  const first = await runHoldingsImport(api, [holdings, ancillary]);

  assert.deepEqual(first, {
    schemaVersion: 2,
    sourceFiles: 2,
    supportedFiles: 1,
    unsupportedFiles: 1,
    acceptedRows: 1,
    rejectedRows: 0,
    ignoredRows: 0,
    managerRecords: 1,
    securityRecords: 1,
    holdingRecords: 1,
    importRuns: 2,
    importErrors: 1,
    noOpFiles: 0,
    supersededRows: 1,
  });
  const activateIndex = api.events.findIndex((event) =>
    event.startsWith('patch:true:'),
  );
  const listIndex = api.events.indexOf('list-old');
  const supersedeIndex = api.events.findIndex((event) =>
    event.startsWith('patch:false:'),
  );
  assert.ok(activateIndex >= 0 && activateIndex < listIndex);
  assert.ok(listIndex < supersedeIndex);
  assert.equal(
    api.events.filter((event) => event.startsWith('upsert:thirteenFHoldings'))
      .length,
    1,
  );

  const eventCount = api.events.length;
  const second = await runHoldingsImport(api, [ancillary, holdings]);
  assert.equal(second.noOpFiles, 2);
  assert.equal(api.events.length, eventCount);
});

test('a renamed source attachment cannot no-op with a stale target ticker', async () => {
  const api = new MemoryHoldingsApi();
  const original = source('AGGB competitor holders.xlsx', workbookBytes());
  const renamed: HoldingsSource = {
    ...original,
    sourceFileName: 'BBBB competitor holders.xlsx',
    file: { ...original.file, label: 'BBBB competitor holders.xlsx' },
  };

  await runHoldingsImport(api, [original]);
  const receipt = await runHoldingsImport(api, [renamed]);

  assert.equal(receipt.noOpFiles, 0);
  assert.equal(api.runs.size, 2);
});

test('combined master wins cross-source economic positions and deactivates stale duplicates', async () => {
  const api = new MemoryHoldingsApi();
  api.oldIds = [];
  const staleDuplicateId = randomUUID();
  api.globalDuplicateIds = [staleDuplicateId];
  const perTarget = source('AGGB competitor holders.xlsx', workbookBytes());
  const master = source(
    'Competitor Holders (13F) - 20261109.xlsx',
    combinedWorkbookBytes(),
  );

  const receipt = await runHoldingsImport(api, [perTarget, master]);

  assert.equal(receipt.acceptedRows, 1);
  assert.equal(receipt.ignoredRows, 1);
  assert.equal(receipt.holdingRecords, 1);
  assert.equal(receipt.managerRecords, 1);
  assert.equal(receipt.securityRecords, 1);
  assert.equal(receipt.supersededRows, 1);
  assert.equal(api.holdingRecords.length, 1);
  assert.equal(api.holdingRecords[0]?.sharesHeld, 999);
  assert.equal(api.holdingRecords[0]?.targetTicker, undefined);
  assert.equal(api.events.includes('list-duplicate-positions'), true);
  assert.equal(
    api.events.some((event) => event === `patch:false:${staleDuplicateId}`),
    true,
  );
});

test('retry staging and clean completion clear stale terminal fields', async () => {
  const api = new MemoryHoldingsApi();
  const holdings = source('AGGB competitor holders.xlsx', workbookBytes());
  const plan = safelyParseHoldingsSource(holdings);
  api.runs.set(plan.run.importKey, {
    id: plan.run.id,
    importKey: plan.run.importKey,
    status: 'PARTIAL',
    contentSha256: plan.run.contentSha256,
    parserVersion: plan.run.parserVersion,
  });

  await runHoldingsImport(api, [holdings]);

  assert.equal(api.importRunRecords.length, 2);
  assert.deepEqual(
    {
      status: api.importRunRecords[0]?.status,
      completedAt: api.importRunRecords[0]?.completedAt,
      errorSummary: api.importRunRecords[0]?.errorSummary,
    },
    { status: 'STAGING', completedAt: null, errorSummary: null },
  );
  assert.equal(api.importRunRecords[1]?.status, 'COMPLETE');
  assert.equal(api.importRunRecords[1]?.errorSummary, null);
  assert.equal(typeof api.importRunRecords[1]?.completedAt, 'string');
});

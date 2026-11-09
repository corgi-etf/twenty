import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { utils, write } from 'xlsx-ugnis';

import {
  runHoldingsImport,
  type ExistingImportRun,
  type HoldingsImportApi,
} from '../src/holdings-importer.ts';
import type { HoldingsSource } from '../src/holdings-parser.ts';

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

class MemoryHoldingsApi implements HoldingsImportApi {
  runs = new Map<string, ExistingImportRun>();
  events: string[] = [];
  oldIds = [randomUUID()];

  async findImportRun(importKey: string) {
    return this.runs.get(importKey);
  }

  async listHoldingIds() {
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
        this.runs.set(String(record.importKey), {
          id: String(record.id),
          importKey: String(record.importKey),
          status: record.status as ExistingImportRun['status'],
          contentSha256: String(record.contentSha256),
          parserVersion: String(record.parserVersion),
        });
      }
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

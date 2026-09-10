import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { describe, it } from 'node:test';

import { buildSchema, parse, validate } from 'graphql';

const canarySource = await fs.readFile(
  new URL(
    '../../../../twenty-e2e-testing/tests/production/meetingBooking.maintenance.spec.ts',
    import.meta.url,
  ),
  'utf8',
);

describe('production report runtime canary contract', () => {
  it('uses the real metadata API with no logs or error payload selected', async () => {
    const schema = buildSchema(
      await fs.readFile(
        new URL(
          '../../../../twenty-client-sdk/src/metadata/generated/schema.graphql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const documents = [
      ...canarySource.matchAll(
        /`\s*((?:query|mutation) (?:FindInstalledReportRuntimeVerification|ExecuteInstalledReportRuntimeVerification)[\s\S]*?)`/g,
      ),
    ].map(([, document]) => document);
    assert.equal(documents.length, 2);
    for (const document of documents) {
      assert.deepEqual(
        validate(schema, parse(document)).map((error) => error.message),
        [],
      );
      assert.doesNotMatch(document, /\b(?:logs|error)\b/);
    }
    assert.match(documents[1], /executeOneLogicFunction\(input: \$input\)/);
  });

  it('requires exact cleanup before executing all three periods and preserves the LIVE caveat', () => {
    const cleanup = canarySource.indexOf('expect(cleanupVerified).toBe(true)');
    const execution = canarySource.indexOf(
      "'ExecuteInstalledReportRuntimeVerification'",
    );
    assert.ok(cleanup > 0 && cleanup < execution);
    // Was `assertDisabled()`, which proved "no alert" via the proxy "the bot is
    // off". The bot now stays live through a release, so the same property is
    // proved directly: this run's own alert suppression is armed and unexpired.
    assert.match(
      canarySource.slice(cleanup, execution),
      /await assertAlertsSuppressed\(\)/,
    );
    assert.match(canarySource, /after exact meeting cleanup/);
    assert.match(canarySource, /executeOneFromSource in LIVE mode/);
    assert.match(canarySource, /\['daily', 24\]/);
    assert.match(canarySource, /\['weekly', 168\]/);
    assert.match(canarySource, /\['monthly', 720\]/);
    assert.doesNotMatch(
      canarySource.slice(cleanup),
      /test\.skip|continue-on-error/,
    );
  });
});

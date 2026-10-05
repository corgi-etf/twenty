import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatActivityName } from '../src/activity-name.ts';
test('formats canonical and legacy activity types using the Chicago activity date', () => {
  for (const activityType of ['call', 'phone_call', 'PHONE_CALL'])
    assert.equal(
      formatActivityName({
        activityType,
        companyName: 'Example',
        occurredAt: '2026-10-05T01:00:00Z',
      }),
      'Phone call - Example - 2026-10-04',
    );
  assert.equal(
    formatActivityName({
      activityType: 'EMAIL',
      companyName: 'Example',
      occurredAt: '2026-11-01T05:30:00Z',
    }),
    'Email - Example - 2026-11-01',
  );
});
test('uses the documented creation fallback without fabricating missing facts', () => {
  assert.equal(
    formatActivityName({ createdAt: '2026-10-05T12:00:00Z' }),
    'Activity - Company not linked - 2026-10-05',
  );
  assert.equal(
    formatActivityName({}),
    'Activity - Company not linked - Date unknown',
  );
});

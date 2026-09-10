import { describe, expect, it } from 'vitest';

import {
  QUICK_LOG_ACTIVITY_TYPE_SELECT_OPTIONS,
  QUICK_LOG_OUTCOME_SELECT_OPTIONS,
  fromActivityTypeOptionValue,
  fromOutcomeOptionValue,
  toActivityTypeOptionValue,
  toOutcomeOptionValue,
  type QuickLogSelectOption,
} from 'src/modules/outreach/quick-log-select-options';
import {
  QUICK_LOG_ACTIVITY_LABELS,
  QUICK_LOG_ACTIVITY_TYPES,
  QUICK_LOG_OUTCOME_LABELS,
  QUICK_LOG_OUTCOMES,
} from 'src/modules/outreach/quick-log-taxonomy';

// Mirrors twenty-server's isSnakeCaseString, which rejects the field creation
// outright when an option value does not match.
const TWENTY_OPTION_VALUE_PATTERN = /^(?!.*__)[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

const TAG_COLORS = new Set([
  'red', 'ruby', 'crimson', 'tomato', 'orange', 'amber', 'yellow', 'lime',
  'grass', 'green', 'jade', 'mint', 'turquoise', 'cyan', 'sky', 'blue',
  'iris', 'violet', 'purple', 'plum', 'pink', 'bronze', 'gold', 'brown', 'gray',
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const assertOptionContract = (options: QuickLogSelectOption[]) => {
  for (const option of options) {
    expect(option.value).toMatch(TWENTY_OPTION_VALUE_PATTERN);
    expect(option.id).toMatch(UUID_PATTERN);
    expect(option.label.length).toBeGreaterThan(0);
    expect(option.label.length).toBeLessThanOrEqual(63);
    expect(option.label).not.toContain(',');
    expect(TAG_COLORS.has(option.color)).toBe(true);
  }
  expect(new Set(options.map(({ id }) => id)).size).toBe(options.length);
  expect(new Set(options.map(({ value }) => value)).size).toBe(options.length);
  expect(options.map(({ position }) => position)).toEqual(
    options.map((_, index) => index),
  );
};

describe('quick log select options', () => {
  it('satisfies every constraint twenty-server enforces on SELECT options', () => {
    assertOptionContract(QUICK_LOG_ACTIVITY_TYPE_SELECT_OPTIONS);
    assertOptionContract(QUICK_LOG_OUTCOME_SELECT_OPTIONS);
  });

  it('offers exactly the canonical taxonomy, inventing and dropping nothing', () => {
    expect(
      QUICK_LOG_ACTIVITY_TYPE_SELECT_OPTIONS.map(({ value }) => value),
    ).toEqual(['PHONE_CALL', 'EMAIL', 'LINKEDIN', 'MEETING', 'OTHER']);
    expect(QUICK_LOG_OUTCOME_SELECT_OPTIONS.map(({ value }) => value)).toEqual([
      'LEFT_VOICEMAIL',
      'NO_RESPONSE',
      'CONNECTED',
      'FOLLOW_UP_SCHEDULED',
      'NOT_INTERESTED',
      'OTHER',
    ]);
  });

  it('labels each option with the taxonomy label the reports already use', () => {
    expect(
      QUICK_LOG_ACTIVITY_TYPE_SELECT_OPTIONS.map(({ label }) => label),
    ).toEqual(
      QUICK_LOG_ACTIVITY_TYPES.map((type) => QUICK_LOG_ACTIVITY_LABELS[type]),
    );
    expect(QUICK_LOG_OUTCOME_SELECT_OPTIONS.map(({ label }) => label)).toEqual(
      QUICK_LOG_OUTCOMES.map((outcome) => QUICK_LOG_OUTCOME_LABELS[outcome]),
    );
  });

  it('round-trips every slug through the stored encoding without loss', () => {
    for (const activityType of QUICK_LOG_ACTIVITY_TYPES) {
      expect(
        fromActivityTypeOptionValue(toActivityTypeOptionValue(activityType)),
      ).toBe(activityType);
    }
    for (const outcome of QUICK_LOG_OUTCOMES) {
      expect(fromOutcomeOptionValue(toOutcomeOptionValue(outcome))).toBe(
        outcome,
      );
    }
  });

  it('decodes nothing for values outside the taxonomy', () => {
    expect(fromActivityTypeOptionValue('CALL')).toBeUndefined();
    expect(fromActivityTypeOptionValue('')).toBeUndefined();
    expect(fromOutcomeOptionValue('MAYBE')).toBeUndefined();
  });
});

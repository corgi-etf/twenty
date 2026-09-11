import { describe, expect, it } from 'vitest';

import {
  isQuickLogOutcome,
  QUICK_LOG_ACTIVITY_TYPES,
  QUICK_LOG_OUTCOMES,
  QUICK_LOG_OUTCOMES_BY_ACTIVITY_TYPE,
} from 'src/modules/outreach/quick-log-taxonomy';

describe('QUICK_LOG_OUTCOMES_BY_ACTIVITY_TYPE', () => {
  it('covers every activity type, so the form can never find none', () => {
    for (const activityType of QUICK_LOG_ACTIVITY_TYPES) {
      expect(QUICK_LOG_OUTCOMES_BY_ACTIVITY_TYPE[activityType].length).toBeGreaterThan(0);
    }
  });

  it('offers only outcomes the server accepts', () => {
    for (const activityType of QUICK_LOG_ACTIVITY_TYPES) {
      for (const outcome of QUICK_LOG_OUTCOMES_BY_ACTIVITY_TYPE[activityType]) {
        expect(isQuickLogOutcome(outcome)).toBe(true);
      }
    }
  });

  // Only a call can reach an answering machine.
  it('offers voicemail for calls and for nothing else', () => {
    const withVoicemail = QUICK_LOG_ACTIVITY_TYPES.filter((activityType) =>
      QUICK_LOG_OUTCOMES_BY_ACTIVITY_TYPE[activityType].includes('left_voicemail'),
    );
    expect(withVoicemail).toEqual(['PHONE_CALL', 'OTHER']);
  });

  it('keeps every outcome reachable from some activity type', () => {
    const offered = new Set(
      QUICK_LOG_ACTIVITY_TYPES.flatMap((activityType) => [
        ...QUICK_LOG_OUTCOMES_BY_ACTIVITY_TYPE[activityType],
      ]),
    );
    expect([...offered].sort()).toEqual([...QUICK_LOG_OUTCOMES].sort());
  });
});

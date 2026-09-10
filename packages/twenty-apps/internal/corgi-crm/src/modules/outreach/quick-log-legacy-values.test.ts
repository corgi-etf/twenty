import { describe, expect, it } from 'vitest';

import {
  resolveLegacyActivityType,
  resolveLegacyOutcome,
} from 'src/modules/outreach/quick-log-legacy-values';
import {
  QUICK_LOG_ACTIVITY_TYPES,
  QUICK_LOG_OUTCOMES,
} from 'src/modules/outreach/quick-log-taxonomy';

describe('legacy quick log values', () => {
  it('resolves the legacy importer value that reports leak today', () => {
    expect(resolveLegacyActivityType('call')).toEqual({
      status: 'resolved',
      value: 'phone_call',
    });
    expect(resolveLegacyActivityType('Call')).toEqual({
      status: 'resolved',
      value: 'phone_call',
    });
    expect(resolveLegacyActivityType('  Phone Call  ')).toEqual({
      status: 'resolved',
      value: 'phone_call',
    });
  });

  it('passes every canonical slug through unchanged', () => {
    for (const activityType of QUICK_LOG_ACTIVITY_TYPES) {
      expect(resolveLegacyActivityType(activityType)).toEqual({
        status: 'resolved',
        value: activityType,
      });
    }
    for (const outcome of QUICK_LOG_OUTCOMES) {
      expect(resolveLegacyOutcome(outcome)).toEqual({
        status: 'resolved',
        value: outcome,
      });
    }
  });

  it('reports empty values separately so they are never mistaken for a mapping', () => {
    expect(resolveLegacyActivityType('')).toEqual({ status: 'empty' });
    expect(resolveLegacyActivityType('   ')).toEqual({ status: 'empty' });
    expect(resolveLegacyActivityType(null)).toEqual({ status: 'empty' });
    expect(resolveLegacyActivityType(undefined)).toEqual({ status: 'empty' });
    expect(resolveLegacyOutcome(null)).toEqual({ status: 'empty' });
  });

  it('leaves unknown values unresolved instead of destroying them as "other"', () => {
    expect(resolveLegacyActivityType('sms')).toEqual({ status: 'unresolved' });
    expect(resolveLegacyActivityType('Coffee at the airport')).toEqual({
      status: 'unresolved',
    });
    expect(resolveLegacyOutcome('maybe')).toEqual({ status: 'unresolved' });
  });

  it('resolves the outcome spellings the legacy sources are known to use', () => {
    expect(resolveLegacyOutcome('voicemail')).toEqual({
      status: 'resolved',
      value: 'left_voicemail',
    });
    expect(resolveLegacyOutcome('No Answer')).toEqual({
      status: 'resolved',
      value: 'no_response',
    });
    expect(resolveLegacyOutcome('Not Interested')).toEqual({
      status: 'resolved',
      value: 'not_interested',
    });
  });
});

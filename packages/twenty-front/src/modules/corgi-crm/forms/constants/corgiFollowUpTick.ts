import { msg } from '@lingui/core/macro';

// Separate from the action ticks: it does not log an activity type of its own,
// it marks whatever was logged as needing a follow-up.
export const CORGI_FOLLOW_UP_TICK = {
  key: 'needsFollowUp',
  label: msg`Needs follow-up`,
} as const;

import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

// Each tick logs its own activity rather than setting flags on one record, so
// "number of calls" and "number of emails" keep counting activities and the
// dashboard totals need no special cases.
export const CORGI_FIRST_TOUCH_ACTIONS = [
  { key: 'called', label: msg`Called`, activityType: 'PHONE_CALL' },
  // A voicemail is a call attempt, so it counts as one. The outcome records
  // which it was, rather than adding a select option that every existing
  // activity and every saved view would then have to learn about.
  {
    key: 'voicemail',
    label: msg`Voicemail`,
    activityType: 'PHONE_CALL',
    outcome: msg`Voicemail`,
  },
  { key: 'emailed', label: msg`Emailed`, activityType: 'EMAIL' },
  {
    key: 'linkedin',
    label: msg`LinkedIn request sent`,
    activityType: 'LINKEDIN',
  },
  { key: 'visited', label: msg`Visited`, activityType: 'MEETING' },
] as const satisfies ReadonlyArray<{
  key: string;
  label: MessageDescriptor;
  activityType: string;
  outcome?: MessageDescriptor;
}>;

export type CorgiFirstTouchKey =
  (typeof CORGI_FIRST_TOUCH_ACTIONS)[number]['key'];

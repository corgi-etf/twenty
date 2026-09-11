// UPPER_CASE because activityType is a SELECT in the CRM and Twenty rejects
// option values that are not upper snake_case. These are the stored values, so
// the taxonomy speaks the same language as the column. outcome is still TEXT,
// so its values stay lower snake_case.
export const QUICK_LOG_ACTIVITY_TYPES = [
  'PHONE_CALL',
  'EMAIL',
  'LINKEDIN',
  'MEETING',
  'OTHER',
] as const;

export type QuickLogActivityType = (typeof QUICK_LOG_ACTIVITY_TYPES)[number];

export const QUICK_LOG_OUTCOMES = [
  'left_voicemail',
  'no_response',
  'connected',
  'follow_up_scheduled',
  'not_interested',
  'other',
] as const;

export type QuickLogOutcome = (typeof QUICK_LOG_OUTCOMES)[number];

export const QUICK_LOG_ACTIVITY_LABELS: Record<QuickLogActivityType, string> = {
  PHONE_CALL: 'Phone call',
  EMAIL: 'Email',
  LINKEDIN: 'LinkedIn',
  MEETING: 'Meeting',
  OTHER: 'Other',
};

export const QUICK_LOG_OUTCOME_LABELS: Record<QuickLogOutcome, string> = {
  left_voicemail: 'Left voicemail',
  no_response: 'No response',
  connected: 'Connected',
  follow_up_scheduled: 'Follow-up scheduled',
  not_interested: 'Not interested',
  other: 'Other',
};

export const isQuickLogActivityType = (
  value: string,
): value is QuickLogActivityType =>
  (QUICK_LOG_ACTIVITY_TYPES as readonly string[]).includes(value);

export const isQuickLogOutcome = (value: string): value is QuickLogOutcome =>
  (QUICK_LOG_OUTCOMES as readonly string[]).includes(value);

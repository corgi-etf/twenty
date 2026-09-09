export const QUICK_LOG_ACTIVITY_TYPES = [
  'phone_call',
  'email',
  'linkedin',
  'meeting',
  'other',
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
  phone_call: 'Phone call',
  email: 'Email',
  linkedin: 'LinkedIn',
  meeting: 'Meeting',
  other: 'Other',
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

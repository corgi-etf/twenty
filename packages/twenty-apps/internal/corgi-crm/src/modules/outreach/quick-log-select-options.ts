import {
  QUICK_LOG_ACTIVITY_LABELS,
  QUICK_LOG_ACTIVITY_TYPES,
  QUICK_LOG_OUTCOME_LABELS,
  QUICK_LOG_OUTCOMES,
  isQuickLogActivityType,
  isQuickLogOutcome,
  type QuickLogActivityType,
  type QuickLogOutcome,
} from 'src/modules/outreach/quick-log-taxonomy';

// Twenty rejects any SELECT option value that is not UPPER_SNAKE_CASE
// (validate-enum-flat-field-metadata.util.ts), so a SELECT field cannot store
// the lowercase slugs. The slug stays the app's only internal vocabulary and is
// encoded at the CRM persistence boundary, nowhere else.
export type QuickLogActivityTypeOptionValue = Uppercase<QuickLogActivityType>;

export type QuickLogOutcomeOptionValue = Uppercase<QuickLogOutcome>;

export type QuickLogSelectOption = {
  id: string;
  value: string;
  label: string;
  position: number;
  color: string;
};

const ACTIVITY_TYPE_OPTION_IDS: Record<QuickLogActivityType, string> = {
  phone_call: '674e00ba-3ddd-4a16-a87b-db54cccd0bbe',
  email: '6cafe527-c133-4b94-8599-5084a99ccce4',
  linkedin: 'e826f83d-1c4e-4a9f-918c-b1dc0f47f9a8',
  meeting: '5f17c937-9322-4a72-b401-eccb72a0a22b',
  other: 'd5f3cd92-d8f1-46a5-981f-74af1dc94a34',
};

const OUTCOME_OPTION_IDS: Record<QuickLogOutcome, string> = {
  left_voicemail: '22193c7e-6527-4850-99b1-d08f8bac1563',
  no_response: 'caae58bc-27bd-4b14-8ac7-b5e3cd9436b1',
  connected: '67926254-b8a7-490d-b251-20d6600d0d0b',
  follow_up_scheduled: '0f067d70-9adf-48f3-a6d7-54fc3afa6ad3',
  not_interested: '178ce62b-3982-4bf4-98b9-951b88624d7a',
  other: '464f8aeb-5af2-4b19-bd16-1afd6d564da8',
};

const ACTIVITY_TYPE_OPTION_COLORS: Record<QuickLogActivityType, string> = {
  phone_call: 'blue',
  email: 'purple',
  linkedin: 'sky',
  meeting: 'green',
  other: 'gray',
};

const OUTCOME_OPTION_COLORS: Record<QuickLogOutcome, string> = {
  left_voicemail: 'orange',
  no_response: 'gray',
  connected: 'green',
  follow_up_scheduled: 'blue',
  not_interested: 'red',
  other: 'gray',
};

export const toActivityTypeOptionValue = (
  activityType: QuickLogActivityType,
): QuickLogActivityTypeOptionValue =>
  activityType.toUpperCase() as QuickLogActivityTypeOptionValue;

export const toOutcomeOptionValue = (
  outcome: QuickLogOutcome,
): QuickLogOutcomeOptionValue =>
  outcome.toUpperCase() as QuickLogOutcomeOptionValue;

export const fromActivityTypeOptionValue = (
  value: string,
): QuickLogActivityType | undefined => {
  const slug = value.trim().toLowerCase();

  return isQuickLogActivityType(slug) ? slug : undefined;
};

export const fromOutcomeOptionValue = (
  value: string,
): QuickLogOutcome | undefined => {
  const slug = value.trim().toLowerCase();

  return isQuickLogOutcome(slug) ? slug : undefined;
};

export const QUICK_LOG_ACTIVITY_TYPE_SELECT_OPTIONS: QuickLogSelectOption[] =
  QUICK_LOG_ACTIVITY_TYPES.map((activityType, position) => ({
    id: ACTIVITY_TYPE_OPTION_IDS[activityType],
    value: toActivityTypeOptionValue(activityType),
    label: QUICK_LOG_ACTIVITY_LABELS[activityType],
    position,
    color: ACTIVITY_TYPE_OPTION_COLORS[activityType],
  }));

export const QUICK_LOG_OUTCOME_SELECT_OPTIONS: QuickLogSelectOption[] =
  QUICK_LOG_OUTCOMES.map((outcome, position) => ({
    id: OUTCOME_OPTION_IDS[outcome],
    value: toOutcomeOptionValue(outcome),
    label: QUICK_LOG_OUTCOME_LABELS[outcome],
    position,
    color: OUTCOME_OPTION_COLORS[outcome],
  }));

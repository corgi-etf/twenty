import {
  isQuickLogActivityType,
  isQuickLogOutcome,
  type QuickLogActivityType,
  type QuickLogOutcome,
} from 'src/modules/outreach/quick-log-taxonomy';

export type LegacyValueResolution<TValue> =
  | { status: 'resolved'; value: TValue }
  | { status: 'empty' }
  | { status: 'unresolved' };

// Historical rows predate the taxonomy: the legacy CSV importer wrote 'call'
// and the Fetch migration wrote unvalidated source strings straight through.
// Anything not listed here stays unresolved so a human decides its mapping —
// never coerce an unknown value to 'other', which would destroy the original.
const LEGACY_ACTIVITY_TYPE_ALIASES: Record<string, QuickLogActivityType> = {
  call: 'phone_call',
  phonecall: 'phone_call',
  'phone call': 'phone_call',
  e_mail: 'email',
  'e-mail': 'email',
  linked_in: 'linkedin',
  'linked in': 'linkedin',
};

const LEGACY_OUTCOME_ALIASES: Record<string, QuickLogOutcome> = {
  voicemail: 'left_voicemail',
  left_vm: 'left_voicemail',
  vm: 'left_voicemail',
  'no answer': 'no_response',
  no_answer: 'no_response',
  noresponse: 'no_response',
  spoke: 'connected',
  spoke_with: 'connected',
  followup_scheduled: 'follow_up_scheduled',
  'follow up scheduled': 'follow_up_scheduled',
  notinterested: 'not_interested',
  'not interested': 'not_interested',
};

const normalize = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const resolveLegacyActivityType = (
  value: string | null | undefined,
): LegacyValueResolution<QuickLogActivityType> => {
  const normalized = normalize(value);

  if (!normalized) {
    return { status: 'empty' };
  }
  if (isQuickLogActivityType(normalized)) {
    return { status: 'resolved', value: normalized };
  }

  const alias = LEGACY_ACTIVITY_TYPE_ALIASES[normalized];

  return alias ? { status: 'resolved', value: alias } : { status: 'unresolved' };
};

export const resolveLegacyOutcome = (
  value: string | null | undefined,
): LegacyValueResolution<QuickLogOutcome> => {
  const normalized = normalize(value);

  if (!normalized) {
    return { status: 'empty' };
  }
  if (isQuickLogOutcome(normalized)) {
    return { status: 'resolved', value: normalized };
  }

  const alias = LEGACY_OUTCOME_ALIASES[normalized];

  return alias ? { status: 'resolved', value: alias } : { status: 'unresolved' };
};

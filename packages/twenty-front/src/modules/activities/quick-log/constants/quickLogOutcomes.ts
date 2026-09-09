import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

export const QUICK_LOG_OUTCOMES = [
  { value: 'left_voicemail', label: msg`Left voicemail` },
  { value: 'no_response', label: msg`No response` },
  { value: 'connected', label: msg`Connected` },
  { value: 'follow_up_scheduled', label: msg`Follow-up scheduled` },
  { value: 'not_interested', label: msg`Not interested` },
  { value: 'other', label: msg`Other` },
] as const satisfies ReadonlyArray<{
  value: string;
  label: MessageDescriptor;
}>;

export type QuickLogOutcome = (typeof QUICK_LOG_OUTCOMES)[number]['value'];

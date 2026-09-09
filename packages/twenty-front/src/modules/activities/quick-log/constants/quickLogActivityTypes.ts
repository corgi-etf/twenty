import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

export const QUICK_LOG_ACTIVITY_TYPES = [
  { value: 'phone_call', label: msg`Phone call` },
  { value: 'email', label: msg`Email` },
  { value: 'linkedin', label: msg`LinkedIn` },
  { value: 'meeting', label: msg`Meeting` },
  { value: 'other', label: msg`Other` },
] as const satisfies ReadonlyArray<{
  value: string;
  label: MessageDescriptor;
}>;

export type QuickLogActivityType =
  (typeof QUICK_LOG_ACTIVITY_TYPES)[number]['value'];

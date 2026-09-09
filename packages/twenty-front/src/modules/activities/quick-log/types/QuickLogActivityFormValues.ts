import { type QuickLogActivityType } from '@/activities/quick-log/constants/quickLogActivityTypes';
import { type QuickLogOutcome } from '@/activities/quick-log/constants/quickLogOutcomes';

export type QuickLogActivityFormValues = {
  activityType: QuickLogActivityType;
  outcome: QuickLogOutcome;
  notes: string;
  contactId: string | null;
  followUpDate: string;
};

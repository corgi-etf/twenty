import {
  isQuickLogActivityType,
  isQuickLogOutcome,
  QUICK_LOG_ACTIVITY_LABELS,
  QUICK_LOG_OUTCOME_LABELS,
} from 'src/modules/outreach/quick-log-taxonomy';
import { type OutreachRepository } from 'src/modules/outreach/types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LogOutreachForCompanyInput = {
  activityId: string;
  companyId: string;
  activityType: string;
  outcome: string;
  notes?: string;
};

// The record page already identifies the company, so this takes its id rather
// than a name query: searching by name from a record the user is looking at
// can only reintroduce the ambiguity they already resolved by opening it.
export const logOutreachForCompany = async ({
  input,
  wholesalerId,
  now,
  repository,
}: {
  input: LogOutreachForCompanyInput;
  wholesalerId: string;
  now: Date;
  repository: Pick<OutreachRepository, 'createActivity'>;
}) => {
  if (!isQuickLogActivityType(input.activityType)) {
    throw new Error(`Unsupported activity type: ${input.activityType}`);
  }
  if (!isQuickLogOutcome(input.outcome)) {
    throw new Error(`Unsupported outcome: ${input.outcome}`);
  }
  if (!UUID_PATTERN.test(input.activityId)) {
    throw new Error('Activity ID must be a UUID');
  }
  if (!UUID_PATTERN.test(input.companyId)) {
    throw new Error('Company ID must be a UUID');
  }
  if (!UUID_PATTERN.test(wholesalerId)) {
    throw new Error('Wholesaler ID must be a UUID');
  }

  const notes = input.notes?.trim();
  const activity = await repository.createActivity({
    id: input.activityId,
    name: `${QUICK_LOG_ACTIVITY_LABELS[input.activityType]} · ${QUICK_LOG_OUTCOME_LABELS[input.outcome]}`,
    companyId: input.companyId,
    wholesalerId,
    activityType: input.activityType,
    outcome: input.outcome,
    ...(notes ? { notes } : {}),
    occurredAt: now.toISOString(),
  });

  return { status: 'logged', activityId: activity.id } as const;
};

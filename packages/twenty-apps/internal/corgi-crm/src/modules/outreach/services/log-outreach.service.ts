import {
  isQuickLogActivityType,
  isQuickLogOutcome,
  QUICK_LOG_ACTIVITY_LABELS,
  QUICK_LOG_OUTCOME_LABELS,
} from 'src/modules/outreach/quick-log-taxonomy';
import {
  type LogOutreachInput,
  type NamedRecord,
  type OutreachRepository,
} from 'src/modules/outreach/types';

const exactOrAll = (records: NamedRecord[], query: string): NamedRecord[] => {
  const normalized = query.trim().toLowerCase();
  const exact = records.filter(
    ({ name }) => name.trim().toLowerCase() === normalized,
  );
  return exact.length > 0 ? exact : records;
};

export const logOutreach = async ({
  input,
  wholesalerId,
  now,
  repository,
}: {
  input: LogOutreachInput;
  wholesalerId: string;
  now: Date;
  repository: OutreachRepository;
}) => {
  if (!isQuickLogActivityType(input.activityType)) {
    throw new Error(`Unsupported activity type: ${input.activityType}`);
  }
  if (!isQuickLogOutcome(input.outcome)) {
    throw new Error(`Unsupported outcome: ${input.outcome}`);
  }
  if (!input.activityId.trim()) throw new Error('Activity ID is required');
  const draft = input;
  const companies = exactOrAll(
    await repository.findCompanies(draft.companyQuery),
    draft.companyQuery,
  );
  if (companies.length === 0) return { status: 'company_not_found' } as const;
  if (companies.length > 1) {
    return { status: 'ambiguous_company', matches: companies } as const;
  }
  const company = companies[0]!;

  let contact: NamedRecord | undefined;
  if (draft.contactQuery) {
    const contacts = exactOrAll(
      await repository.findContacts(company.id, draft.contactQuery),
      draft.contactQuery,
    );
    if (contacts.length === 0) return { status: 'contact_not_found' } as const;
    if (contacts.length > 1) {
      return { status: 'ambiguous_contact', matches: contacts } as const;
    }
    contact = contacts[0];
  }

  const occurredAt = now.toISOString();
  const activity = await repository.createActivity({
    id: draft.activityId,
    name: `${QUICK_LOG_ACTIVITY_LABELS[draft.activityType]} · ${QUICK_LOG_OUTCOME_LABELS[draft.outcome]}`,
    companyId: company.id,
    ...(contact ? { contactId: contact.id } : {}),
    wholesalerId,
    activityType: draft.activityType,
    outcome: draft.outcome,
    ...(draft.notes ? { notes: draft.notes } : {}),
    occurredAt,
    ...(draft.followUpDate ? { followUpDate: draft.followUpDate } : {}),
  });

  return {
    status: 'logged',
    activityId: activity.id,
    companyName: company.name,
  } as const;
};

import {
  type NamedRecord,
  type OutreachRepository,
} from 'src/modules/outreach/types';

export type LogDraft = {
  activityType: string;
  companyQuery: string;
  contactQuery?: string;
  outcome: string;
  notes?: string;
  followUpDate?: string;
};

const required = (value: string | undefined, label: string): string => {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

const parseExplicit = (body: string): LogDraft => {
  const values = Object.fromEntries(
    body
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        if (separator < 1) throw new Error(`Invalid /log field: ${part}`);
        return [
          part.slice(0, separator).trim().toLowerCase(),
          part.slice(separator + 1).trim(),
        ];
      }),
  );
  const allowed = new Set([
    'type',
    'company',
    'contact',
    'outcome',
    'notes',
    'followup',
  ]);
  const unsupported = Object.keys(values).find((key) => !allowed.has(key));
  if (unsupported) throw new Error(`Unsupported /log field: ${unsupported}`);
  if (values.followup && !/^\d{4}-\d{2}-\d{2}$/.test(values.followup)) {
    throw new Error('followup must use YYYY-MM-DD');
  }

  return {
    activityType: required(values.type, 'type').toLowerCase(),
    companyQuery: required(values.company, 'company'),
    ...(values.contact ? { contactQuery: values.contact } : {}),
    outcome: required(values.outcome, 'outcome').toLowerCase(),
    ...(values.notes ? { notes: values.notes } : {}),
    ...(values.followup ? { followUpDate: values.followup } : {}),
  };
};

const parseFast = (body: string): LogDraft => {
  const parts = body.split('|').map((part) => part.trim());
  if (parts.length < 3 || parts.length > 5) {
    throw new Error(
      'Use /log type | company | outcome | notes, or include contact as the fifth field',
    );
  }
  const normalizedType = required(parts[0], 'type').toLowerCase();

  if (parts.length === 5) {
    return {
      activityType: normalizedType,
      companyQuery: required(parts[1], 'company'),
      contactQuery: required(parts[2], 'contact'),
      outcome: required(parts[3], 'outcome').toLowerCase(),
      notes: required(parts[4], 'notes'),
    };
  }

  return {
    activityType: normalizedType,
    companyQuery: required(parts[1], 'company'),
    outcome: required(parts[2], 'outcome').toLowerCase(),
    ...(parts[3] ? { notes: parts[3] } : {}),
  };
};

export const parseLogCommand = (text: string): LogDraft => {
  const body = text.replace(/^\/log(?:@\w+)?\s*/i, '').trim();
  if (!body) throw new Error('Add activity details after /log');
  return /(?:^|;)\s*(?:type|company|outcome)\s*=/i.test(body)
    ? parseExplicit(body)
    : parseFast(body);
};

const exactOrAll = (records: NamedRecord[], query: string): NamedRecord[] => {
  const normalized = query.trim().toLowerCase();
  const exact = records.filter(
    ({ name }) => name.trim().toLowerCase() === normalized,
  );
  return exact.length > 0 ? exact : records;
};

export const logOutreach = async ({
  text,
  wholesalerId,
  now,
  repository,
}: {
  text: string;
  wholesalerId: string;
  now: Date;
  repository: OutreachRepository;
}) => {
  const draft = parseLogCommand(text);
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
    name: `${draft.activityType} · ${company.name} · ${occurredAt}`,
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

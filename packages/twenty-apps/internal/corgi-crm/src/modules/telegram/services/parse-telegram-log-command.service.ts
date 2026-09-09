import {
  isQuickLogActivityType,
  isQuickLogOutcome,
  type QuickLogActivityType,
} from 'src/modules/outreach/quick-log-taxonomy';
import { type LogOutreachInput } from 'src/modules/outreach/types';

const required = (value: string | undefined, label: string): string => {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

const canonicalActivityType = (value: string): QuickLogActivityType => {
  const canonical = value.trim().toLowerCase() === 'call'
    ? 'phone_call'
    : value.trim().toLowerCase();
  if (!isQuickLogActivityType(canonical)) {
    throw new Error(`Unsupported activity type: ${value}`);
  }
  return canonical;
};

const canonicalOutcome = (value: string) => {
  const canonical = value.trim().toLowerCase();
  if (!isQuickLogOutcome(canonical)) {
    throw new Error(`Unsupported outcome: ${value}`);
  }
  return canonical;
};

const parseExplicit = (body: string, activityId: string): LogOutreachInput => {
  const values = Object.fromEntries(
    body.split(';').map((part) => {
      const separator = part.indexOf('=');
      if (separator < 1) throw new Error(`Invalid /log field: ${part.trim()}`);
      return [
        part.slice(0, separator).trim().toLowerCase(),
        part.slice(separator + 1).trim(),
      ];
    }),
  );
  const allowed = new Set(['type', 'company', 'contact', 'outcome', 'notes', 'followup']);
  const unsupported = Object.keys(values).find((key) => !allowed.has(key));
  if (unsupported) throw new Error(`Unsupported /log field: ${unsupported}`);
  if (values.followup && !/^\d{4}-\d{2}-\d{2}$/.test(values.followup)) {
    throw new Error('followup must use YYYY-MM-DD');
  }
  return {
    activityId,
    activityType: canonicalActivityType(required(values.type, 'type')),
    companyQuery: required(values.company, 'company'),
    ...(values.contact ? { contactQuery: values.contact } : {}),
    outcome: canonicalOutcome(required(values.outcome, 'outcome')),
    ...(values.notes ? { notes: values.notes } : {}),
    ...(values.followup ? { followUpDate: values.followup } : {}),
  };
};

export const parseTelegramLogCommand = (
  text: string,
  activityId: string,
): LogOutreachInput => {
  const body = text.replace(/^\/log(?:@\w+)?\s*/i, '').trim();
  if (!body) throw new Error('Add activity details after /log');
  if (/(?:^|;)\s*(?:type|company|outcome)\s*=/i.test(body)) {
    return parseExplicit(body, activityId);
  }
  const parts = body.split('|').map((part) => part.trim());
  if (parts.length < 3 || parts.length > 5) {
    throw new Error('Use /log type | company | outcome | notes');
  }
  if (parts.length === 5) {
    return {
      activityId,
      activityType: canonicalActivityType(required(parts[0], 'type')),
      companyQuery: required(parts[1], 'company'),
      contactQuery: required(parts[2], 'contact'),
      outcome: canonicalOutcome(required(parts[3], 'outcome')),
      notes: required(parts[4], 'notes'),
    };
  }
  return {
    activityId,
    activityType: canonicalActivityType(required(parts[0], 'type')),
    companyQuery: required(parts[1], 'company'),
    outcome: canonicalOutcome(required(parts[2], 'outcome')),
    ...(parts[3] ? { notes: parts[3] } : {}),
  };
};

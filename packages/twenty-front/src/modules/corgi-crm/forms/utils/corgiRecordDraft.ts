import { t } from '@lingui/core/macro';
export const CORGI_CREATE_FIELDS: Partial<Record<string, string[]>> = {
  // firmType and activeClient are set after the firm exists, not while typing
  // its name: activeClient is staff-controlled and firmType is a
  // classification nobody has on hand during a first call.
  company: ['name', 'domainName', 'address', 'linkedinLink'],
  person: ['name', 'company', 'jobTitle', 'emails', 'phones', 'activeClient'],
  outreachActivity: [
    'activityType',
    'company',
    'contact',
    'wholesaler',
    'occurredAt',
    'outcome',
    'followUpDate',
    'notes',
  ],
  meetingBooking: [
    'company',
    'contact',
    'scheduledAt',
    'wholesaler',
    'bookedBy',
    'status',
    'name',
    'notes',
  ],
  companyAllocation: [
    'ticker',
    'amount',
    'company',
    'contact',
    'meeting',
    'externalWholesaler',
    'allocationDate',
  ],
};

// Mirrors getCorgiCreateError so the form can flag these fields up front.
export const CORGI_REQUIRED_CREATE_FIELDS: Partial<Record<string, string[]>> = {
  company: ['name'],
  person: ['name'],
  meetingBooking: ['company', 'scheduledAt', 'wholesaler'],
  companyAllocation: ['ticker', 'amount', 'company'],
};

export const getCorgiRecordLabel = (
  record: Record<string, unknown>,
): string => {
  const name = record.name ?? record.ticker ?? record.title;
  if (typeof name === 'string' && name.trim()) return name;
  if (name && typeof name === 'object') {
    const fullName = name as { firstName?: string; lastName?: string };
    const label = [fullName.firstName, fullName.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (label) return label;
  }
  return t`Unnamed record`;
};

export const getCorgiRelationshipError = (
  companyId: unknown,
  relatedRecord: Record<string, unknown> | undefined,
): string | undefined => {
  const relatedCompany = relatedRecord?.company as { id?: string } | undefined;
  const relatedCompanyId = relatedRecord?.companyId ?? relatedCompany?.id;
  return companyId && relatedCompanyId && companyId !== relatedCompanyId
    ? t`This record belongs to another company. Change the company or remove this link.`
    : undefined;
};

export const getCorgiCreateError = (
  objectName: string,
  draft: Record<string, unknown>,
): string | undefined => {
  if (
    ['company', 'person'].includes(objectName) &&
    getCorgiRecordLabel(draft) === t`Unnamed record`
  )
    return t`Name is required.`;
  if (
    objectName === 'meetingBooking' &&
    (!draft.companyId || !draft.scheduledAt || !draft.wholesalerId)
  )
    return t`Company, owner, and scheduled time are required.`;
  if (
    objectName === 'meetingBooking' &&
    draft.status === 'COMPLETED' &&
    !draft.heldAt
  )
    return t`Enter when the meeting was actually taken.`;
  if (objectName === 'companyAllocation') {
    const amount = draft.amount as
      | { amountMicros?: number; currencyCode?: string }
      | undefined;
    if (typeof draft.ticker !== 'string' || !draft.ticker.trim())
      return t`Ticker is required.`;
    if (!draft.companyId) return t`Company is required.`;
    if (
      !amount ||
      !Number.isSafeInteger(amount.amountMicros) ||
      (amount.amountMicros ?? 0) <= 0 ||
      !amount.currencyCode?.match(/^[A-Z]{3}$/)
    )
      return t`Enter a positive allocation amount and a three-letter currency.`;
  }
  return undefined;
};

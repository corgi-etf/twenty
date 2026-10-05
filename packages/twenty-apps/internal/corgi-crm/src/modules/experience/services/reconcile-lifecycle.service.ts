export type LifecycleRecord = {
  id: string;
  updatedAt: string;
  createdAt?: string;
  companyId: string | null;
  contactId?: string | null;
  contactCompanyId?: string | null;
  meetingId?: string | null;
  meetingCompanyId?: string | null;
  ticker?: string | null;
  amount?: {
    amountMicros: number | string | null;
    currencyCode: string | null;
  } | null;
  loggedAt?: string | null;
  loggedById?: string | null;
  status?: string | null;
  heldAt?: string | null;
  heldRecordedAt?: string | null;
  takenById?: string | null;
  wholesalerId?: string | null;
  validationMessage?: string | null;
};
export type LifecycleRepository = {
  get(
    object: 'meetingBooking' | 'companyAllocation',
    id: string,
  ): Promise<LifecycleRecord | null>;
  update(
    object: 'meetingBooking' | 'companyAllocation',
    record: LifecycleRecord,
    data: Record<string, unknown>,
  ): Promise<boolean>;
};
const instant = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
export const isPositiveAllocationAmount = (value: unknown): boolean =>
  typeof value === 'number'
    ? Number.isSafeInteger(value) && value > 0
    : typeof value === 'string' &&
      /^\d+$/.test(value) &&
      BigInt(value) > BigInt(0);

export const allocationValidation = (
  record: LifecycleRecord,
): string | null => {
  if (!record.companyId) return 'Choose a company.';
  if (!record.ticker?.trim()) return 'Enter a fund ticker.';
  if (!isPositiveAllocationAmount(record.amount?.amountMicros))
    return 'Enter a positive allocation amount.';
  if (!/^[A-Z]{3}$/.test(record.amount?.currencyCode ?? ''))
    return 'Choose a currency.';
  if (record.contactId && record.contactCompanyId !== record.companyId)
    return 'The contact must belong to the selected company.';
  if (record.meetingId && record.meetingCompanyId !== record.companyId)
    return 'The meeting must belong to the selected company.';
  return null;
};
export const reconcileLifecycle = async ({
  object,
  id,
  eventAt,
  actorWorkspaceMemberId,
  repository,
}: {
  object: 'meetingBooking' | 'companyAllocation';
  id: string;
  eventAt: string;
  actorWorkspaceMemberId: string | null;
  repository: LifecycleRepository;
}) => {
  const record = await repository.get(object, id);
  if (!record) return { status: 'missing' } as const;
  if (!instant(eventAt))
    throw new Error('Lifecycle event timestamp is invalid');
  let validation: string | null = null;
  const data: Record<string, unknown> = {};
  if (object === 'companyAllocation') {
    validation = allocationValidation(record);
    if (!validation && !record.loggedAt) {
      data.loggedAt = new Date(eventAt).toISOString();
      if (actorWorkspaceMemberId) data.loggedById = actorWorkspaceMemberId;
    }
    if (record.validationMessage !== validation)
      data.allocationValidationMessage = validation;
  } else {
    if (record.contactId && record.contactCompanyId !== record.companyId)
      validation = 'The contact must belong to the selected company.';
    if (record.status === 'COMPLETED') {
      if (!record.companyId || !record.wholesalerId)
        validation = 'Choose a company and meeting owner.';
      else if (!instant(record.heldAt))
        validation = 'Enter when the meeting was actually held.';
      else if (!validation && !record.heldRecordedAt) {
        data.heldRecordedAt = new Date(eventAt).toISOString();
        if (!record.takenById && actorWorkspaceMemberId)
          data.takenById = actorWorkspaceMemberId;
      }
    }
    if (
      (validation || record.status === 'COMPLETED') &&
      record.validationMessage !== validation
    )
      data.bookingValidationMessage = validation;
  }
  if (!Object.keys(data).length) return { status: 'unchanged' } as const;
  if (!(await repository.update(object, record, data)))
    throw new Error('Lifecycle record changed; retry reconciliation');
  return { status: validation ? 'invalid' : 'recorded', validation } as const;
};

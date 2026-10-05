import {
  QUICK_LOG_ACTIVITY_LABELS,
  isQuickLogActivityType,
} from 'src/modules/outreach/quick-log-taxonomy';

export const ACTIVITY_REPORTING_TIME_ZONE = 'America/Chicago';

export const isBlankActivityName = (
  value: string | null | undefined,
): boolean => !value?.trim() || value.trim().toLowerCase() === 'untitled';

export const formatActivityName = ({
  activityType,
  companyName,
  occurredAt,
  createdAt,
  timeZone = ACTIVITY_REPORTING_TIME_ZONE,
}: {
  activityType?: string | null;
  companyName?: string | null;
  occurredAt?: string | null;
  createdAt?: string | null;
  timeZone?: string;
}): string => {
  const rawType = activityType?.trim();
  const type =
    rawType?.toLowerCase() === 'call' ? 'PHONE_CALL' : rawType?.toUpperCase();
  const label =
    type && isQuickLogActivityType(type)
      ? QUICK_LOG_ACTIVITY_LABELS[type]
      : rawType || 'Activity';
  const instant = occurredAt || createdAt;
  const date =
    instant && Number.isFinite(Date.parse(instant))
      ? new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(instant))
      : 'Date unknown';
  return `${label} - ${companyName?.trim() || 'Company not linked'} - ${date}`;
};

export type ActivityNameSource = {
  id: string;
  name: string | null;
  managedName: string | null;
  activityType: string | null;
  companyId: string | null;
  companyName: string | null;
  contactCompanyId: string | null;
  contactCompanyName: string | null;
  occurredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityNameRepository = {
  get(id: string): Promise<ActivityNameSource | null>;
  update(input: {
    id: string;
    expectedUpdatedAt: string;
    name: string;
    managedName: string;
    companyId?: string;
  }): Promise<boolean>;
};

export const reconcileActivityName = async (
  id: string,
  repository: ActivityNameRepository,
) => {
  const record = await repository.get(id);
  if (!record) return { status: 'missing' } as const;
  // A manual edit breaks the managed-name equality, so subsequent source edits
  // cannot overwrite a person's deliberate title. Clearing it resets automation.
  const derivedCompanyId = !record.companyId ? record.contactCompanyId : null;
  const name = formatActivityName({
    ...record,
    companyName:
      record.companyName ||
      (derivedCompanyId ? record.contactCompanyName : null),
  });
  if (
    !isBlankActivityName(record.name) &&
    record.name !== record.managedName &&
    record.name !== name
  )
    return { status: 'custom' } as const;
  if (record.name === name && record.managedName === name && !derivedCompanyId)
    return { status: 'unchanged' } as const;
  const saved = await repository.update({
    id,
    expectedUpdatedAt: record.updatedAt,
    name,
    managedName: name,
    ...(derivedCompanyId ? { companyId: derivedCompanyId } : {}),
  });
  if (!saved)
    throw new Error('Activity changed while naming; retry reconciliation');
  return { status: 'named', name } as const;
};

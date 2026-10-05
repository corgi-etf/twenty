export const getCorgiActivityTitle = ({
  activityTypeLabel,
  activityType,
  companyId,
  companyName,
  occurredAt,
  timeZone = 'America/Chicago',
}: {
  activityTypeLabel?: string;
  activityType?: string;
  companyId?: string;
  companyName?: string;
  occurredAt: string;
  timeZone?: string;
}): string | undefined => {
  // Defer to server naming until an existing company label has loaded.
  // A placeholder saved for a linked company would be mistaken for a custom title.
  if (companyId && !companyName?.trim()) return undefined;
  const rawType = activityType?.trim();
  const normalizedType =
    rawType?.toLowerCase() === 'call' ? 'PHONE_CALL' : rawType?.toUpperCase();
  const labels: Partial<Record<string, string>> = {
    PHONE_CALL: 'Phone call',
    EMAIL: 'Email',
    LINKEDIN: 'LinkedIn',
    MEETING: 'Meeting',
    OTHER: 'Other',
  };
  const label =
    (normalizedType && labels[normalizedType]) ||
    rawType ||
    activityTypeLabel?.trim() ||
    'Activity';
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(occurredAt));
  return `${label} - ${companyName?.trim() || 'Company not linked'} - ${date}`;
};

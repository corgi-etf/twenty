export const getCorgiActivityTitle = ({
  activityTypeLabel,
  companyName,
  occurredAt,
  timeZone = 'America/Chicago',
}: {
  activityTypeLabel?: string;
  companyName?: string;
  occurredAt: string;
  timeZone?: string;
}): string => {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(occurredAt));
  return `${activityTypeLabel?.trim() || 'Activity'} - ${companyName?.trim() || 'Company not linked'} - ${date}`;
};

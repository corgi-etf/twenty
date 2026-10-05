const ACTIVITY_LABELS: Record<string, string> = {
  call: 'Phone call',
  phone_call: 'Phone call',
  email: 'Email',
  linkedin: 'LinkedIn',
  meeting: 'Meeting',
  other: 'Other',
};

// Keep this dependency-free import contract aligned with the app formatter;
// the installed app bundles independently from these offline migration tools.
export const formatActivityName = ({
  activityType,
  companyName,
  occurredAt,
  createdAt,
  timeZone = 'America/Chicago',
}: {
  activityType?: string | null;
  companyName?: string | null;
  occurredAt?: string | null;
  createdAt?: string | null;
  timeZone?: string;
}): string => {
  const type = activityType?.trim();
  const label =
    (type && ACTIVITY_LABELS[type.toLowerCase()]) || type || 'Activity';
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

export const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Not available';
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};

export const formatMoney = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (magnitude >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (magnitude >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

export const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);

export const formatChange = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 0,
        signDisplay: 'always',
      }).format(value);

export const formatPercent = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : `${value.toFixed(2)}%`;

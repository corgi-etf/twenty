import type { PeriodOption } from 'src/front-components/thirteen-f-workspace/types';

export const SEC_REPORT_PERIOD = 'SEC_REPORT_PERIOD' as const;

export const periodOptionValue = (period: PeriodOption) =>
  `${period.asOfDate}:${period.dateBasis}`;

export const secReportPeriods = <T extends PeriodOption>(periods: T[]) =>
  [...periods]
    .filter((period) => period.dateBasis === SEC_REPORT_PERIOD)
    .sort((left, right) => right.asOfDate.localeCompare(left.asOfDate));

export const findSecReportPeriod = (
  periods: PeriodOption[],
  value: string,
) =>
  secReportPeriods(periods).find(
    (period) => periodOptionValue(period) === value,
  );

export const readPeriodCatalog = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_period_catalog');
  }
  const periods = (value as { periods?: unknown }).periods;
  if (
    !Array.isArray(periods) ||
    periods.some(
      (period) =>
        !period ||
        typeof period !== 'object' ||
        Array.isArray(period) ||
        typeof (period as { asOfDate?: unknown }).asOfDate !== 'string' ||
        ![SEC_REPORT_PERIOD, 'LEGACY_AS_OF_UNVERIFIED'].includes(
          String((period as { dateBasis?: unknown }).dateBasis),
        ),
    )
  ) {
    throw new Error('invalid_period_catalog');
  }
  return { periods: periods as PeriodOption[] };
};

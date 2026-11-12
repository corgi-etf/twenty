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

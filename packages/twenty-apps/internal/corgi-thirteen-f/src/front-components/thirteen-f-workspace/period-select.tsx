import { formatDate } from 'src/front-components/thirteen-f-workspace/format';
import {
  findSecReportPeriod,
  periodOptionValue,
  secReportPeriods,
} from 'src/front-components/thirteen-f-workspace/periods';
import type { PeriodOption } from 'src/front-components/thirteen-f-workspace/types';

type PeriodSelectProps = {
  periods: PeriodOption[];
  selectedPeriod: PeriodOption | undefined;
  fallbackAsOfDate?: string;
  onChange(period: PeriodOption | undefined): void;
};

const SELECT_STYLE = {
  border: '1px solid #D0D5DD',
  borderRadius: 9,
  background: '#FFFFFF',
  color: '#141414',
  fontSize: 13,
  padding: '10px 12px',
} as const;

const periodsByYear = (periods: PeriodOption[]) => {
  const groups = new Map<string, PeriodOption[]>();
  for (const period of secReportPeriods(periods)) {
    const year = period.asOfDate.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), period]);
  }
  return [...groups.entries()];
};

export const PeriodSelect = ({
  periods,
  selectedPeriod,
  fallbackAsOfDate,
  onChange,
}: PeriodSelectProps) => {
  const availablePeriods = secReportPeriods(periods);

  return (
    <select
      style={SELECT_STYLE}
      value={selectedPeriod ? periodOptionValue(selectedPeriod) : ''}
      aria-label="SEC report period"
      onChange={(event) =>
        onChange(findSecReportPeriod(availablePeriods, event.target.value))
      }
    >
      {availablePeriods.length === 0 ? (
        <option value="">
          {fallbackAsOfDate ? formatDate(fallbackAsOfDate) : 'Latest available'}
        </option>
      ) : null}
      {periodsByYear(availablePeriods).map(([year, yearPeriods]) => (
        <optgroup key={year} label={year}>
          {yearPeriods.map((period) => (
            <option
              key={periodOptionValue(period)}
              value={periodOptionValue(period)}
            >
              {formatDate(period.asOfDate)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};

import { useCorgiHome } from '@/corgi-crm/home/components/CorgiHomeProvider';
import {
  StyledCorgiActions,
  StyledCorgiHeading,
  StyledCorgiInput,
  StyledCorgiMuted,
  StyledCorgiPanel,
  StyledCorgiSelect,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiSectionState } from '@/corgi-crm/home/components/CorgiSectionState';
import { useCorgiHomeResource } from '@/corgi-crm/home/hooks/useCorgiHomeResource';
import {
  type CorgiPage,
  type CorgiTrendDay,
} from '@/corgi-crm/types/CorgiHome';
import {
  getCorgiDateRange,
  getCorgiDrilldownPath,
} from '@/corgi-crm/utils/corgiHomePresentation';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledChart = styled.div`
  align-items: end;
  display: flex;
  gap: 6px;
  height: 180px;
  margin: 20px 0 10px;
  overflow-x: auto;
  padding: 8px 0;
`;
const StyledDay = styled(Link)`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex: 1 0 28px;
  flex-direction: column;
  font-size: 10px;
  gap: 4px;
  justify-content: flex-end;
  text-decoration: none;
  span[data-bar] {
    background: ${themeCssVariables.color.blue};
    border-radius: 3px 3px 0 0;
    min-height: 2px;
    width: 80%;
  }
  &:hover span[data-bar] {
    opacity: 0.7;
  }
`;

export const CorgiActivityTrends = ({
  workspaceMemberId,
}: {
  workspaceMemberId?: string;
}) => {
  const { summary } = useCorgiHome();
  const [range, setRange] = useState('7');
  const [dates, setDates] = useState(() => getCorgiDateRange(7, new Date()));
  const [memberId, setMemberId] = useState(workspaceMemberId ?? '');
  const changeRange = (value: string) => {
    setRange(value);
    if (value !== 'custom')
      setDates(getCorgiDateRange(Number(value), new Date()));
  };
  return (
    <StyledCorgiPanel>
      <StyledCorgiHeading>
        <Trans>Activity trends</Trans>
      </StyledCorgiHeading>
      <StyledCorgiActions>
        <StyledCorgiSelect
          aria-label={t`Trend date range`}
          value={range}
          onChange={(event) => changeRange(event.target.value)}
        >
          <option value="7">{t`Last 7 days`}</option>
          <option value="30">{t`Last 30 days`}</option>
          <option value="custom">{t`Custom range`}</option>
        </StyledCorgiSelect>
        {!workspaceMemberId && (
          <StyledCorgiSelect
            aria-label={t`Trend employee`}
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
          >
            <option value="">{t`Team`}</option>
            {summary?.team.records.map((member) => (
              <option
                key={member.workspaceMemberId}
                value={member.workspaceMemberId}
              >
                {member.name}
              </option>
            ))}
          </StyledCorgiSelect>
        )}
        {range === 'custom' && (
          <>
            <StyledCorgiInput
              type="date"
              aria-label={t`Trend start date`}
              value={dates.from}
              onChange={(event) =>
                setDates((previous) => ({
                  ...previous,
                  from: event.target.value,
                }))
              }
            />
            <StyledCorgiInput
              type="date"
              aria-label={t`Trend end date`}
              value={dates.to}
              onChange={(event) =>
                setDates((previous) => ({
                  ...previous,
                  to: event.target.value,
                }))
              }
            />
          </>
        )}
      </StyledCorgiActions>
      <StyledCorgiMuted>
        {dates.from} – {dates.to} · America/Chicago ·{' '}
        <Trans>Today tiles remain unchanged.</Trans>
      </StyledCorgiMuted>
      {dates.from &&
      dates.to &&
      dates.from <= dates.to &&
      (Date.parse(dates.to) - Date.parse(dates.from)) / 86400000 < 366 ? (
        <CorgiTrendResults
          from={dates.from}
          to={dates.to}
          workspaceMemberId={workspaceMemberId ?? (memberId || undefined)}
        />
      ) : (
        <p role="status">
          <Trans>Choose a valid date range of up to 366 days.</Trans>
        </p>
      )}
    </StyledCorgiPanel>
  );
};

const CorgiTrendResults = ({
  from,
  to,
  workspaceMemberId,
}: {
  from: string;
  to: string;
  workspaceMemberId?: string;
}) => {
  const { data, loading, error, refetch } = useCorgiHomeResource<
    CorgiPage<CorgiTrendDay>
  >({ section: 'trends', from, to, workspaceMemberId });
  const { revision } = useCorgiHome();
  useEffect(() => {
    if (revision > 0) void refetch().catch(() => undefined);
  }, [revision, refetch]);
  const maximum = Math.max(
    1,
    ...(data?.records.map((day) => day.activities) ?? []),
  );
  const byType = new Map<string, number>();
  data?.records.forEach((day) =>
    Object.entries(day.byType).forEach(([type, count]) =>
      byType.set(type, (byType.get(type) ?? 0) + count),
    ),
  );
  return (
    <>
      <CorgiSectionState
        loading={loading}
        error={error}
        status={data?.status}
        empty={data?.records.length === 0}
        retry={() => void refetch().catch(() => undefined)}
      />
      {data?.status === 'available' && (
        <>
          <StyledChart aria-label={t`Daily activity volume`}>
            {data.records.map((day) => (
              <StyledDay
                key={day.date}
                to={getCorgiDrilldownPath({
                  section: 'activities',
                  from: day.date,
                  to: day.date,
                  workspaceMemberId,
                })}
                aria-label={t`${day.date}: ${day.activities} activities`}
                title={`${day.date}: ${day.activities}`}
              >
                <span>{day.activities}</span>
                <span
                  data-bar
                  style={{ height: `${(day.activities / maximum) * 120}px` }}
                />
                <span>{day.date.slice(5)}</span>
              </StyledDay>
            ))}
          </StyledChart>
          <StyledCorgiActions>
            {[...byType].map(([type, count]) => (
              <StyledCorgiMuted key={type}>
                {type}: {count}
              </StyledCorgiMuted>
            ))}
          </StyledCorgiActions>
        </>
      )}
    </>
  );
};

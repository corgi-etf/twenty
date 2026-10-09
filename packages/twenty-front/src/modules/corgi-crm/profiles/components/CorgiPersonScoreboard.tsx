import { QUICK_LOG_ACTIVITY_TYPES } from '@/activities/quick-log/constants/quickLogActivityTypes';
import {
  StyledCorgiHeading,
  StyledCorgiMuted,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiSectionState } from '@/corgi-crm/home/components/CorgiSectionState';
import { useCorgiHomeResource } from '@/corgi-crm/home/hooks/useCorgiHomeResource';
import {
  getCorgiDateRange,
  getCorgiDrilldownPath,
} from '@/corgi-crm/utils/corgiHomePresentation';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import {
  type CorgiPage,
  type CorgiTrendDay,
} from '@/corgi-crm/types/CorgiHome';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const SCOREBOARD_DAYS = 7;

const StyledScoreboard = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 8px;
`;

const StyledTile = styled(Link)`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 96px;
  padding: 8px 10px;
  text-decoration: none;
  &[data-total='true'] {
    background: ${themeCssVariables.tag.background.purple};
    color: ${themeCssVariables.tag.text.purple};
  }
  &:hover {
    border-color: ${themeCssVariables.border.color.medium};
  }
`;

const StyledCount = styled.span`
  font-size: 20px;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  line-height: 1.1;
`;

const StyledLabel = styled.span`
  font-size: 11px;
`;

type CorgiPersonScoreboardProps = {
  // Scoped by wholesaler record, not by workspace member: most wholesalers have
  // no login, and their activity would otherwise be unreportable.
  creditedWholesalerId: string;
};

// One request covers both windows: the response carries a byType breakdown per
// day, so today is the row matching the range end and the week is the sum.
export const CorgiPersonScoreboard = ({
  creditedWholesalerId,
}: CorgiPersonScoreboardProps) => {
  const { t } = useLingui();
  const { from, to } = getCorgiDateRange(SCOREBOARD_DAYS, new Date());
  const { data, loading, error, refetch } = useCorgiHomeResource<
    CorgiPage<CorgiTrendDay>
  >({ section: 'trends', from, to, creditedWholesalerId });

  const sumByType = (days: CorgiTrendDay[]) => {
    const totals = new Map<string, number>();
    days.forEach((day) =>
      Object.entries(day.byType).forEach(([type, count]) =>
        totals.set(type, (totals.get(type) ?? 0) + count),
      ),
    );

    return totals;
  };

  const windows =
    data?.status === 'available'
      ? [
          {
            key: 'today',
            heading: t`Today`,
            days: data.records.filter((day) => day.date === to),
            from: to,
          },
          {
            key: 'week',
            heading: t`Last ${SCOREBOARD_DAYS} days`,
            days: data.records,
            from,
          },
        ]
      : [];

  return (
    <section aria-label={t`Activity scoreboard`}>
      <StyledCorgiHeading>
        <Trans>What they did</Trans>
      </StyledCorgiHeading>
      <CorgiSectionState
        loading={loading}
        error={error}
        status={data?.status}
        empty={data?.records.length === 0}
        retry={() => void refetch().catch(() => undefined)}
      />
      {windows.map((window) => {
        const totals = sumByType(window.days);
        const activities = window.days.reduce(
          (total, day) => total + day.activities,
          0,
        );

        return (
          <div key={window.key}>
            <StyledCorgiMuted>{window.heading}</StyledCorgiMuted>
            <StyledScoreboard>
              <StyledTile
                data-total="true"
                to={getCorgiDrilldownPath({
                  section: 'activities',
                  from: window.from,
                  to,
                  creditedWholesalerId,
                })}
              >
                <StyledCount>{activities}</StyledCount>
                <StyledLabel>
                  <Trans>All activities</Trans>
                </StyledLabel>
              </StyledTile>
              {QUICK_LOG_ACTIVITY_TYPES.map(({ value, label }) => (
                <StyledTile
                  key={value}
                  to={getCorgiDrilldownPath({
                    section: 'activities',
                    from: window.from,
                    to,
                    creditedWholesalerId,
                  })}
                >
                  <StyledCount>{totals.get(value) ?? 0}</StyledCount>
                  <StyledLabel>{t(label)}</StyledLabel>
                </StyledTile>
              ))}
            </StyledScoreboard>
          </div>
        );
      })}
    </section>
  );
};

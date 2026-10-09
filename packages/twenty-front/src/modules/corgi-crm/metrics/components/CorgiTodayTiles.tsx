import { useCorgiHome } from '@/corgi-crm/home/components/CorgiHomeProvider';
import { StyledCorgiMuted } from '@/corgi-crm/home/components/CorgiHomeStyles';
import {
  type CorgiMetric,
  type CorgiMetricKey,
} from '@/corgi-crm/types/CorgiHome';
import {
  formatCorgiMoney,
  getCorgiDrilldownPath,
} from '@/corgi-crm/utils/corgiHomePresentation';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Link } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledTiles = styled.div`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  &[data-compact='true'] {
    gap: 6px;
  }
  @media (max-width: 1050px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  @media (max-width: 600px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;
const StyledTile = styled(Link)`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  text-decoration: none;
  &[data-compact='true'] {
    gap: 3px;
    padding: 8px 10px;
  }
  &[aria-disabled='true'] {
    pointer-events: none;
  }
  &:hover {
    border-color: ${themeCssVariables.color.blue};
  }
  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
  }
`;
const StyledValue = styled.strong`
  font-size: 26px;
  font-weight: 600;
  overflow-wrap: anywhere;
  &[data-compact='true'] {
    font-size: 17px;
  }
`;

export const getCorgiMetricLabel = (key: CorgiMetricKey) =>
  ({
    activities: t`Activities this week`,
    meetingsSet: t`Meetings set this week`,
    meetingsTaken: t`Meetings taken this week`,
    allocations: t`Allocation amount logged this week`,
    currentClients: t`Current clients`,
  })[key];

const displayMetric = (
  metric: CorgiMetric | undefined,
  key: CorgiMetricKey,
) => {
  if (!metric) return '…';
  if (metric.status === 'denied') return t`No access`;
  if (metric.status === 'unavailable') return t`Unavailable`;
  return key === 'allocations'
    ? formatCorgiMoney(metric.amounts ?? []) || t`No allocations`
    : (metric.count?.toLocaleString() ?? t`Unavailable`);
};

export const CorgiTodayTiles = ({ compact = false }: { compact?: boolean }) => {
  const { summary } = useCorgiHome();
  const keys: CorgiMetricKey[] = [
    'activities',
    'meetingsSet',
    'meetingsTaken',
    'allocations',
    'currentClients',
  ];
  return (
    <StyledTiles data-compact={compact}>
      {keys.map((key) => {
        const metric = summary?.today.metrics[key];
        return (
          <StyledTile
            key={key}
            to={getCorgiDrilldownPath(
              key === 'currentClients' || !summary
                ? { section: key }
                : {
                    section: key,
                    from: summary.today.from,
                    to: summary.today.date,
                  },
            )}
            data-compact={compact}
            aria-disabled={metric?.status !== 'available'}
            tabIndex={metric?.status === 'available' ? 0 : -1}
          >
            <StyledCorgiMuted>{getCorgiMetricLabel(key)}</StyledCorgiMuted>
            <StyledValue data-compact={compact}>
              {displayMetric(metric, key)}
            </StyledValue>
            {!compact && (
              <StyledCorgiMuted>
                {key === 'currentClients'
                  ? t`Distinct companies with allocations · all time`
                  : t`Your permitted team records · this week`}
              </StyledCorgiMuted>
            )}
          </StyledTile>
        );
      })}
    </StyledTiles>
  );
};

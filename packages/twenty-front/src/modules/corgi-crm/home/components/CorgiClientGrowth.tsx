import {
  StyledCorgiHeading,
  StyledCorgiMuted,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiSectionState } from '@/corgi-crm/home/components/CorgiSectionState';
import { useCorgiHomeResource } from '@/corgi-crm/home/hooks/useCorgiHomeResource';
import {
  type CorgiClientGrowthPoint,
  type CorgiPage,
} from '@/corgi-crm/types/CorgiHome';
import {
  formatCorgiMoney,
  getCorgiDateRange,
} from '@/corgi-crm/utils/corgiHomePresentation';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const GROWTH_DAYS = 180;

const StyledChart = styled.div`
  align-items: end;
  display: flex;
  gap: 2px;
  height: 160px;
  margin: 16px 0 8px;
  overflow-x: auto;
  padding: 8px 0;
`;

const StyledPoint = styled.div`
  display: flex;
  flex: 1 0 4px;
  flex-direction: column;
  height: 100%;
  justify-content: flex-end;
  min-width: 4px;
  /* A day a firm first allocated is the event worth seeing, so it is marked on
     top of the running total rather than drawn as its own series. */
  &[data-new='true'] [data-bar] {
    background: ${themeCssVariables.tag.background.green};
    border-top: 2px solid ${themeCssVariables.tag.text.green};
  }
`;

const StyledBar = styled.span`
  background: ${themeCssVariables.background.tertiary};
  border-radius: 1px 1px 0 0;
  display: block;
  width: 100%;
`;

const StyledFooter = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
  justify-content: space-between;
`;

export const CorgiClientGrowth = () => {
  const { t } = useLingui();
  const { from, to } = getCorgiDateRange(GROWTH_DAYS, new Date());
  const { data, loading, error, refetch } = useCorgiHomeResource<
    CorgiPage<CorgiClientGrowthPoint>
  >({ section: 'clientGrowth', from, to });

  const records = data?.status === 'available' ? data.records : [];
  const peak = Math.max(1, ...records.map((point) => point.totalClients));
  const latest = records.at(-1);
  const gained = records.reduce((total, point) => total + point.newClients, 0);
  const allocated = formatCorgiMoney(records.flatMap((point) => point.amounts));

  return (
    <section aria-label={t`Client growth`}>
      <StyledCorgiHeading>
        <Trans>Growth</Trans>
      </StyledCorgiHeading>
      <CorgiSectionState
        loading={loading}
        error={error}
        status={data?.status}
        empty={records.length === 0}
        retry={() => void refetch().catch(() => undefined)}
      />
      {records.length > 0 && (
        <>
          <StyledChart aria-label={t`Current clients over time`}>
            {records.map((point) => (
              <StyledPoint
                key={point.date}
                data-new={point.newClients > 0}
                title={t`${point.date}: ${point.totalClients} clients, ${point.newClients} new`}
              >
                <StyledBar
                  data-bar
                  style={{
                    height: `${(point.totalClients / peak) * 100}%`,
                  }}
                />
              </StyledPoint>
            ))}
          </StyledChart>
          <StyledFooter>
            <StyledCorgiMuted>
              <Trans>
                {latest?.totalClients ?? 0} current clients · {gained} gained in
                the last {GROWTH_DAYS} days
              </Trans>
            </StyledCorgiMuted>
            {allocated.length > 0 && (
              <StyledCorgiMuted>
                <Trans>Allocated in range</Trans>: {allocated}
              </StyledCorgiMuted>
            )}
          </StyledFooter>
        </>
      )}
    </section>
  );
};

import { CorgiActiveClients } from '@/corgi-crm/home/components/CorgiActiveClients';
import { CorgiActivityTrends } from '@/corgi-crm/home/components/CorgiActivityTrends';
import { CorgiBusinessRecordRow } from '@/corgi-crm/home/components/CorgiBusinessRecordRow';
import { CorgiCelebrationPreference } from '@/corgi-crm/home/components/CorgiCelebrationPreference';
import { CorgiDrilldown } from '@/corgi-crm/home/components/CorgiDrilldown';
import { CorgiFollowUpCompanies } from '@/corgi-crm/home/components/CorgiFollowUpCompanies';
import { CorgiFollowUpRow } from '@/corgi-crm/home/components/CorgiFollowUpRow';
import { useCorgiHome } from '@/corgi-crm/home/components/CorgiHomeProvider';
import {
  StyledCorgiActions,
  StyledCorgiButton,
  StyledCorgiHeading,
  StyledCorgiMuted,
  StyledCorgiPanel,
} from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiLatestRecords } from '@/corgi-crm/home/components/CorgiLatestRecords';
import { CorgiMeetingRow } from '@/corgi-crm/home/components/CorgiMeetingRow';
import { CorgiQuickActions } from '@/corgi-crm/home/components/CorgiQuickActions';
import { CorgiSectionState } from '@/corgi-crm/home/components/CorgiSectionState';
import { CorgiTeamPerformance } from '@/corgi-crm/home/components/CorgiTeamPerformance';
import { CorgiWinRow } from '@/corgi-crm/home/components/CorgiWinRow';
import { CorgiTodayTiles } from '@/corgi-crm/metrics/components/CorgiTodayTiles';
import {
  type CorgiHomeQuery,
  type CorgiPage,
} from '@/corgi-crm/types/CorgiHome';
import {
  formatCorgiDateTime,
  getCorgiDrilldownPath,
  getCorgiSectionLabel,
} from '@/corgi-crm/utils/corgiHomePresentation';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { MobileHomePage } from '~/pages/mobile-home/MobileHomePage';

const StyledPage = styled.main`
  background: ${themeCssVariables.background.secondary};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 28px;
  width: 100%;
  @media (max-width: 600px) {
    padding: 14px;
  }
`;
const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 0 auto;
  max-width: 1600px;
`;
const StyledGrid = styled.div`
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  @media (max-width: 950px) {
    grid-template-columns: 1fr;
  }
`;
const StyledHeader = styled.header`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
  h1 {
    font-size: 26px;
    margin: 0 0 6px;
  }
`;

export const CorgiHomePage = () => {
  const { enabled, summary, loading, error, refresh } = useCorgiHome();
  const [params] = useSearchParams();
  if (!enabled) return <MobileHomePage />;
  const query = Object.fromEntries(params.entries()) as CorgiHomeQuery;
  const section = query.section;
  return (
    <StyledPage>
      <StyledContent>
        <StyledHeader>
          <div>
            <h1>{section ? getCorgiSectionLabel(section) : t`Home`}</h1>
            <StyledCorgiMuted>
              {summary?.today.date} · America/Chicago ·{' '}
              {summary ? (
                <>
                  <Trans>Updated</Trans>{' '}
                  {formatCorgiDateTime(summary.generatedAt)}
                </>
              ) : (
                t`Loading your workspace`
              )}
            </StyledCorgiMuted>
          </div>
          <CorgiQuickActions />
        </StyledHeader>
        <CorgiSectionState
          error={error}
          loading={!summary && loading}
          retry={refresh}
        />
        <StyledCorgiActions>
          {section && (
            <Link to="/home">
              <Trans>Back to Home</Trans>
            </Link>
          )}
          <StyledCorgiButton onClick={refresh} disabled={loading}>
            <Trans>Refresh</Trans>
          </StyledCorgiButton>
          <Link to="/home?section=liveWins">
            <Trans>Notification history</Trans>
          </Link>
        </StyledCorgiActions>
        <CorgiTodayTiles compact={Boolean(section)} />
        {section ? (
          <>
            <StyledCorgiPanel>
              <CorgiLatestRecords compact />
            </StyledCorgiPanel>
            <CorgiDrilldown key={params.toString()} query={query} />
          </>
        ) : (
          <>
            <StyledCorgiPanel>
              <CorgiLatestRecords />
            </StyledCorgiPanel>
            <StyledGrid>
              <HomeSection
                title={t`My follow-ups`}
                query={{
                  section: 'followUps',
                  scope: 'assigned',
                  status: 'open',
                }}
                page={summary?.followUps}
              >
                {summary?.followUps.records.map((reminder) => (
                  <CorgiFollowUpRow key={reminder.id} reminder={reminder} />
                ))}
              </HomeSection>
              <HomeSection
                title={t`Today's meetings`}
                query={{ section: 'agenda' }}
                page={summary?.agenda}
              >
                {summary?.agenda.records.map((meeting) => (
                  <CorgiMeetingRow key={meeting.id} meeting={meeting} />
                ))}
              </HomeSection>
            </StyledGrid>
            <CorgiFollowUpCompanies />
            <CorgiTeamPerformance />
            <CorgiActivityTrends />
            <StyledGrid>
              <CorgiActiveClients />
              <HomeSection
                title={t`Recent allocations`}
                query={{ section: 'allocations', allTime: 'true' }}
                page={summary?.recentAllocations}
              >
                {summary?.recentAllocations.records.map((record) => (
                  <CorgiBusinessRecordRow key={record.id} record={record} />
                ))}
              </HomeSection>
            </StyledGrid>
            <HomeSection
              title={t`Live wins`}
              query={{ section: 'liveWins' }}
              page={summary?.liveWins}
            >
              {summary?.liveWins.records.map((win) => (
                <CorgiWinRow key={win.id} win={win} />
              ))}
            </HomeSection>
            <CorgiCelebrationPreference />
          </>
        )}
      </StyledContent>
    </StyledPage>
  );
};

const HomeSection = ({
  title,
  query,
  page,
  children,
}: {
  title: string;
  query: CorgiHomeQuery;
  page?: CorgiPage<unknown>;
  children: ReactNode;
}) => (
  <StyledCorgiPanel>
    <StyledCorgiActions>
      <StyledCorgiHeading>{title}</StyledCorgiHeading>
      {page?.status === 'available' && (
        <Link to={getCorgiDrilldownPath(query)}>
          <Trans>View all</Trans>
          {page.totalCount !== null && ` (${page.totalCount})`}
        </Link>
      )}
    </StyledCorgiActions>
    <CorgiSectionState
      status={page?.status}
      loading={!page}
      empty={page?.records.length === 0}
    />
    {page?.status === 'available' && children}
  </StyledCorgiPanel>
);

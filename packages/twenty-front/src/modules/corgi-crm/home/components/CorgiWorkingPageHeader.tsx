import { useCorgiHome } from '@/corgi-crm/home/components/CorgiHomeProvider';
import { StyledCorgiMuted } from '@/corgi-crm/home/components/CorgiHomeStyles';
import { CorgiLatestRecords } from '@/corgi-crm/home/components/CorgiLatestRecords';
import { CorgiTodayTiles } from '@/corgi-crm/metrics/components/CorgiTodayTiles';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { Link, useLocation } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledHeader = styled.aside`
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 8px;
  max-height: 260px;
  overflow: auto;
  padding: 10px 16px;
  @media print {
    display: none;
  }
  @media (max-width: 600px) {
    max-height: 180px;
  }
`;
export const CorgiWorkingPageHeader = () => {
  const { enabled, summary } = useCorgiHome();
  const { pathname } = useLocation();
  if (
    !enabled ||
    summary?.enabled === false ||
    pathname === '/home' ||
    pathname.startsWith('/settings')
  )
    return null;
  return (
    <StyledHeader aria-label={t`CRM daily overview`}>
      <StyledCorgiMuted>
        <Link to="/home">
          <Trans>Home</Trans>
        </Link>{' '}
        · <Trans>Today</Trans> · America/Chicago ·{' '}
        <Link to="/home?section=liveWins">
          <Trans>Notifications</Trans>
        </Link>
      </StyledCorgiMuted>
      <CorgiTodayTiles compact />
      <CorgiLatestRecords compact />
    </StyledHeader>
  );
};

import { useLingui } from '@lingui/react/macro';
import { useLocation } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { IconMap } from 'twenty-ui/icon';

import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { useWholesalerMapAccess } from '@/wholesaler-map/hooks/useWholesalerMapAccess';

export const WholesalerMapNavigationItem = () => {
  const { t } = useLingui();
  const location = useLocation();
  const { canViewMap } = useWholesalerMapAccess();

  if (!canViewMap) {
    return null;
  }

  return (
    <NavigationDrawerItem
      active={location.pathname === AppPath.WholesalerMapPage}
      Icon={IconMap}
      label={t`Wholesaler coverage`}
      to={AppPath.WholesalerMapPage}
      triggerEvent="CLICK"
    />
  );
};

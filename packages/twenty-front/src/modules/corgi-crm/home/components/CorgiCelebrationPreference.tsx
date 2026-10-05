import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import {
  getCorgiCelebrationPreferenceKey,
  getCorgiCelebrationsEnabled,
  setCorgiCelebrationsEnabled,
} from '@/corgi-crm/events/utils/corgiCelebrationPreferences';
import { StyledCorgiMuted } from '@/corgi-crm/home/components/CorgiHomeStyles';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';

export const CorgiCelebrationPreference = () => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const key = getCorgiCelebrationPreferenceKey(
    currentWorkspace?.id ?? '',
    currentWorkspaceMember?.id ?? '',
  );
  const [enabled, setEnabled] = useState(() =>
    getCorgiCelebrationsEnabled(key),
  );
  return (
    <StyledCorgiMuted>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
            setCorgiCelebrationsEnabled(key, event.target.checked);
          }}
        />{' '}
        <Trans>Celebrate my new meetings and allocations</Trans>
      </label>
    </StyledCorgiMuted>
  );
};

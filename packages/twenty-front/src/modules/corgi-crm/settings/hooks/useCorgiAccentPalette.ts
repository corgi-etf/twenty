import { useCallback } from 'react';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { corgiAccentPalettesState } from '@/corgi-crm/settings/states/corgiAccentPalettesState';
import {
  getCorgiAccentPalette,
  type CorgiAccentPalette,
} from '@/corgi-crm/settings/utils/corgiAccentPalette';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

export const useCorgiAccentPalette = () => {
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const [corgiAccentPalettes, setCorgiAccentPalettes] = useAtomState(
    corgiAccentPalettesState,
  );
  const key =
    currentWorkspaceMember && currentWorkspace
      ? `${currentWorkspace.id}:${currentWorkspaceMember.id}`
      : undefined;
  const setPalette = useCallback(
    (value: CorgiAccentPalette) => {
      if (key)
        setCorgiAccentPalettes((previous) =>
          previous[key] === value ? previous : { ...previous, [key]: value },
        );
    },
    [key, setCorgiAccentPalettes],
  );
  return {
    palette: getCorgiAccentPalette(key ? corgiAccentPalettes[key] : undefined),
    hasPalette: Boolean(key && corgiAccentPalettes[key]),
    memberId: currentWorkspaceMember?.id,
    setPalette,
  };
};

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
  const member = useAtomStateValue(currentWorkspaceMemberState);
  const workspace = useAtomStateValue(currentWorkspaceState);
  const [palettes, setPalettes] = useAtomState(corgiAccentPalettesState);
  const key = member && workspace ? `${workspace.id}:${member.id}` : undefined;
  const setPalette = useCallback(
    (value: CorgiAccentPalette) => {
      if (key)
        setPalettes((previous) =>
          previous[key] === value ? previous : { ...previous, [key]: value },
        );
    },
    [key, setPalettes],
  );
  return {
    palette: getCorgiAccentPalette(key ? palettes[key] : undefined),
    hasPalette: Boolean(key && palettes[key]),
    memberId: member?.id,
    setPalette,
  };
};

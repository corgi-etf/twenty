import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';
import { type CorgiAccentPalette } from '@/corgi-crm/settings/utils/corgiAccentPalette';
export const corgiAccentPalettesState = createAtomState<
  Record<string, CorgiAccentPalette>
>({
  key: 'corgiAccentPalettesByMember',
  defaultValue: {},
  useLocalStorage: true,
});

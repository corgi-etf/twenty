export const CORGI_ACCENT_PALETTES = [
  'Blue',
  'Teal',
  'Violet',
  'Warm',
] as const;
export type CorgiAccentPalette = (typeof CORGI_ACCENT_PALETTES)[number];
export const getCorgiAccentPalette = (value: unknown): CorgiAccentPalette =>
  CORGI_ACCENT_PALETTES.includes(value as CorgiAccentPalette)
    ? (value as CorgiAccentPalette)
    : 'Blue';

export const getCorgiAccentOverrides = (
  palette: CorgiAccentPalette,
  isDark: boolean,
): Record<string, string> => {
  const colors = {
    Blue: ['#2563eb', '#93c5fd', 'blue'],
    Teal: ['#0f766e', '#5eead4', 'turquoise'],
    Violet: ['#6d28d9', '#c4b5fd', 'purple'],
    Warm: ['#b45309', '#fcd34d', 'orange'],
  }[palette];
  const primary = isDark ? colors[1] : colors[0];
  return {
    '--t-accent-primary': primary,
    '--t-accent-secondary': `color-mix(in srgb, ${primary} 75%, transparent)`,
    '--t-accent-tertiary': `color-mix(in srgb, ${primary} 22%, transparent)`,
    '--t-accent-quaternary': `color-mix(in srgb, ${primary} 12%, transparent)`,
    '--t-accent-accent3570': primary,
    '--t-accent-accent4060': primary,
    ...Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `--t-accent-accent${index + 1}`,
        `var(--t-color-${colors[2]}${index + 1})`,
      ]),
    ),
  };
};

/* oxlint-disable twenty/no-hardcoded-colors --
 * MapLibre cannot parse the CSS Color 4 display-p3 values emitted by the theme.
 */
export const WHOLESALER_COVERAGE_MAP_COLORS = {
  clusterHigh: '#f76707',
  clusterLow: '#4263eb',
  clusterMedium: '#2f9e44',
  invertedText: '#ffffff',
  owners: [
    '#4263eb',
    '#e03131',
    '#f76707',
    '#2f9e44',
    '#1098ad',
    '#7048e8',
    '#f59f00',
    '#0ca678',
  ],
  unassignedOwner: '#868e96',
} as const;

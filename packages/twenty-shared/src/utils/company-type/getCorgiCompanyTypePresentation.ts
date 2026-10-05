// Presentation only: never use these aliases to rewrite a saved firmType.
// Matching is exact after case, whitespace, underscore, and dash normalization.
// Compound/hybrid or unlisted values stay unmapped; no substring inference.
const definitions = [
  {
    category: 'ria',
    label: 'RIA',
    color: 'blue',
    aliases: [
      'ria',
      'r.i.a.',
      'registered investment adviser',
      'registered investment advisor',
      'registered investment advisers',
      'registered investment advisors',
    ],
  },
  {
    category: 'brokerDealer',
    label: 'Broker-dealer',
    color: 'purple',
    aliases: ['broker dealer', 'broker dealers', 'broker/dealer'],
  },
  {
    category: 'bank',
    label: 'Bank',
    color: 'orange',
    aliases: ['bank', 'banks'],
  },
  {
    category: 'familyOffice',
    label: 'Family office',
    color: 'turquoise',
    aliases: ['family office', 'family offices'],
  },
  {
    category: 'assetManager',
    label: 'Asset manager',
    color: 'pink',
    aliases: [
      'asset manager',
      'asset managers',
      'assetmanager',
      'asset management',
    ],
  },
  {
    category: 'institution',
    label: 'Institution',
    color: 'yellow',
    aliases: [
      'institution',
      'institutions',
      'institutional investor',
      'institutional investors',
    ],
  },
] as const;

export const getCorgiCompanyTypePresentation = (
  rawValue: string | null | undefined,
) => {
  if (!rawValue?.trim()) return undefined;
  const normalized = rawValue
    .trim()
    .toLowerCase()
    .replace(/[\s_\u2010-\u2015-]+/g, ' ');
  const definition = definitions.find(({ aliases }) =>
    aliases.some((alias) => alias === normalized),
  );
  return definition
    ? {
        rawValue,
        category: definition.category,
        label: definition.label,
        color: definition.color,
        isMapped: true,
      }
    : {
        rawValue,
        category: 'unmapped' as const,
        label: rawValue,
        color: 'gray' as const,
        isMapped: false,
      };
};

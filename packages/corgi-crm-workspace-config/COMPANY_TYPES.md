# Company type presentation

The saved `company.firmType` remains unchanged. Company tables and profiles use the same dependency-free resolver as the read-only inventory helper. Matching is exact after trimming, lowercasing, and collapsing spaces, underscores, ASCII hyphens, and Unicode dashes to a space. It never uses substring matching or classifies combined/ambiguous values.

| Display label | Semantic tag color | Accepted aliases after normalization |
| --- | --- | --- |
| RIA | Blue | ria; r.i.a.; registered investment adviser/advisor (singular or plural) |
| Broker-dealer | Purple | broker dealer; broker dealers; broker/dealer |
| Bank | Orange | bank; banks |
| Family office | Turquoise | family office; family offices |
| Asset manager | Pink | asset manager; asset managers; assetmanager; asset management |
| Institution | Yellow | institution; institutions; institutional investor; institutional investors |

Unknown values display their original text in gray, with the accessible tooltip **Unmapped company type**. For example, `Bank / RIA hybrid` stays unmapped. Empty/whitespace-only values display no type badge. These colors use the existing semantic tag palette and do not change with a user's accent preference.

`buildCompanyTypeInventory(companies, expectedCompanyCount)` accepts a complete distinct company inventory and returns:

- `companyCount` and `emptyCount`;
- `values`: each distinct nonblank **raw** value, its count, presentation category, label, and color;
- `unmapped`: distinct raw values/counts needing review.

`readCompanyTypeInventory({ request, expectedCompanyCount, requestGate })` collects the same report through query-only Core GraphQL requests. Use the tenant-verified admin session context from the rollout tools. It exhausts pagination, rejects missing/repeated cursors and duplicate IDs, checks exact company coverage, and rechecks the count after the scan. It does not read company names, modify records, create a workflow dataset, or change metadata. Raw case/spacing variants remain separate report rows even when they share a presentation category.

Review unmapped entries before extending the documented aliases. A presentation alias is not authorization to rewrite source data or combine business categories.

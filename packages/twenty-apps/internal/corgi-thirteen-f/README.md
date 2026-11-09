# Corgi 13F Library

This private Twenty app adds a native `13F Filing` object to the CRM. Records
appear in the **13F Filings** navigation item and use Twenty's native file field
for preview and download.

The object API names are `thirteenFFiling` and `thirteenFFilings`. Importers use
`sourceDriveId`, `sourceNodeId`, and `sourceVersionId` to preserve provenance and
avoid creating duplicate records.

## Local validation

```bash
yarn install
yarn lint
yarn typecheck
yarn test
```

## Workspace installation

Authenticate to the intended Twenty workspace with `yarn twenty remote:add`, then
use `yarn twenty dev` for a local workspace. Production installation and the
initial file import are separate, explicitly approved deployment steps.

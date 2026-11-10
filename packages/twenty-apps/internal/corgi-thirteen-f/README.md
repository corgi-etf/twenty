# Corgi 13F

This private Twenty app provides one native **13F** workspace for reviewing
firms and their holdings. Users can search by firm, ticker, issuer, CUSIP, or
CIK; select an as-of date; inspect a firm's positions and filing history; and
reverse-search a security to find every holding firm.

The website 13F bounded context owns the canonical filing and holding records.
The CRM stores no copies of that dataset and exposes no document or download
surface. An authenticated Twenty logic function proxies a fixed set of
read-only requests so the website credential never reaches the browser.

Linked Company records receive a read-only `thirteenFFirmId` projection. It is
used only to conditionally show **View 13F holdings**; unlinked companies have
no 13F action.

## Application variables

- `CORGI_THIRTEEN_F_API_BASE_URL`: website origin serving the internal 13F API.
- `CORGI_THIRTEEN_F_API_READ_TOKEN`: secret bearer credential for that API.
- `CORGI_THIRTEEN_F_WORKSPACE_ID`: only Twenty workspace allowed through the
  proxy.

## Local validation

```bash
yarn install
yarn lint
yarn typecheck
yarn test
yarn twenty dev:build
```

Applying the app to a Twenty workspace and setting its variables are separate,
explicitly approved release steps.

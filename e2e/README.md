# Browser end-to-end suite

52 Playwright tests that drive the real storefront, API and Postgres the way a shopper
and an operator do.

## Prerequisites

```bash
# Postgres running and seeded
cd apps/backend && npm run seed

# backend (:9000) and storefront (:3000)
npm run dev

# from the repo root
pnpm exec playwright install chromium   # first run only
```

The storefront build must point its browser API base at the backend. For local runs use
`apps/storefront/.env.local`:

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

After `verify-all` the storefront is built with `NEXT_PUBLIC_BACKEND_URL=/api` to simulate
the nginx deployment. The Next config proxies `/api/*` to the backend, so the suite works
against that build too.

Admin credentials default to `dev-admin-token-please-change-123456`; override with
`ADMIN_TOKEN`. The API base can be overridden with `API_URL`, the storefront with
`BASE_URL`.

## Run

```bash
pnpm test:e2e            # serial, one worker (shared database)
pnpm test:e2e:report     # HTML report from the last run
```

`e2e/global-setup.js` tops test SKUs back up to 50 units and removes leftover
`e2e-product-*` catalogue entries so repeated runs don't exhaust stock or skew counts.
The suite creates real orders, accounts, returns and reviews in the local database.

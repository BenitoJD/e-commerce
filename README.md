# ToolsKart — Toolsvilla-style Machinery & Tools Store

Production-shaped ecommerce monorepo for the Indian tools/machinery market:
Next.js storefront + Express/Postgres backend + Razorpay payments, deployable on a single VPS.

Full parity matrix vs toolsvilla.com: [`docs/PARITY.md`](docs/PARITY.md).

## Structure

```
toolsvilla-clone/
  apps/backend/       Express + Postgres + Razorpay
    data/             30-product catalog + seeded coupons (source of truth)
    sql/schema.sql    idempotent schema (safe to run on every boot)
    src/routes/       products, search, checkout, webhooks, quotes, engage,
                      service, invoice, admin, sitemap
    src/lib/          pricing, stock reservation, order state machine, refunds,
                      rate limiting, security helpers, text helpers
    src/lib/__tests__ unit + route-level integration suites (in-memory DB)
  apps/storefront/    Next.js 14 App Router (29 routes)
    app/              homepage, category, product, cart, checkout, orders,
                      tracking, invoice, returns, admin, policies…
    components/       client views (ProductView, CategoryView, BrandView, HomeView…)
    public/images/    30 generated placeholder product images (SVG)
    lib/              api client, cart, wishlist, store config, server API base
    test/             35 client-logic tests (no install needed)
  packages/shared/    INR / GST / EMI helpers
  infra/nginx.conf    reverse proxy (storefront + backend + webhooks)
  scripts/            smoke.mjs, validate-compose.cjs, gen-product-images.mjs
  docker-compose.yml  postgres + backend + storefront + nginx
  docs/               SETUP, RAZORPAY, VPS-DEPLOY, PARITY
```

## Quick start (local, no Docker)

```bash
# 1. Backend (needs Postgres; DATABASE_URL in .env)
cd apps/backend
npm install
cp .env.example .env      # DATABASE_URL + Razorpay test keys + ADMIN_TOKEN
npm run seed              # repeatable: refreshes catalogue, never resets stock
npm run dev               # http://localhost:9000/health

# 2. Storefront
cd ../storefront
npm install
cp .env.example .env.local
# local dev without nginx: NEXT_PUBLIC_BACKEND_URL=http://localhost:9000
npm run dev               # http://localhost:3000
```

Admin console: open `/admin`, paste your `ADMIN_TOKEN`.

## Quick start (VPS, one command)

```bash
cp .env.example .env      # Razorpay live keys, ADMIN_TOKEN, domain
#   NEXT_PUBLIC_BACKEND_URL=/api            (browser: same origin, nginx routes /api)
#   BACKEND_INTERNAL_URL=http://backend:9000 (server: SSR + /sitemap.xml rewrite)
#   NEXT_PUBLIC_SITE_URL=https://yourdomain.com
docker compose up -d --build
docker compose exec backend npm run seed
# store: http://YOUR_IP  (nginx :80)   api: http://YOUR_IP/api/health
```

Compose runs postgres + backend + storefront + nginx (single domain: store at `/`,
API at `/api/*`). Drop the `nginx:` block for a two-subdomain Cloudflare Tunnel setup.
Point your domain at the VPS, then set the Razorpay webhook to
`https://yourdomain.com/api/webhooks/razorpay`. Details: `docs/VPS-DEPLOY.md`.
`NEXT_PUBLIC_*` values are baked in at **build** time — changing them requires a rebuild.

## Storefront features

Shopping: homepage strips (deals, brands, recently viewed) · category listing with
brand/price/sort/text filters and load-more · product pages with specs, EMI 3/6/9/12,
video embeds, pincode ETA, reviews + Q&A, related items, WhatsApp share · search with typeahead ·
wishlist (move one / move all, skips out-of-stock) · cart with live stock checks,
clear-all and coupons · Razorpay checkout (UPI/cards/netbanking/EMI) · COD capped at
`COD_MAX_PAISE` (default ₹20,000) and enforced server-side · optional buyer GSTIN for
business invoices · server-authoritative totals.

After the sale: order success with live status polling · track order + customer cancel ·
my orders by phone with **reorder** and per-order WhatsApp help · printable GST invoice
(buyer GSTIN, item lines, shipping, coupon, payment mode — totals reconcile) · returns/exchange form with **status lookup** · back-in-stock alerts.

Trust: 9 policy pages, GST invoice messaging, pan-India delivery, newsletter
(admin can list subscribers and export CSV).

Hardening: security headers (nosniff, frame-deny, referrer, permissions, HSTS over
HTTPS), `x-powered-by` off, CORS allowlist via `FRONTEND_URL`, per-IP limits on public
writes (`RATE_LIMIT_*`), separate admin throttle (`ADMIN_RATE_LIMIT_*`), constant-time
admin token compare, parameterised SQL everywhere, short-TTL SSR cache
(`SSR_CACHE_TTL_MS`) so traffic bursts don't hammer Postgres, and `X-Request-Id` on every response for support traces.

SEO: server-rendered homepage, product, category, brand, brand-directory and deals pages; Product JSON-LD (incl. ratings + itemCondition);
per-page titles/descriptions/canonical/OG; Organization + WebSite/SearchAction + BreadcrumbList; visible breadcrumbs; generated `robots.txt` from
`NEXT_PUBLIC_SITE_URL`; `/sitemap.xml` covering products, categories and brands.

## Admin console (`/admin`, header `x-admin-token`)

Overview (orders today, revenue today, 7-day revenue, unpaid/COD pending, manual refunds, status breakdown, low stock, new quotes) ·
Orders (filter, search by receipt/name/phone, **open an order for items/address/payment**,
refund status, guarded status transitions, **date-range filters and CSV export for accounting**) · **Products
(create/edit/delete without touching seed files)** · Returns · Quotes (convert to order at
an agreed price, WhatsApp customer) · Coupons (CRUD with expiry/usage caps) · Messages
(+ **newsletter subscriber list and CSV export**, WhatsApp reply) · Reviews/Questions
(verify, answer, delete) · Stock (update by slug).

## Tests

Everything that runs without Docker/Postgres, in one command:

```bash
node scripts/verify-all.mjs   # 6/6: both suites, compose, build, repo audits
node scripts/verify-clone.mjs # clones the pushed repo and runs 5 checks on it
```

Individually:
cd apps/backend && npm test        # 226 tests: pricing/GST/EMI, catalog, coupons,
                                   # webhooks, transitions, refunds, rate limiting,
                                   # security, sitemap, seed plan, API contract, health,
                                   # route-level integration on an in-memory DB
cd apps/storefront && npm test     # 90 tests: catalog filters, cart self-healing +
                                   # reorder + stock status, wishlist, store config,
                                   # API base resolution, paise→rupee, errors, video allowlist
cd apps/storefront && npm run build # must compile all 29 routes
cd apps/storefront && npm start     # production server (same thing the image runs)
```

The image runs a normal production build + `next start` (no Next `standalone` output):
in a pnpm monorepo the traced standalone tree mirrors the repo layout and depends on
symlinks, which is a silent deploy trap. Verified by booting `next start` and fetching
every route (home, product, returns, admin, robots.txt, sitemap rewrite).

Seed is **repeatable**: `npm run seed` refreshes names/prices/images/specs/videos and
coupon terms, but never overwrites live `stock` or coupon `used_count`/`active`.

Product images are generated placeholders (`scripts/gen-product-images.mjs`); a test
fails if any catalog image path has no file behind it. Replace with real photography by
overwriting `apps/storefront/public/images/<slug>.svg` (or pointing `images[]` at your files).

Fresh-clone check before trusting a deploy: clone into an empty directory and run the
suites there — that is how the missing-catalog-files bug was caught.

Route smoke test (needs the site running):

```bash
BASE_URL=http://localhost:3000 PRODUCT_SLUG=bosch-gsb-13-re-drill BRAND=Bosch \
  node scripts/smoke.mjs        # 36/36 routes (32 pages/endpoints + 4 real 404s)
```

## Razorpay

Test keys work out of the box (mock order fallback when keys are placeholders).
Live keys + webhook secret go in the backend env; enable UPI, cards, netbanking, EMI,
payment links (B2B advance) and Route (if multi-vendor). Full steps: `docs/RAZORPAY.md`.

## What still needs your inputs

Real product photos (overwrite the placeholder SVGs), VPS + domain, Razorpay live keys,
SMS gateway for OTP login, your GSTIN/phone/email (one place:
`NEXT_PUBLIC_STORE_GSTIN/PHONE/EMAIL`).

## Repository

https://github.com/BenitoJD/toolsvilla-clone — push helper: `scripts/push-to-github.ps1`.

# E-Commerce — Machinery & Tools Store

[![verify](https://github.com/BenitoJD/e-commerce/actions/workflows/verify.yml/badge.svg)](https://github.com/BenitoJD/e-commerce/actions/workflows/verify.yml)

Production-shaped ecommerce monorepo for the Indian tools/machinery market:
Next.js storefront + Express/Postgres backend + Razorpay payments, customer accounts,
OTP guest order access, transactional email and a browser E2E suite — deployable on a
single VPS.

Feature parity matrix: [`docs/PARITY.md`](docs/PARITY.md).

## Structure

```
e-commerce/
  apps/backend/       Express + Postgres + Razorpay
    data/             36-product catalog (30 tools + 6 teak furniture pieces) + seeded coupons (source of truth)
    sql/schema.sql    idempotent schema (safe to run on every boot)
    src/routes/       products, search, checkout, webhooks, quotes, engage,
                      service, invoice, admin, sitemap, auth
    src/lib/          pricing, stock reservation, order state machine, refunds,
                      auth/sessions/OTP, email outbox, rate limiting, security, text
    src/lib/__tests__ unit + route-level integration suites (in-memory DB)
  apps/storefront/    Next.js 14 App Router (35 routes)
    app/              homepage, category, product, cart, checkout, orders,
                      tracking, invoice, returns, admin, account/login/register,
                      FAQ, policies…
    components/       client views (ProductView, CategoryView, BrandView, HomeView…)
    public/images/    30 curated tool photos + 10 Gracewood furniture photos (+ fallbacks)
    lib/              api client, cart, wishlist, store config, server API base
    test/             114 client-logic tests (no install needed)
  e2e/                52 Playwright browser tests (every customer + admin flow)
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
cp .env.example .env      # DATABASE_URL + Razorpay test keys + ADMIN_TOKEN + AUTH_SECRET
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
cp .env.example .env      # Razorpay keys, ADMIN_TOKEN, AUTH_SECRET, SMTP (optional), domain
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

## Accounts & notifications

- **Accounts**: register / sign in / sign out, profile, **saved addresses** (default one
  prefills checkout), full order history, password reset by emailed link (development
  prints the link). Passwords are scrypt-hashed; session tokens are random 32-byte values
  stored only as SHA-256 hashes; a reset revokes every session. Guest checkout remains the
  default — an account is never required.
- **Guest order access**: “My Orders”, quote status and the order list now require a
  **6-digit OTP** bound to the phone (5-minute expiry, 5 attempts, one request/minute).
  Knowing a phone number alone no longer reveals receipts or lets someone cancel orders.
  Without an SMS provider, development returns the code in the response; production says
  SMS is not configured and points at accounts.
- **Transactional email**: order confirmation, paid, shipped, delivered, cancelled,
  refunded, return updates, password reset and back-in-stock alerts are written to a
  Postgres **outbox** in the same transaction as the state change and delivered by a
  retrying worker (idempotent per receipt+event). SMTP is optional: without it messages are
  marked `logged` and can be inspected/reset from **Admin → Emails**. Configure
  `SMTP_HOST/SMTP_FROM/...` to deliver.
- **Courier tracking**: the warehouse records courier/AWB/tracking URL in the admin order
  panel; Track Order shows it to the customer.

## Storefront features

Shopping: homepage strips (deals, brands, recently viewed) · category listing with
brand/price/sort/text filters and load-more · product pages with specs, EMI 3/6/9/12,
video embeds, pincode ETA, reviews + Q&A, related items, WhatsApp share · search with typeahead ·
wishlist (move one / move all, skips out-of-stock) · cart with live stock checks,
clear-all and coupons · Razorpay checkout (UPI/cards/netbanking/EMI) · COD capped at
`COD_MAX_PAISE` (default ₹20,000) and enforced server-side · optional buyer GSTIN for
business invoices · server-authoritative totals.

After the sale: order success with live status polling · track order with courier/AWB +
customer cancel · account order history or OTP-verified guest lookup, both with **reorder**
and per-order WhatsApp help · printable GST invoice (buyer GSTIN, item lines, shipping,
coupon, payment mode — totals reconcile) · returns/exchange form with **status lookup** ·
back-in-stock alerts that email the waiting list when stock returns.

Trust: 10 policy pages, a searchable **FAQ** with FAQPage structured data, GST invoice
messaging, pan-India delivery, newsletter (admin can list subscribers and export CSV).

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
(verify, answer, delete) · Stock (update by slug) · **Customers** (accounts, orders,
lifetime value) · **Emails** (transactional outbox, requeue and send-now).

## Tests

Everything that runs without Docker/Postgres, in one command:

```bash
node scripts/verify-all.mjs   # 6/6: both suites, compose, build, repo audits
node scripts/verify-fresh.mjs # checks a fresh checkout of the pushed repo (5 checks)

# Browser end-to-end suite (43 tests). Requires the API + storefront + Postgres running:
pnpm test:e2e                # every customer flow + admin console in Chromium

# After a build: the live end-to-end audit. Boots a fixture backend serving the REAL
# catalogue, starts the built storefront against it, then runs three suites and cleans up:
#   44/44 routes · 17/17 pages · 108/108 sitemap URLs (JSON-LD, canonicals, H1, noindex, ₹NaN)
node scripts/self-audit.mjs   # 3/3 suites

# CI (.github/workflows/verify.yml) runs exactly these on every push to main and every PR:
# pnpm install --frozen-lockfile → verify-all → self-audit. A test asserts the workflow keeps
# running both, so a green badge can't hide skipped checks.

# Needs a running stack (API + storefront + Postgres). Drives the real customer and operator
# journeys — COD order with coupon, stock reserve/release, invoice maths, tracking, admin
# state machine, returns window, cancellation, signed webhook, quotes, reviews, 404s, SEO:
API_URL=http://127.0.0.1:9000 BASE_URL=http://localhost:3000 \
ADMIN_TOKEN=<admin token> RAZORPAY_WEBHOOK_SECRET=<test secret> node scripts/e2e-local.cjs
```

Individually:
cd apps/backend && npm test        # 323 tests: pricing/GST/EMI, catalog, coupons,
                                   # webhooks (idempotent), transitions, refunds (partial
                                   # too), auth/scrypt/session/OTP tokens, email templates,
                                   # rate limiting, security, sitemap, API contract, health,
                                   # route-level integration on an in-memory DB
cd apps/storefront && npm test     # 114 tests: catalog filters, cart self-healing +
                                   # reorder + stock status, wishlist, store config,
                                   # API base resolution, paise→rupee, errors, video allowlist
cd apps/storefront && npm run build # must compile all 35 routes
cd apps/storefront && npm start     # production server (same thing the image runs)
```

The image runs a normal production build + `next start` (no Next `standalone` output):
in a pnpm monorepo the traced standalone tree mirrors the repo layout and depends on
symlinks, which is a silent deploy trap. Verified by booting `next start` and fetching
every route (home, product, returns, admin, robots.txt, sitemap rewrite).

Seed is **repeatable**: `npm run seed` refreshes names/prices/images/specs/videos and
coupon terms, but never overwrites live `stock` or coupon `used_count`/`active`.

All 36 listings now carry real photography: 30 curated catalogue shots in
`apps/storefront/public/images/products/` and ten Gracewood furniture photos supplied by
the client. They are demo assets gathered through public image search — see
[`docs/IMAGE-CREDITS.md`](docs/IMAGE-CREDITS.md) for sources and the requirement to swap in
owned/licensed photography before launch. A test fails if any catalog image path has no file
behind it.

Fresh-checkout check before trusting a deploy: check out into an empty directory and run
the suites there — that is how the missing-catalog-files bug was caught.

Route smoke test and SEO audit (need the site running):

```bash
BASE_URL=http://localhost:3000 PRODUCT_SLUG=bosch-gsb-13-re-drill BRAND=Bosch \
  node scripts/smoke.mjs        # 44/44 checks (39 pages/endpoints + 5 real 404s; 43 by default, +1 with INVOICE_RECEIPT)
node scripts/audit-pages.mjs http://localhost:3000 bosch-gsb-13-re-drill power-tools Bosch
node scripts/crawl-sitemap.mjs http://localhost:3000   # every advertised URL
```

## Stale tabs after a rebuild

Next.js hashes JS chunks per build, so a browser tab left open across a deploy can request
chunks that no longer exist — the classic *"Application error: a client-side exception"*.
The storefront now detects `ChunkLoadError` in both error boundaries, reloads once (with a
30-second loop guard), and falls back to a **“A new version is available — Reload page”**
screen. The E2E setup also checks that every JS/CSS asset referenced by the main routes
actually exists, so a stale `next start` fails fast with a rebuild/restart instruction
instead of silently serving a broken app.

Always restart `next start` after rebuilding; for local work use:

```bash
cd apps/storefront && rm -rf .next && npx next build && npx next start -p 3000
```

## Razorpay

Development needs no keys: without them checkout issues a mock order id so the UI can be
exercised. **Production is different** — a missing key makes online checkout return 503
instead of faking a payment, and payment webhooks are rejected outright unless
`RAZORPAY_WEBHOOK_SECRET` is set (otherwise anyone could post a fake `payment.captured`).
Both are reported in the boot log. Live keys + webhook secret go in the backend env; enable
UPI, cards, netbanking, EMI, payment links (B2B advance) and Route (if multi-vendor).
Full steps: `docs/RAZORPAY.md`.

## What still needs your inputs

Real product photography (overwrite the placeholder SVGs), VPS + domain, Razorpay live
keys + webhook secret, an **SMTP provider** for order emails, a **Twilio** account (or equivalent) for guest
OTP SMS (accounts work without one), and your GSTIN/phone/email/address (one place:
`NEXT_PUBLIC_STORE_GSTIN/PHONE/EMAIL/ADDRESS`, plus `AUTH_SECRET`).

## Repository

https://github.com/BenitoJD/e-commerce — push helper: `scripts/push-to-github.ps1`.

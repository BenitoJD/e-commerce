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
    src/lib/          pricing, stock reservation, order state machine, refunds, text helpers
    src/lib/__tests__ 62 tests (unit + route-level integration with in-memory DB)
  apps/storefront/    Next.js 14 App Router (24 routes)
    app/              homepage, category, product, cart, checkout, orders,
                      tracking, invoice, returns, admin, policies…
    lib/              api client, cart, wishlist, store config
    test/             23 client-logic tests (no install needed)
  packages/shared/    INR / GST / EMI helpers
  infra/nginx.conf    reverse proxy (storefront + backend + webhooks)
  docker-compose.yml  postgres + redis + backend + storefront
  docs/               SETUP, RAZORPAY, VPS-DEPLOY, PARITY
```

## Quick start (local, no Docker)

```bash
# 1. Backend (needs Postgres; DATABASE_URL in .env)
cd apps/backend
npm install
cp .env.example .env      # DATABASE_URL + Razorpay test keys + ADMIN_TOKEN
npm run seed              # 30 products + WELCOME10/TOOLS15 coupons (idempotent)
npm run dev               # http://localhost:9000/health

# 2. Storefront
cd ../storefront
npm install
cp .env.example .env.local
npm run dev               # http://localhost:3000
```

Admin console: open `/admin`, paste your `ADMIN_TOKEN`.

## Quick start (VPS, one command)

```bash
cp .env.example .env      # Razorpay live keys, ADMIN_TOKEN
#   single domain:  NEXT_PUBLIC_BACKEND_URL=https://yourdomain.com/api
#   two domains:    NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com
docker compose up -d --build
docker compose exec backend npm run seed
# store: http://YOUR_IP  (nginx :80)   api: http://YOUR_IP/api/health
```

Compose runs postgres + redis + backend + storefront + nginx (single domain: store at `/`,
API at `/api/*`). Drop the `nginx:` block for a two-subdomain Cloudflare Tunnel setup.
Point your domain at the VPS, then set the Razorpay webhook to
`https://yourdomain.com/api/webhooks/razorpay`. Details: `docs/VPS-DEPLOY.md`.
`NEXT_PUBLIC_*` values are baked in at **build** time — changing them requires a rebuild.

## Storefront features

Shopping: homepage strips (deals, brands, recently viewed) · category listing with
brand/sort/load-more · product pages with specs, EMI 3/6/9/12, video embeds, pincode ETA,
reviews + Q&A, related items · search · wishlist · cart with coupons · Razorpay checkout
(UPI/cards/netbanking/EMI) + COD with high-value notice · server-authoritative totals.
After the sale: order success with live status polling · track order + customer cancel ·
my orders by phone · printable GST invoice (balanced with coupon line) · returns/exchange
form · back-in-stock alerts.
Trust: 9 policy pages, GST invoice messaging, pan-India delivery, newsletter.

## Admin console (`/admin`, header `x-admin-token`)

Overview (revenue incl. delivered, orders by status, low stock, new quotes) ·
Orders (filter, search by receipt/name/phone, coupon + payment ID, guarded status
transitions) · Returns · Quotes (convert to order at an agreed price) · Coupons (CRUD) ·
Messages · Reviews/Questions (verify, answer, delete) · Stock (update by slug).

## Tests

```bash
cd apps/backend && npm test        # 64 tests: pricing/GST/EMI, catalog, webhooks,
                                   # transitions, refunds, API contract, health, integration
cd apps/storefront && npm test     # 23 tests: cart self-healing, wishlist, store config,
                                   # paise→rupee, error messages, video allowlist
cd apps/storefront && npm run build # must compile all 24 routes
```

Fresh-clone check before trusting a deploy: clone into an empty directory and run the
suites there — that is how the missing-catalog-files bug was caught.

## Razorpay

Test keys work out of the box (mock order fallback when keys are placeholders).
Live keys + webhook secret go in the backend env; enable UPI, cards, netbanking, EMI,
payment links (B2B advance) and Route (if multi-vendor). Full steps: `docs/RAZORPAY.md`.

## What still needs your inputs

Real product photos (drop into `apps/backend/public/images/`, update `data/products.js`),
VPS + domain, Razorpay live keys, SMS gateway for OTP login, your GSTIN/phone/email
(one place: `NEXT_PUBLIC_STORE_GSTIN/PHONE/EMAIL`).

## Repository

https://github.com/BenitoJD/toolsvilla-clone — push helper: `scripts/push-to-github.ps1`.

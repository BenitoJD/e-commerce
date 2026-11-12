# ToolsKart — Toolsvilla-like Store (VPS + Razorpay Monorepo)

India-style machinery & tools ecommerce. Monorepo with Next.js storefront + Node backend + Razorpay + Docker for single VPS.

## Structure

```
toolsvilla-clone/
  apps/backend/     Express + Postgres + Razorpay (products, checkout, webhooks, bulk quotes)
  apps/storefront/  Next.js 14 App Router (SEO, cart, Razorpay checkout.js, EMI, bulk quote)
  packages/shared/  INR/GST/EMI helpers
  infra/nginx.conf  VPS reverse-proxy (storefront + backend + webhooks)
  docker-compose.yml  postgres + redis + meilisearch + backend + storefront
  docs/             SETUP, RAZORPAY, VPS-DEPLOY guides
```

## Quick start (local without Docker)

1. Backend:
```bash
cd apps/backend
npm install
copy .env.example .env   # fill DATABASE_URL + Razorpay test keys
npm run seed             # needs Postgres running
npm run dev              # http://localhost:9000/health
```
2. Storefront:
```bash
cd apps/storefront
npm install
copy .env.example .env.local
npm run dev              # http://localhost:3000
```

## Quick start (VPS single-command)

```bash
cp .env.example .env   # fill Razorpay live keys
docker compose up -d --build
docker compose exec backend npm run seed
# open http://YOUR_VPS_IP:3000 (store) — backend http://YOUR_VPS_IP:9000/health
```

Put Cloudflare in front, point `yourdomain.com` → VPS, webhook URL:
`https://yourdomain.com/api/webhooks/razorpay`

## Razorpay

- Test keys `rzp_test_*` work out of box (mock fallback if empty).
- Dashboard → Webhooks → Add `https://yourdomain.com/api/webhooks/razorpay` + secret → paste into backend `.env` as `RAZORPAY_WEBHOOK_SECRET`.
- Enable UPI, Cards, Netbanking, EMI (3/6/9/12), Payment Links (B2B advance), Route (if multi-vendor).
- Full steps: `docs/RAZORPAY.md`.

## VPS (Mumbai/Bangalore, 4vCPU/8GB, Ubuntu 24.04)

- Option A Docker Compose: `docker compose up -d` (this repo).
- Option B Coolify: create 2 services from `apps/backend/Dockerfile` + `apps/storefront/Dockerfile`, add postgres/redis plugins, set envs, attach domain + SSL.
- Full steps: `docs/VPS-DEPLOY.md`.

## B2B specifics

- Bulk quote form → `POST /store/quotes` → admin list.
- Partial advance: create Payment Links manually from Razorpay dashboard for 20% advance.
- COD for <₹20k hand tools; prepaid only for >50kg machinery.
- GST invoice: print Razorpay payment ID + HSN on invoice.

## Admin console

- Open `/admin` on the storefront, log in with `ADMIN_TOKEN` (backend env, also in `.env.example`).
- Overview: revenue (paid orders), orders by status, low stock (<5), new quotes.
- Orders: filter by status, mark shipped/delivered/cancelled/refunded.
- Bulk quotes: mark contacted/quoted/won/lost. Stock: update by product slug.
- API uses `x-admin-token` header; returns 503 if `ADMIN_TOKEN` is unset.

## New endpoints this round

- `GET /store/search?q=&brand=&category=&maxPrice=&sort=&limit=` (SQL search, no extra services needed)
- `GET /store/checkout/verify?receipt=` (order-success page polls this for live Paid/COD/Pending/Failed status)
- Seed expanded to 30 products incl. `agriculture` category.

## GitHub

Owner: https://github.com/BenitoJD — repo name suggested `toolsvilla-clone`.
Push:
```powershell
.\scripts\push-to-github.ps1 -RepoName toolsvilla-clone
```
Requires `git` + `gh` installed and `gh auth login`.

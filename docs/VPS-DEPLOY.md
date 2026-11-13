# VPS deploy (Mumbai/Bangalore, Ubuntu 24.04, 4vCPU/8GB)

## Option A — Docker Compose (simplest)

Two routing choices. **A1 single domain through the bundled nginx** (recommended to start):

```bash
apt update && apt install -y docker.io docker-compose-plugin
git clone https://github.com/BenitoJD/e-commerce.git
cd e-commerce
nano .env
#   NEXT_PUBLIC_BACKEND_URL=/api          <-- single domain behind nginx (compose default)
#   BACKEND_INTERNAL_URL=http://backend:9000  <-- used by SSR + /sitemap.xml rewrite
#   FRONTEND_URL=https://yourdomain.com
#   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET
#   ADMIN_TOKEN=<long random string>
#   AUTH_SECRET=<32+ random bytes>          # required by compose
#   SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM  # order emails (optional)
docker compose up -d --build
docker compose exec backend npm run seed
ufw allow 22,80,443/tcp && ufw enable

# verify before announcing the site
node scripts/validate-compose.cjs      # duplicate/misplaced compose keys
BASE_URL=https://yourdomain.com PRODUCT_SLUG=<a real slug> BRAND=<a real brand> \
  node scripts/smoke.mjs

## Container image notes
- `next.config.js` must stay self-contained: `next start` loads it at boot, and the runner
  stage only ships `.next`, `public`, `package.json`, `next.config.js`, `node_modules`.
  Tests fail if it requires app code or if the Dockerfile stops declaring the build args
  (`BACKEND_INTERNAL_URL` is needed at build time for the `/sitemap.xml` rewrite).
- **Redeploys drain gracefully.** The backend handles `SIGTERM`/`SIGINT`: it stops the
  stale-hold sweep timer, stops accepting connections, lets in-flight checkouts and Razorpay
  webhooks finish, then drains the Postgres pool and exits 0. A hung request can't block a
  deploy forever — `SHUTDOWN_TIMEOUT_MS` (default 10000) forces exit after the deadline, and
  Compose/`docker stop` allow 10s by default, so keep the two in step if you raise it.
  Check the logs after a redeploy: `[shutdown] SIGTERM received — draining` then
  `[shutdown] clean exit`.
- After `docker compose up`, check `docker compose exec storefront \
  node -e "console.log(require('./.next/routes-manifest.json').rewrites)"` — the sitemap
  destination should be `http://backend:9000/sitemap.xml`, not `localhost`.
```
Compose includes an `nginx` service (port 80) that serves the storefront at `/` and the
API at `/api/*` (see `infra/nginx.conf`). Razorpay webhook →
`https://yourdomain.com/api/webhooks/razorpay`. Add TLS with Cloudflare (proxied) or certbot.

The proxy is tuned in three places worth knowing when you change it:
- **gzip** for text/JSON/SVG (skip binary images), so HTML and API payloads travel compressed;
- **cache headers**: `/_next/static/` immutable for a year, `/images/` for a week,
  `robots.txt`/`sitemap.xml` for ten minutes;
- the webhook block disables buffering and goes straight to `/webhooks/razorpay`, so Razorpay's
  signature check sees the raw body without a proxy in the way.
`apps/backend` tests assert these blocks structurally (no nginx binary is needed), including
that every specific location is declared **before** the catch-all.

**A2 two subdomains, no nginx service** — delete/comment the `nginx:` block in
`docker-compose.yml`, then use `NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com` with
Cloudflare Tunnel or a host-level proxy in front of ports 3000/9000.

Important: `NEXT_PUBLIC_*` values are baked into the storefront JS bundle at **build** time
(compose passes them as build args). If you change the API URL later, rebuild:
`docker compose up -d --build storefront`. A wrong value here is the #1 cause of a
"works locally, broken on VPS" storefront.

The storefront image runs a full production build + `next start` (not Next's `standalone`
output). That keeps the image honest with what `npm run build && npm start` does locally;
the trade-off is a larger image (~hundreds of MB extra node_modules) for zero layout risk.

## Option B — Coolify (Vercel-like on VPS)
1. Install: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash` → open http://VPS_IP:8000
2. Add Project → Postgres plugin (note the connection URL).
3. Service 1 Backend: repo `BenitoJD/e-commerce`, base dir `apps/backend`, Dockerfile, port 9000, envs DATABASE_URL/RAZORPAY_*/FRONTEND_URL/ADMIN_TOKEN.
4. Service 2 Storefront: base dir `apps/storefront`, port 3000, envs NEXT_PUBLIC_*,
   PLUS the same three values as Docker build args (Coolify → Service → Build → Build Arguments):
   `NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com` etc. Without them the bundle bakes in localhost.
5. Domains: `shop.yourdomain.com` → storefront, `api.yourdomain.com` → backend. Enable SSL.
6. Razorpay webhook: `https://api.yourdomain.com/webhooks/razorpay`.
7. No manual seed needed: on first boot the backend creates the schema and, **only when the
   products table is empty**, loads the 30-product catalogue and coupons (`SEED_ON_BOOT=false`
   disables it). The log line is `[seed] empty catalogue — seeded …`, or
   `[seed] catalogue already has N products — not seeding` on later boots, so your edits are
   never overwritten. `npm run seed` still exists as a manual refresh (it updates catalogue
   content while preserving stock and coupon usage).

## Backups
- Enable VPS snapshots as the outer layer. Keep the Meili key + webhook secret in Coolify
  secrets, never in git.
- **Database dumps**: `./scripts/db-backup.sh` writes a timestamped, gzip-verified dump to
  `backups/` and prunes older ones (`KEEP`, default 14). It uses `docker compose exec` against
  the postgres service when available, otherwise `pg_dump` with `DATABASE_URL`.
  A failed dump exits non-zero and deletes its partial file — an empty backup that looks fine
  is worse than none.
- Nightly cron on the VPS:
  `15 1 * * * cd /srv/e-commerce && ./scripts/db-backup.sh >> /var/log/e-commerce-backup.log 2>&1`
- **Restore**: `RESTORE_CONFIRM=yes ./scripts/db-restore.sh backups/e-commerce-<stamp>.sql.gz`
  (it refuses without the variable because it replaces live data, and stops on the first SQL
  error). Restart the backend afterwards so pooled connections see the restored data.
- `backups/` and `*.sql.gz` are gitignored — dumps contain customer PII.

## Monitoring
- **First thing to read after `docker compose up`**: the backend log. A production deploy with
  a missing setting prints one `[config]` / `[security]` / `[webhook]` line per degraded
  feature — admin disabled, online checkout refusing orders, CORS blocked, or webhooks
  rejected. A fully configured deploy prints none of them.
- Liveness: `GET /health` — process is up (always 200 while Node runs).
- Readiness: `GET /ready` — 200 when Postgres answers, **503 when it does not**.
  Point uptime monitors / Docker healthchecks at `/ready`, not `/health`.
- Both containers ship a Docker `HEALTHCHECK` (backend hits `/ready`, storefront hits `/`)
  and run as the unprivileged `node` user.
- Verified behaviour with the database unreachable: process stays up, API returns clean
  JSON 500s, `/sitemap.xml` still serves valid XML.
- **Connection pool is bounded**: `DB_POOL_MAX` (default 10) caps clients per container,
  `DB_CONNECT_TIMEOUT_MS` (5000) fails fast instead of queueing forever, and
  `DB_STATEMENT_TIMEOUT_MS` (15000) aborts a runaway query so it can't pin a connection.
  Raise the pool only with Postgres `max_connections` in mind (compose Postgres is shared by
  the API alone here, so 10 is generous).
- `robots.txt` is generated from `NEXT_PUBLIC_SITE_URL` at build time, so set that before
  building — otherwise the sitemap link points at localhost.

## Housekeeping the backend does on its own
- **Schema + first-boot seed**: `sql/schema.sql` is applied on the first query, and an empty
  catalogue is seeded once (see step 7 of the Coolify section). A fresh volume therefore
  serves a working store without manual steps, while a populated one is never re-seeded.
- **Abandoned checkouts** reserve stock at checkout. If the shopper closes the payment sheet,
  no webhook arrives, so the backend sweeps every `STALE_SWEEP_MINUTES` (default **15**;
  set `0` to disable) and cancels pending orders older than the sweep window, returning their
  stock and releasing any coupon use. It logs only when it actually releases something.
- You can also run it on demand from the admin Orders tab (**Release abandoned holds**) or
  `POST /admin/orders/release-stale?minutes=30` with the admin token — handy straight after a
  sale where carts were abandoned.

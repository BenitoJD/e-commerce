# VPS deploy (Mumbai/Bangalore, Ubuntu 24.04, 4vCPU/8GB)

## Option A — Docker Compose (simplest)

Two routing choices. **A1 single domain through the bundled nginx** (recommended to start):

```bash
apt update && apt install -y docker.io docker-compose-plugin
git clone https://github.com/BenitoJD/toolsvilla-clone.git
cd toolsvilla-clone
nano .env
#   NEXT_PUBLIC_BACKEND_URL=/api          <-- single domain behind nginx (compose default)
#   BACKEND_INTERNAL_URL=http://backend:9000  <-- used by SSR + /sitemap.xml rewrite
#   FRONTEND_URL=https://yourdomain.com
#   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET
#   ADMIN_TOKEN=<long random string>
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
- After `docker compose up`, check `docker compose exec storefront \
  node -e "console.log(require('./.next/routes-manifest.json').rewrites)"` — the sitemap
  destination should be `http://backend:9000/sitemap.xml`, not `localhost`.
```
Compose includes an `nginx` service (port 80) that serves the storefront at `/` and the
API at `/api/*` (see `infra/nginx.conf`). Razorpay webhook →
`https://yourdomain.com/api/webhooks/razorpay`. Add TLS with Cloudflare (proxied) or certbot.

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
3. Service 1 Backend: repo `BenitoJD/toolsvilla-clone`, base dir `apps/backend`, Dockerfile, port 9000, envs DATABASE_URL/RAZORPAY_*/FRONTEND_URL/ADMIN_TOKEN.
4. Service 2 Storefront: base dir `apps/storefront`, port 3000, envs NEXT_PUBLIC_*,
   PLUS the same three values as Docker build args (Coolify → Service → Build → Build Arguments):
   `NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com` etc. Without them the bundle bakes in localhost.
5. Domains: `shop.yourdomain.com` → storefront, `api.yourdomain.com` → backend. Enable SSL.
6. Razorpay webhook: `https://api.yourdomain.com/webhooks/razorpay`.
7. Run seed once: backend terminal → `npm run seed`.

## Backups
- Enable VPS snapshots + nightly `pg_dump` to S3/R2. Keep Meili key + webhook secret in Coolify secrets, never in git.

## Monitoring
- Liveness: `GET /health` — process is up (always 200 while Node runs).
- `robots.txt` is generated from `NEXT_PUBLIC_SITE_URL` at build time, so set that before
  building — otherwise the sitemap link points at localhost.- Readiness: `GET /ready` — 200 when Postgres answers, **503 when it does not**.
  Point uptime monitors / Docker healthchecks at `/ready`, not `/health`.
- Both containers ship a Docker `HEALTHCHECK` (backend hits `/ready`, storefront hits `/`)
  and run as the unprivileged `node` user.
- Verified behaviour with the database unreachable: process stays up, API returns clean
  JSON 500s, `/sitemap.xml` still serves valid XML.

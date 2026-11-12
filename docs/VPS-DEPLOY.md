# VPS deploy (Mumbai/Bangalore, Ubuntu 24.04, 4vCPU/8GB)

## Option A — Docker Compose (simplest)
```bash
apt update && apt install -y docker.io docker-compose-plugin
git clone https://github.com/BenitoJD/toolsvilla-clone.git
cd toolsvilla-clone
nano .env   # fill RAZORPAY live keys AND NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com
docker compose up -d --build
docker compose exec backend npm run seed
ufw allow 22,80,443/tcp && ufw enable
```
Important: `NEXT_PUBLIC_*` values are baked into the storefront JS bundle at **build** time
(compose passes them as build args). If you change the API domain later, rebuild:
`docker compose up -d --build storefront`.
Nginx: use `infra/nginx.conf` or Cloudflare Tunnel. Webhook must be public HTTPS.

## Option B — Coolify (Vercel-like on VPS)
1. Install: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash` → open http://VPS_IP:8000
2. Add Project → Postgres + Redis plugins (note URLs).
3. Service 1 Backend: repo `BenitoJD/toolsvilla-clone`, base dir `apps/backend`, Dockerfile, port 9000, envs DATABASE_URL/REDIS_URL/RAZORPAY_*/FRONTEND_URL.
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
- Readiness: `GET /ready` — 200 when Postgres answers, **503 when it does not**.
  Point uptime monitors / Docker healthchecks at `/ready`, not `/health`.
- Verified behaviour with the database unreachable: process stays up, API returns clean
  JSON 500s, `/sitemap.xml` still serves valid XML.

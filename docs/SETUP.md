# Local setup (Windows + VPS same steps)

## Prereq
- Node 20+, pnpm 9 (or npm), Docker Desktop (for compose), Postgres 16 if running without Docker.

## 1. Get the code
```bash
git clone https://github.com/BenitoJD/toolsvilla-clone.git
cd e-commerce
cp .env.example .env
```

## 2. Docker (recommended)
```bash
docker compose up -d --build
docker compose logs -f backend storefront
docker compose exec backend npm run seed
```
- Store: http://localhost:3000
- API health: http://localhost:9000/health
- Products: http://localhost:9000/store/products

## 3. Without Docker
Backend needs `DATABASE_URL` reachable. Easiest: keep postgres in Docker only:
```bash
docker compose up -d postgres
cd apps/backend && npm install && npm run seed && npm run dev
cd ../storefront && npm install && npm run dev
```

## 4. Env
- Backend `apps/backend/.env`: DATABASE_URL, RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET
- Frontend `apps/storefront/.env.local`: NEXT_PUBLIC_BACKEND_URL, NEXT_PUBLIC_RAZORPAY_KEY_ID

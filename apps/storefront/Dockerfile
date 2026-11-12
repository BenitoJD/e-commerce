# Production image without Next's `standalone` output.
# Rationale: in a pnpm monorepo the traced standalone tree mirrors the repo layout
# (standalone/apps/storefront/server.js) and depends on symlinks that vary by
# filesystem — a silent "works on my machine" trap. Running `next start` against a
# regular build is the same server Next would run, just with node_modules present.
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* are baked into the client bundle at build time: they must be build
# args (compose passes them via build.args), not just runtime env.
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:9000
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxx
ARG NEXT_PUBLIC_STORE_NAME=ToolsKart
ARG NEXT_PUBLIC_STORE_PHONE=919999999999
ARG NEXT_PUBLIC_STORE_EMAIL=care@toolskart.in
ARG NEXT_PUBLIC_STORE_GSTIN=00AAAAA0000A1Z5
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
# Needed at BUILD time: next.config.js computes the /sitemap.xml rewrite destination.
ARG BACKEND_INTERNAL_URL=http://backend:9000
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_RAZORPAY_KEY_ID=$NEXT_PUBLIC_RAZORPAY_KEY_ID
ENV NEXT_PUBLIC_STORE_NAME=$NEXT_PUBLIC_STORE_NAME
ENV NEXT_PUBLIC_STORE_PHONE=$NEXT_PUBLIC_STORE_PHONE
ENV NEXT_PUBLIC_STORE_EMAIL=$NEXT_PUBLIC_STORE_EMAIL
ENV NEXT_PUBLIC_STORE_GSTIN=$NEXT_PUBLIC_STORE_GSTIN
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/next.config.js ./next.config.js

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "node_modules/next/dist/bin/next", "start"]

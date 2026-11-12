FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* are baked into the client bundle at build time, so they must be
# build args (compose passes them via build.args) — not just runtime env.
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:9000
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxx
ARG NEXT_PUBLIC_STORE_NAME=ToolsKart
ARG NEXT_PUBLIC_STORE_PHONE=919999999999
ARG NEXT_PUBLIC_STORE_EMAIL=care@toolskart.in
ARG NEXT_PUBLIC_STORE_GSTIN=00AAAAA0000A1Z5
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_RAZORPAY_KEY_ID=$NEXT_PUBLIC_RAZORPAY_KEY_ID
ENV NEXT_PUBLIC_STORE_NAME=$NEXT_PUBLIC_STORE_NAME
ENV NEXT_PUBLIC_STORE_PHONE=$NEXT_PUBLIC_STORE_PHONE
ENV NEXT_PUBLIC_STORE_EMAIL=$NEXT_PUBLIC_STORE_EMAIL
ENV NEXT_PUBLIC_STORE_GSTIN=$NEXT_PUBLIC_STORE_GSTIN
ENV NEXT_TELEMETRY_DISABLED=1
# Build fails loudly if a page doesn't compile — keep it that way.
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --chown=node:node --from=builder /app/.next/standalone ./
COPY --chown=node:node --from=builder /app/.next/static ./.next/static
# public/ must exist in the repo (robots.txt lives there); a missing dir fails COPY.
COPY --chown=node:node --from=builder /app/public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]

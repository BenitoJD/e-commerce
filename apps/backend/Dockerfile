FROM node:20-alpine

WORKDIR /app

# deps first for layer caching
COPY package.json ./
RUN npm install --omit=dev \
 && npm cache clean --force

COPY --chown=node:node . .

ENV NODE_ENV=production
ENV PORT=9000
EXPOSE 9000

# Run unprivileged (node image ships a `node` user).
USER node

# Readiness (not just liveness): fails when Postgres is unreachable,
# so orchestrators/monitors see a real outage.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:9000/ready >/dev/null 2>&1 || exit 1

CMD ["node", "src/index.js"]

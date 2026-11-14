#!/usr/bin/env bash
# Nightly Postgres backup for the compose deployment.
#
#   ./scripts/db-backup.sh                 # writes backups/e-commerce-<UTC>.sql.gz
#   BACKUP_DIR=/var/backups ./scripts/db-backup.sh
#   KEEP=30 ./scripts/db-backup.sh         # retention (files to keep, default 14)
#
# Works whether or not you have psql installed locally: it prefers `docker compose exec`
# against the running postgres container and falls back to pg_dump with DATABASE_URL.
# Set -euo pipefail so a failed dump never looks like success (an empty/corrupt backup that
# silently "works" is worse than no backup).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
KEEP="${KEEP:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SERVICE="${PG_SERVICE:-postgres}"
DB_USER="${POSTGRES_USER:-tools}"
DB_NAME="${POSTGRES_DB:-ecommerce}"
OUT="$BACKUP_DIR/e-commerce-$STAMP.sql.gz"

# Detect the tooling BEFORE creating anything, so a failed run leaves no empty directory.
if command -v docker >/dev/null 2>&1 && docker compose ps "$SERVICE" >/dev/null 2>&1; then
  MODE=compose
elif command -v pg_dump >/dev/null 2>&1; then
  : "${DATABASE_URL:?set DATABASE_URL or run this on the compose host}"
  MODE=pg_dump
else
  echo "[backup] no docker compose postgres and no pg_dump on PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
echo "[backup] dumping $DB_NAME -> $OUT"

if [ "$MODE" = "compose" ]; then
  docker compose exec -T "$SERVICE" pg_dump -U "$DB_USER" --no-owner --clean --if-exists "$DB_NAME" \
    | gzip -9 > "$OUT"
else
  pg_dump "$DATABASE_URL" --no-owner --clean --if-exists | gzip -9 > "$OUT"
fi

# A dump that is empty (or not gzip) must fail loudly.
if ! gzip -t "$OUT" 2>/dev/null; then
  echo "[backup] $OUT is not valid gzip, removing" >&2
  rm -f "$OUT"
  exit 1
fi
if [ "$(gzip -dc "$OUT" | wc -c)" -lt 1000 ]; then
  echo "[backup] $OUT looks empty, keeping it but check the dump privileges" >&2
  exit 2
fi

echo "[backup] ok: $(du -h "$OUT" | cut -f1) $OUT"

# Retention: newest KEEP files survive, older ones are removed.
# shellcheck disable=SC2012
ls -1t "$BACKUP_DIR"/e-commerce-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  echo "[backup] pruning $old"
  rm -f "$old"
done

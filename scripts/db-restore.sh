#!/usr/bin/env bash
# Restore a backup produced by scripts/db-backup.sh.
#
#   RESTORE_CONFIRM=yes ./scripts/db-restore.sh backups/e-commerce-20260520T010000Z.sql.gz
#
# Restores are destructive (the dump uses --clean --if-exists), so they require an explicit
# confirmation variable. Point DATABASE_URL at the target first when not using compose.
set -euo pipefail

FILE="${1:-}"
if [ -z "$FILE" ]; then
  echo "usage: RESTORE_CONFIRM=yes $0 <file.sql.gz>" >&2
  exit 1
fi
if [ ! -f "$FILE" ]; then
  echo "[restore] no such file: $FILE" >&2
  exit 1
fi
if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  echo "[restore] refusing without RESTORE_CONFIRM=yes (this REPLACES live data)" >&2
  exit 1
fi
gzip -t "$FILE" 2>/dev/null || { echo "[restore] not a gzip file: $FILE" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
SERVICE="${PG_SERVICE:-postgres}"
DB_USER="${POSTGRES_USER:-tools}"
DB_NAME="${POSTGRES_DB:-ecommerce}"

echo "[restore] restoring $FILE into $DB_NAME"
if command -v docker >/dev/null 2>&1 && docker compose ps "$SERVICE" >/dev/null 2>&1; then
  gzip -dc "$FILE" | docker compose exec -T "$SERVICE" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME"
elif command -v psql >/dev/null 2>&1; then
  : "${DATABASE_URL:?set DATABASE_URL or run this on the compose host}"
  gzip -dc "$FILE" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
else
  echo "[restore] no docker compose postgres and no psql on PATH" >&2
  exit 1
fi

echo "[restore] done. Restart the backend so pooled connections see the restored data."

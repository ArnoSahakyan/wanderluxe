#!/usr/bin/env bash
# Rebuilds the LOCAL end-to-end database before the Playwright run:
#
#   create <db>_e2e if missing → reset its schema → import the PII-free
#   baseline (or E2E_DB_IMPORT_FILE) → run migrations → create the local admin/customer.
#
# It only ever talks to the docker compose PostgreSQL (`npm run db:up`), and
# refuses any database whose name does not end in "_e2e". Called by the API
# entry of `webServer` in e2e/playwright.config.ts, so it runs on every
# `npm run test:e2e` before the API starts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a; # shellcheck disable=SC1091
  source .env; set +a
fi

POSTGRES_DB="${POSTGRES_DB:-wanderluxe}"
POSTGRES_USER="${POSTGRES_USER:-wanderluxe_owner}"
APP_DB_USER="${APP_DB_USER:-wanderluxe_app}"
E2E_DB_NAME="${E2E_DB_NAME:-${POSTGRES_DB}_e2e}"

if [[ "$E2E_DB_NAME" != *_e2e ]]; then
  echo "✋ Refusing to prepare '$E2E_DB_NAME': the e2e database name must end in _e2e." >&2
  exit 1
fi
if [[ -n "${DATABASE_URL:-}" || -n "${DB_MIGRATION_URL:-}" ]]; then
  echo "✋ DATABASE_URL / DB_MIGRATION_URL is set; the e2e run only uses the local docker database." >&2
  exit 1
fi
if [[ "${DB_HOST:-localhost}" != "localhost" && "${DB_HOST:-}" != "127.0.0.1" ]]; then
  echo "✋ DB_HOST=${DB_HOST} is not local; refusing to run e2e setup." >&2
  exit 1
fi

if ! docker compose exec -T db pg_isready -q -U "$POSTGRES_USER" >/dev/null 2>&1; then
  echo "✋ The local PostgreSQL container is not running. Start it with: npm run db:up" >&2
  exit 1
fi

admin_psql() {
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -X -q -U "$POSTGRES_USER" -d postgres "$@"
}

echo "→ [e2e] preparing database '$E2E_DB_NAME'"
if [[ -z "$(admin_psql -At -c "SELECT 1 FROM pg_database WHERE datname = '$E2E_DB_NAME'")" ]]; then
  admin_psql <<SQL
CREATE DATABASE "$E2E_DB_NAME" OWNER "$POSTGRES_USER";
REVOKE ALL ON DATABASE "$E2E_DB_NAME" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE "$E2E_DB_NAME" TO "$APP_DB_USER";
SQL
  echo "  created database '$E2E_DB_NAME'"
fi

# Quiet on success (the DROP … CASCADE notices are noise); show everything on failure.
if ! out="$(database/scripts/db.sh reset --db "$E2E_DB_NAME" --yes 2>&1)"; then
  echo "$out" >&2; exit 1
fi
# The PII-free baseline by default, so results don't depend on whether you have
# the private dump. E2E_DB_IMPORT_FILE=database/dump/wanderluxe.sql uses the dump.
database/scripts/db.sh import --db "$E2E_DB_NAME" --file "${E2E_DB_IMPORT_FILE:-database/schema/baseline.sql}"

cd backend
DB_NAME="$E2E_DB_NAME" NODE_ENV=development npx sequelize-cli db:migrate >/dev/null
DB_NAME="$E2E_DB_NAME" NODE_ENV=development npx tsx scripts/create-dev-users.ts
DB_NAME="$E2E_DB_NAME" NODE_ENV=development npx tsx scripts/create-demo-users.ts >/dev/null
echo "✔ [e2e] database '$E2E_DB_NAME' is ready"

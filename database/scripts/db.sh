#!/usr/bin/env bash
# WanderLuxe local database helper.
#
#   database/scripts/db.sh import [--test] [--file <path>]
#       Import the SQL dump into an EMPTY database. Refuses if any table exists.
#       Default source: database/dump/wanderluxe.sql (private, not in git);
#       falls back to database/schema/baseline.sql (no personal data).
#   database/scripts/db.sh reset [--test] [--yes]
#       Drop and recreate the public schema of the LOCAL docker database.
#       Asks for confirmation unless --yes is given. Never touches remote hosts.
#   database/scripts/db.sh psql [--test]
#       Open an interactive psql shell as the owner role.
#
# Commands run inside the `db` docker compose service, so no local psql is
# needed. Set DB_EXEC=host to use a psql/pg_restore on your PATH instead
# (then PGHOST/PGPORT/PGUSER/PGPASSWORD are honoured).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a; # shellcheck disable=SC1091
  source .env; set +a
fi

POSTGRES_DB="${POSTGRES_DB:-wanderluxe}"
POSTGRES_USER="${POSTGRES_USER:-wanderluxe_owner}"
DB_EXEC="${DB_EXEC:-docker}"

cmd="${1:-}"; shift || true
target_db="$POSTGRES_DB"
file=""
assume_yes=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --test) target_db="${POSTGRES_DB}_test" ;;
    --file) file="$2"; shift ;;
    --yes|-y) assume_yes=true ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

run_psql() { # run_psql <db> [psql args...]  (stdin is forwarded)
  local db="$1"; shift
  if [[ "$DB_EXEC" == "docker" ]]; then
    docker compose exec -T db psql -v ON_ERROR_STOP=1 -X -q -U "$POSTGRES_USER" -d "$db" "$@"
  else
    psql -v ON_ERROR_STOP=1 -X -q -d "$db" "$@"
  fi
}

container_path() { # map a repo path to the path mounted in the container
  local abs; abs="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
  if [[ "$DB_EXEC" == "docker" ]]; then
    case "$abs" in
      "$ROOT"/database/*) echo "/database/${abs#"$ROOT"/database/}" ;;
      *) echo "File must live under database/ to be visible to the container: $1" >&2; exit 1 ;;
    esac
  else
    echo "$abs"
  fi
}

table_count() {
  run_psql "$1" -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
}

case "$cmd" in
  import)
    if [[ -z "$file" ]]; then
      if [[ -f database/dump/wanderluxe.sql ]]; then
        file="database/dump/wanderluxe.sql"
      else
        file="database/schema/baseline.sql"
        echo "ℹ  database/dump/wanderluxe.sql not found — importing the PII-free baseline instead."
      fi
    fi
    [[ -f "$file" ]] || { echo "Dump not found: $file" >&2; exit 1; }

    existing="$(table_count "$target_db")"
    if [[ "$existing" != "0" ]]; then
      echo "✋ Database '$target_db' already contains $existing table(s); refusing to import over existing data." >&2
      echo "   If you really want a clean local copy: database/scripts/db.sh reset$([[ $target_db == *_test ]] && echo ' --test')" >&2
      exit 1
    fi

    src="$(container_path "$file")"
    if head -c 5 "$file" | grep -q '^PGDMP'; then
      echo "→ Restoring custom-format dump $file into '$target_db' …"
      if [[ "$DB_EXEC" == "docker" ]]; then
        docker compose exec -T db pg_restore --no-owner --exit-on-error --single-transaction -U "$POSTGRES_USER" -d "$target_db" "$src"
      else
        pg_restore --no-owner --exit-on-error --single-transaction -d "$target_db" "$src"
      fi
    else
      echo "→ Importing plain SQL $file into '$target_db' (single transaction) …"
      run_psql "$target_db" -1 -f "$src"
    fi
    echo "✔ Import complete. Next: npm run db:migrate$([[ $target_db == *_test ]] && echo ':test')"
    ;;

  reset)
    if [[ "$DB_EXEC" != "docker" ]]; then
      echo "reset only works against the local docker compose database." >&2; exit 1
    fi
    if ! $assume_yes; then
      read -r -p "This DELETES all data in local database '$target_db'. Type the database name to confirm: " answer
      [[ "$answer" == "$target_db" ]] || { echo "Aborted."; exit 1; }
    fi
    run_psql "$target_db" <<SQL
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public AUTHORIZATION "$POSTGRES_USER";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO "${APP_DB_USER:-wanderluxe_app}";
-- default privileges are tied to the schema, so re-create them
ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_DB_USER:-wanderluxe_app}";
ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "${APP_DB_USER:-wanderluxe_app}";
ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public
  GRANT USAGE ON TYPES TO "${APP_DB_USER:-wanderluxe_app}";
SQL
    echo "✔ '$target_db' is now empty. Next: npm run db:import$([[ $target_db == *_test ]] && echo ':test')"
    ;;

  psql)
    if [[ "$DB_EXEC" == "docker" ]]; then
      exec docker compose exec db psql -U "$POSTGRES_USER" -d "$target_db"
    else
      exec psql -d "$target_db"
    fi
    ;;

  *)
    sed -n '2,20p' "$0"; exit 2 ;;
esac

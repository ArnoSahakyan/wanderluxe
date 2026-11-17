#!/bin/sh
# Runs once, the first time the PostgreSQL volume is initialised.
#
# Creates:
#   * the least-privilege application role ($APP_DB_USER) — DML only, no DDL
#   * a separate test database (<db>_test) used by the backend test-suite
#
# The owner role ($POSTGRES_USER) owns all objects and is used for imports and
# migrations. The app role can read/write rows but cannot create, alter or drop
# tables.
set -eu

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname postgres \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" \
  -v db="$POSTGRES_DB" -v test_db="${POSTGRES_DB}_test" -v owner="$POSTGRES_USER" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

CREATE DATABASE :"test_db" OWNER :"owner";

REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
REVOKE ALL ON DATABASE :"test_db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db" TO :"app_user";
GRANT CONNECT, TEMPORARY ON DATABASE :"test_db" TO :"app_user";
SQL

for target in "$POSTGRES_DB" "${POSTGRES_DB}_test"; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$target" \
    -v app_user="$APP_DB_USER" -v owner="$POSTGRES_USER" <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_user";
-- Objects the owner creates later (dump import, migrations) are usable by the app.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT USAGE ON TYPES TO :"app_user";
SQL
done

echo "WanderLuxe: roles and databases initialised."

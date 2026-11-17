-- ─────────────────────────────────────────────────────────────────────────────
-- WanderLuxe on Supabase: lock down the Data API and create the app role.
--
-- Run ONCE in the Supabase SQL editor (as `postgres`), AFTER importing the dump
-- and running the migrations (DEPLOYMENT.md §2). Safe to re-run.
--
-- Why: Supabase exposes the `public` schema through its REST/GraphQL Data API
-- to the `anon` and `authenticated` roles, and by default grants them access to
-- tables `postgres` creates there. The anon key is public by design, so without
-- this script the `users` table (e-mails, password hashes) would be readable
-- by anyone. This API talks to PostgreSQL directly and never needs those roles.
--
-- BEFORE RUNNING: replace the password below (search for CHANGE_ME).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  app_password text := 'CHANGE_ME';   -- e.g. output of: openssl rand -hex 24
BEGIN
  IF app_password = 'CHANGE_ME' OR length(app_password) < 24 THEN
    RAISE EXCEPTION 'Set app_password to a random value of at least 24 characters first.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wanderluxe_app') THEN
    EXECUTE format('CREATE ROLE wanderluxe_app LOGIN NOINHERIT PASSWORD %L', app_password);
  ELSE
    EXECUTE format('ALTER ROLE wanderluxe_app LOGIN NOINHERIT PASSWORD %L', app_password);
  END IF;
END $$;

-- 1. Nothing in `public` is reachable through the Data API (anon / authenticated keys).
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 2. The API's role: read/write rows only — no DDL, no TRUNCATE.
GRANT USAGE ON SCHEMA public TO wanderluxe_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wanderluxe_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO wanderluxe_app;
-- Tables added by future migrations (run as postgres) get the same rights.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wanderluxe_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO wanderluxe_app;

-- 3. Verification — every row should say false / true as labelled.
SELECT
  has_table_privilege('anon', 'public.users', 'SELECT')          AS anon_can_read_users_should_be_false,
  has_table_privilege('authenticated', 'public.users', 'SELECT') AS authenticated_can_read_users_should_be_false,
  has_table_privilege('wanderluxe_app', 'public.users', 'SELECT') AS app_can_read_users_should_be_true,
  has_table_privilege('wanderluxe_app', 'public.users', 'TRUNCATE') AS app_can_truncate_should_be_false;

# Local development

This guide takes you from a fresh clone to a running app, and explains each moving part.

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | ≥ 20.19 (24 LTS recommended; `nvm use` reads `.nvmrc`) | `node -v` |
| npm | ≥ 10 | `npm -v` |
| Docker + Compose plugin | any recent | `docker compose version` |

PostgreSQL does not need to be installed on your machine; it runs in Docker. To use a native PostgreSQL instead, see [§8](#8-without-docker).

## 2. Install and configure

```bash
npm install
npm run setup
```

`npm run setup` (`scripts/setup-env.mjs`) creates two files from their committed examples. It **never overwrites** existing files.

| Created file | Contents |
|---|---|
| `.env` | Docker Compose settings: DB name, owner and app roles with random passwords, ports |
| `backend/.env` | API settings. DB credentials are copied from `.env`. New random JWT secrets. SMTP points to Mailpit. Storage is `local`. |

`frontend/.env.development` is committed and needs no changes: the browser calls `/api`, and Vite proxies that to `http://localhost:3000`.

> npm 11 blocks dependency install scripts by default. The root `package.json` explicitly allows them for `sharp` and `esbuild`, which ship prebuilt binaries. Native `bcrypt` was replaced by pure-JS `bcryptjs`, so no compiler toolchain is needed.

## 3. Start the database

```bash
npm run db:up        # docker compose up -d --wait
```

The first start of the volume runs `database/docker/initdb/01-roles.sh`, which creates:

| Object | Purpose |
|---|---|
| database `wanderluxe`, owner role `wanderluxe_owner` | owns all tables; used for imports and migrations |
| role `wanderluxe_app` | what the API connects as: `SELECT/INSERT/UPDATE/DELETE` only, no DDL, no `TRUNCATE` |
| database `wanderluxe_test` | rebuilt by the backend test-suite on every run |

PostgreSQL is published on `127.0.0.1:5432` only. To use another port, change `POSTGRES_PORT` in `.env` and `DB_PORT` in `backend/.env`.

## 4. Import data and migrate

```bash
npm run db:import    # refuses if the database already has tables
npm run db:migrate
```

- **Data source.** `db:import` loads `database/dump/wanderluxe.sql`, the private production dump, if the file exists. Otherwise it loads `database/schema/baseline.sql`: the same schema and catalogue, without users, bookings or favourites.
- **Dump format.** Plain-SQL dumps are applied with `psql` in a single transaction. Custom-format dumps (`PGDMP` header) are detected and restored with `pg_restore`.
- **Migrations.** `db:migrate` runs `sequelize-cli` as the owner role. The dump already records the 13 original migrations as applied, so only the new ones run (see [DATABASE_AUDIT.md](DATABASE_AUDIT.md)).
- **Starting over.** `npm run db:reset` deletes everything in the local DB. It asks you to type the database name first.

### Local accounts

The production dump contains real users whose passwords you don't know. Create local accounts with:

```bash
npm run db:dev-users
```

This creates (or resets) `admin@wanderluxe.local` and `customer@wanderluxe.local`. Passwords come from `DEV_ADMIN_PASSWORD` / `DEV_CUSTOMER_PASSWORD`; see `backend/.env.example` for the defaults. The script refuses to run when `NODE_ENV=production` or when the database host isn't local.

## 5. Run the app

```bash
npm run dev
```

| URL | What |
|---|---|
| http://localhost:5173 | React app (Vite, hot reload). If 5173 is taken, Vite picks the next free port; the proxy still works. |
| http://localhost:3000/health | API liveness + DB check |
| http://localhost:3000/api/... | REST API |
| http://localhost:8025 | Mailpit: every e-mail the API sends (password reset, newsletter, contact form) |

Backend logs are readable single lines in development and JSON in production. Set `LOG_LEVEL=debug` to log every request. Set `DB_LOG_SQL=true` to log SQL.

### Images in development

- With `STORAGE_DRIVER=local` (the development default), uploads are written to `backend/uploads/<bucket>/…` (git-ignored) and served at `/uploads/...`. Development **never writes to or deletes from** the production buckets.
- The imported dump references images that live in the production Supabase buckets. For those, set `STORAGE_FALLBACK_URL` to the bucket's **public** base URL. A missing local file then redirects there (read-only), so the catalogue shows its real photos.
- `npm run setup` leaves the fallback empty. Copy the public URL in yourself if you want those photos.
- One known gap: the production bucket itself has no file for the "Family Fun in Gold Coast" cover image. The UI now shows a neutral placeholder.

## 6. Environment variables

### Backend (`backend/.env`)

All variables are declared and validated in `backend/src/config/env.ts`.

| Variable | Default | Used by |
|---|---|---|
| `NODE_ENV` | development | logging format, default storage driver, secret length rules |
| `PORT` | 3000 | `src/index.ts` |
| `APP_URL` | first CORS origin | links in password-reset and newsletter e-mails (`src/emails`) |
| `CORS_ORIGIN` | – | comma-separated allow-list (`src/app.ts`). Legacy name: `CORS`. |
| `TRUST_PROXY` | false | number of proxies in front of the API, for the client IP used by rate limiting (`2` on Vercel → Render) |
| `DATABASE_URL` or `DB_HOST/PORT/NAME/USER/PASSWORD` | – | `src/db/models/index.ts` (app role) |
| `DB_MIGRATION_USER/PASSWORD` (or `DB_MIGRATION_URL`) | app creds | `src/db/config/config.cjs` (sequelize-cli) |
| `DB_SSL`, `DB_SSL_CA`, `DB_SSL_REJECT_UNAUTHORIZED` | false, –, true | TLS to remote databases (Supabase). Also honoured by sequelize-cli. |
| `DB_POOL_MAX`, `DB_LOG_SQL` | 10, false | Sequelize options |
| `JWT_ACCESS_SECRET` | – | access-token signing; ≥ 32 chars in production. Legacy name: `ACCESS_TOKEN_SECRET`. `JWT_REFRESH_SECRET` is accepted but no longer used. |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | 15m, 7d | access-token lifetime; session lifetime, extended on every refresh (`src/lib/sessions.ts`) |
| `COOKIE_SECURE` | true in production | `Secure` flag on the `wl_session` cookie. Off in development so it works over `http://localhost`. |
| `BCRYPT_ROUNDS` | 12 | password hashing |
| `RATE_LIMIT_*` | on, 15 min, 20 auth / 10 forms | `src/middlewares/rateLimit.middleware.ts` |
| `DEMO_MODE` | false | enables *Try as customer / admin* (`POST /api/auth/demo`). Create the accounts with `npm run db:demo-users`. |
| `DEMO_CUSTOMER_EMAIL`, `DEMO_ADMIN_EMAIL` | `demo-customer@example.com`, `demo-admin@example.com` | the demo accounts; restricted whenever they sign in (`src/lib/demo.ts`) |
| `SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM` | Mailpit | `src/utils/sendEmail.ts`. With no `SMTP_HOST`, e-mails are logged instead of sent. |
| `CONTACT_RECIPIENT_EMAIL` | `SMTP_USER` | inbox for contact-form notifications |
| `STORAGE_DRIVER` | local (dev) / supabase (prod) | `src/lib/storage.ts` |
| `STORAGE_PUBLIC_URL` | `http://localhost:<PORT>/uploads` | base of every image URL returned by the API. Legacy name: `SUPABASE_PUBLIC_URL`. |
| `STORAGE_FALLBACK_URL` | – | local driver only, see above |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | – | supabase driver only |
| `SUPABASE_BUCKET_TOURS/DESTINATIONS/BLOGS` | tours, destinations, blogs | bucket / folder names |
| `DEV_ADMIN_PASSWORD`, `DEV_CUSTOMER_PASSWORD` | see example | `scripts/create-dev-users.ts` only |

### Frontend

| Variable | Where | Notes |
|---|---|---|
| `VITE_API_URL` | bundled into the client | `/api` everywhere (the default): the Vite proxy in development, the `vercel.json` rewrite on Vercel. Must stay same-origin for the session cookie. Legacy name: `VITE_BACK_BASE_URL`. |
| `API_PROXY_TARGET` | `vite.config.ts` only (not bundled) | where the dev server forwards `/api` and `/uploads` |

### Production configuration

The original production `.env` files were moved out of the source folders during consolidation. They are kept, unmodified, in `.backup/env/` (git-ignored, mode 600). When you deploy, set the production values in the hosting platform's secret store, not in a file in the repo.

## 7. Everyday commands

```bash
npm run check                 # what CI should run: lint, typecheck, tests, build
npm test -w backend           # API tests only
npm run test:e2e              # Playwright browser tests (own DB wanderluxe_e2e, ports 3100/5180)
npm run test:watch -w frontend
npm run db:migrate:status -w backend
npx sequelize-cli migration:generate --name add-something   # run inside backend/
```

## 8. Without Docker

1. Install PostgreSQL 13 or newer.
2. As a superuser, create the roles and databases. The SQL to run is in `database/docker/initdb/01-roles.sh`: replace the `:"var"` placeholders with your names and passwords.
3. Fill in `backend/.env` by hand.
4. Run the database scripts against your server with `DB_EXEC=host`, which uses your `psql` and honours the `PG*` variables:

   ```bash
   DB_EXEC=host PGHOST=localhost PGUSER=wanderluxe_owner PGPASSWORD=... database/scripts/db.sh import
   ```

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `❌ Invalid backend configuration` on start | The message names the variable. Compare with `backend/.env.example`. |
| `Unable to connect to the database` | `npm run db:up`. Check `DB_PORT` matches `POSTGRES_PORT`. |
| `refusing to import over existing data` | Intentional. Use `npm run db:reset` only if you really want a clean copy. |
| `permission denied for table …` | A table was created by a different role than `wanderluxe_owner`. Run migrations through `npm run db:migrate`, which uses the owner role. |
| Port 5432/5173/3000 in use | Change `POSTGRES_PORT` (+ `DB_PORT`), run Vite with `--port`, or set `PORT` (+ `API_PROXY_TARGET`). |
| `429 Too many attempts` while testing sign-in | The auth rate limit (20 per 15 min per IP). Restart the API or set `RATE_LIMIT_ENABLED=false` locally. |
| Images show placeholders | Set `STORAGE_FALLBACK_URL` (see §5), or upload new images through the admin UI. |

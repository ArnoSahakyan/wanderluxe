# WanderLuxe

WanderLuxe is a full-stack travel-agency web app. Visitors browse destinations, tours and blog posts. Customers book tours, save favourites and write reviews. Admins manage the catalogue, users, bookings, reviews, the blog, newsletter subscribers and contact messages.

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 6, TypeScript, React Router 7, TanStack Query 5, Zustand, Tailwind CSS 3, Headless UI, zod |
| Backend | Node.js (ESM), Express 5, TypeScript, Sequelize 6, zod, JWT, bcrypt, helmet, multer + sharp, nodemailer |
| Database | PostgreSQL 17 (works with 13+) |
| Local infra | Docker Compose: PostgreSQL + [Mailpit](https://mailpit.axllent.org/) (catches outgoing e-mail) |
| Tests | Vitest everywhere. Supertest for the API against a real PostgreSQL test DB, Testing Library for React |

## Repository layout

```
wanderluxe/
├── backend/                Express API (npm workspace "wanderluxe-back")
│   ├── src/
│   │   ├── config/env.ts   validated configuration — every env var is declared here
│   │   ├── routes/         URL → middleware chain (auth, validation, rate limits) → controller
│   │   ├── controllers/    request handling + business rules
│   │   ├── validators/     zod schemas for every request
│   │   ├── middlewares/    auth, validation, rate limiting, uploads, error handling
│   │   ├── db/             Sequelize models, migrations, seeders, sequelize-cli config
│   │   ├── lib/            logger, storage drivers (local / Supabase)
│   │   ├── emails/         HTML e-mail templates
│   │   └── utils/          tokens, pagination, security helpers, mailer, …
│   ├── tests/              API integration tests (rebuild a dedicated test DB)
│   └── scripts/            create-dev-users.ts
├── frontend/               React SPA (npm workspace "wanderluxe-frontend")
│   └── src/                api/ hooks/ queries/ store/ router/ pages/ admin/ components/ shared/
├── database/
│   ├── dump/               the private production dump (git-ignored — see database/README.md)
│   ├── schema/baseline.sql schema + public catalogue data, no personal data (tracked)
│   ├── docker/initdb/      creates the least-privilege app role + test DB on first start
│   └── scripts/db.sh       import / reset / psql helper
├── docs/                   ARCHITECTURE.md, TESTING.md
├── docker-compose.yml      PostgreSQL + Mailpit for local development
└── package.json            npm workspaces + root scripts
```

## Quick start

Prerequisites:
- **Node.js ≥ 20.19** (24 recommended, see `.nvmrc`) and npm 10+
- **Docker** with the Compose plugin, for PostgreSQL and Mailpit

```bash
npm install                 # installs both workspaces
npm run setup               # creates .env, backend/.env with random local secrets (never overwrites)
npm run db:up               # starts PostgreSQL + Mailpit and waits until healthy
npm run db:import           # imports database/dump/wanderluxe.sql (or the baseline) into an EMPTY db
npm run db:migrate          # applies schema migrations
npm run db:dev-users        # optional: admin@wanderluxe.local / customer@wanderluxe.local
npm run dev                 # API on :3000 and web app on :5173, with hot reload
```

Open http://localhost:5173. E-mails such as password resets and newsletter confirmations appear at http://localhost:8025.

The development account passwords are `DEV_ADMIN_PASSWORD` / `DEV_CUSTOMER_PASSWORD` in `backend/.env.example`. They work only against a local database.

Step-by-step details, running without Docker, and troubleshooting are in **[LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)**.

## Root scripts

| Command | What it does |
|---|---|
| `npm run dev` | Backend (`tsx watch`) and frontend (Vite) together |
| `npm run dev:backend` / `dev:frontend` | One side only |
| `npm run build` | Type-checks + compiles the API to `backend/dist`, builds the SPA to `frontend/dist` |
| `npm start` | Runs the compiled API (`NODE_ENV=production`) |
| `npm run lint` / `typecheck` / `test` | Across both workspaces |
| `npm run check` | lint + typecheck + test + build: run this before pushing |
| `npm run db:up` / `db:down` | Start / stop the docker services (data is kept) |
| `npm run db:import` | Import the dump into an empty database (refuses otherwise) |
| `npm run db:migrate` | Apply pending migrations (`db:migrate:test` for the test DB) |
| `npm run db:reset` | **Delete** all local data (asks you to type the DB name) |
| `npm run db:psql` | psql shell inside the container |

Run a script in one workspace with `npm run <script> -w backend` or `-w frontend`.

## Environment variables

| File | Purpose | Committed? |
|---|---|---|
| `.env.example` → `.env` | Docker Compose: database names, passwords, ports | example only |
| `backend/.env.example` → `backend/.env` | API configuration (DB, JWT, SMTP, storage, CORS, rate limits) | example only |
| `frontend/.env.development` | `VITE_API_URL=/api` + dev proxy target | yes (no secrets) |
| `frontend/.env.example` | Documents frontend variables for production builds | yes |

Rules:
- **Everything prefixed `VITE_` is shipped to browsers.** Only public values (the API URL) belong there.
- Secrets live in `backend/.env` only, and that file is git-ignored.
- The backend validates its configuration at start-up. A missing or malformed variable produces a readable error listing variable names only, never values.

The full variable reference is in `backend/.env.example` and [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md#environment-variables).

## Testing

```bash
npm run db:up      # tests need PostgreSQL
npm test           # 37 API tests + 16 frontend tests
```

The API suite rebuilds the dedicated `wanderluxe_test` database before every run, so it never touches your development data. See [docs/TESTING.md](docs/TESTING.md).

## Git workflow

- This is a single repository. It was consolidated from the former `travel-back` and `travel-front` repositories with their full history preserved. See [REPOSITORY_MIGRATION.md](REPOSITORY_MIGRATION.md).
- Repository-level identity: `ArnoSahakyan <sahakyan.arno@gmail.com>`.
- Suggested flow:
  1. Branch from `main`.
  2. Make small commits (`feat:`, `fix:`, `chore:`, `docs:` prefixes).
  3. Run `npm run check`.
  4. Open a PR.
- Remote: `git@github.com:ArnoSahakyan/wanderluxe.git`. Pushing to `main` redeploys on Render and Vercel ([DEPLOYMENT.md](DEPLOYMENT.md)).

## Documentation

| Document | Contents |
|---|---|
| [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) | Setup in detail, env var reference, images, e-mail, troubleshooting |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Supabase (database) + Render (API) + Vercel (frontend), step by step |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the pieces fit, request lifecycle, auth flow, conventions |
| [docs/TESTING.md](docs/TESTING.md) | Test strategy, how to run and write tests |
| [database/README.md](database/README.md) | Dump handling, import/restore, migrations, roles |
| [PROJECT_AUDIT.md](PROJECT_AUDIT.md) | Stage-1 discovery: inventory, API list, findings |
| [SECURITY_AUDIT.md](SECURITY_AUDIT.md) | Vulnerabilities, severity and fix status |
| [DATABASE_AUDIT.md](DATABASE_AUDIT.md) | Schema review, defects, migrations |
| [REPOSITORY_MIGRATION.md](REPOSITORY_MIGRATION.md) | How the two repositories were merged |
| [FINAL_AUDIT_REPORT.md](FINAL_AUDIT_REPORT.md) | What changed, verification results, open items |

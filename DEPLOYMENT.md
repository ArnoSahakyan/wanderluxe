# Deployment

```
Vercel (frontend/)  ──HTTPS──►  Render web service (backend/)  ──SSL──►  Supabase PostgreSQL
                                        └────────────────────────────►  Supabase Storage (images)
```

**Why the database moves to Supabase:**
- Render's free PostgreSQL is deleted after 30 days.
- The images already live in a Supabase project, so the database can sit next to them in **the same project**: one dashboard and one bill.

Free-plan caveats (check the providers' current terms):
- **Supabase** pauses free projects after about a week without activity. Data is kept; you resume the project from the dashboard.
- **Render**'s free web service sleeps when idle, so the first request after a pause takes about a minute.

Upgrading either removes these limits.

> Every step below was rehearsed locally against a PostgreSQL configured like Supabase: SSL on, plus `anon`/`authenticated` roles with Supabase's default grants. Import, migrations, the lockdown script, and the API running as the restricted role all worked.

## 0. Save any newer data from the old Render database (if it still exists)

The private dump (`database/dump/wanderluxe.sql`) is the reference data. If the current Render database holds newer users or bookings you want to keep, export it first.

In Render: Dashboard → your PostgreSQL → **External Database URL**.

```bash
docker run --rm postgres:17-alpine pg_dump -Fc --no-owner --no-privileges "<external-url>" > database/dump/render-latest.dump
```

In step 2, import that file instead (`--file database/dump/render-latest.dump`). The script detects the custom format and uses `pg_restore`. `*.dump` files are git-ignored.

## 1. Supabase: get the connection details

Open the Supabase project that already holds the `tours`/`destinations`/`blogs` buckets. Note its region; choose the same region for Render.

1. **Connect** (top bar) → **Session pooler** → copy the URI. It looks like:
   `postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres`

   Use the *pooler*, not the direct connection. The direct host is IPv6-only, and Render's free plan connects over IPv4. Session mode (port 5432) suits a long-running server.
2. **Project Settings → Database → SSL Configuration → Download certificate** (`prod-ca-*.crt`). The API uses it to verify it is really talking to Supabase.
3. Recommended: in the same section, turn on **Enforce SSL on incoming connections**.
4. Recommended: **Project Settings → Data API** → remove `public` from *Exposed schemas*. The API never uses Supabase's REST/GraphQL layer.

## 2. Supabase: load the data (run from your machine, once)

```bash
# 2a. Import the dump (refuses if the database already has tables; asks you to type 'import')
database/scripts/db.sh import --url "postgresql://postgres.<ref>:<db-password>@<pooler-host>:5432/postgres?sslmode=require"

# 2b. Apply the 5 new migrations as the owner (postgres)
DB_MIGRATION_URL="postgresql://postgres.<ref>:<db-password>@<pooler-host>:5432/postgres" \
DB_SSL=true DB_SSL_CA="$(cat ~/Downloads/prod-ca-2021.crt)" \
npm run db:migrate -w backend
```

**2c. Lock down the Data API and create the app role:**
1. Open **SQL Editor**.
2. Paste `database/supabase/setup-roles.sql`.
3. Replace `CHANGE_ME` with a random value (`openssl rand -hex 24`), then run it.
4. Check the result: the last query should show `f | f | t | f`.

**Why 2c matters.** Supabase's API roles (`anon`, `authenticated`) get access to new tables in `public` by default, and the anon key is public by design. Without this script, anyone with that key could read the `users` table through `https://<ref>.supabase.co/rest/v1/users`. The script removes that access and creates `wanderluxe_app`, which can only read and write rows. Supabase's Security Advisor may still warn that "RLS is disabled" on these tables. With the grants removed, those tables are not reachable through the API.

The **app** connection string uses that role. In the pooler, the user name gets the project ref appended:

```
postgresql://wanderluxe_app.<project-ref>:<app-password>@<pooler-host>:5432/postgres
```

If the pooler ever rejects the custom role, you can temporarily use the `postgres` URL for `DATABASE_URL`. Everything works, but the API then has full rights over the schema.

## 3. Render: deploy the API from the new repository

**Option A — Blueprint (recommended).** Dashboard → **New → Blueprint** → select `ArnoSahakyan/wanderluxe`. `render.yaml` defines:
- build: `npm ci --include=dev && npm run build -w backend`
- start: `npm start -w backend`
- health check: `/health`
- Node 24, and new random JWT secrets

You are prompted for each value marked below. Afterwards, delete the old service (and the old Render database once you've finished step 0).

**Option B — keep the existing service.** Settings → connect the new repository. Set *Root Directory* empty and the build and start commands above. Then add the variables below.

| Variable | Value |
|---|---|
| `DATABASE_URL` | the `wanderluxe_app.<ref>` pooler URL from step 2 |
| `DB_SSL` | `true` |
| `DB_SSL_CA` | contents of the downloaded `.crt`. Paste the whole PEM; multi-line is fine. |
| `APP_URL` | `https://<your-vercel-domain>` (used in e-mail links) |
| `CORS_ORIGIN` | the same origin(s), comma-separated, no trailing slash, e.g. `https://wanderluxe.vercel.app,https://wanderluxe.am` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | generated by the Blueprint. If set by hand: two different `openssl rand -hex 32` values. |
| `SMTP_HOST/PORT/SECURE/USER/PASS` | your mail provider. For Gmail: `smtp.gmail.com`, `465`, `true`, the address, and an **app password**. |
| `CONTACT_RECIPIENT_EMAIL` | inbox for contact-form messages |
| `STORAGE_DRIVER` | `supabase` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API (the service-role key is secret) |
| `STORAGE_PUBLIC_URL` | `https://<ref>.supabase.co/storage/v1/object/public` |
| `SUPABASE_BUCKET_TOURS/DESTINATIONS/BLOGS` | your bucket names |
| `TRUST_PROXY` | `1` (correct client IPs for rate limiting) |

The old variable names (`ACCESS_TOKEN_SECRET`, `CORS`, `SUPABASE_PUBLIC_URL`, …) still work, but the new names are clearer. New JWT secrets sign everyone out once; that's expected.

The original production values are in `.backup/env/travel-back.env` on your machine, for reference.

Check: `https://<service>.onrender.com/health` → `{"status":"ok","database":"up"}`. The log line `Database connected` should show `"ssl":true`.

## 4. Vercel: deploy the frontend from the new repository

In the existing project → **Settings → Git** → connect `ArnoSahakyan/wanderluxe` (or create a new project from it), then:

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| "Include files outside the root directory" | enabled (the default; needed for the workspace install) |
| Framework / build / output | picked up from `frontend/vercel.json` (`cd .. && npm ci`, `npm run build`, `dist`) |
| Environment variable `VITE_API_URL` | `https://<service>.onrender.com/api` (Production) |

- Remove the old `VITE_BACK_BASE_URL` and `VITE_SUPABASE_STORAGE_URL` variables. The first is replaced by `VITE_API_URL`; the second is no longer used.
- `frontend/vercel.json` also adds basic security headers and long-term caching for hashed assets.

## 5. Smoke test

- [ ] The home page shows destinations and tours with images.
- [ ] Sign up, sign in, and see your profile.
- [ ] Forgot password: the e-mail arrives and its link opens the Vercel site.
- [ ] Book a future tour, see it under *My Bookings*, then cancel it.
- [ ] Admin: the dashboard loads; editing a tour and uploading an image work.
- [ ] The contact form arrives at `CONTACT_RECIPIENT_EMAIL` and shows under *Admin → Messages*.
- [ ] The browser console shows no CORS errors. If it does, check `CORS_ORIGIN` matches the address bar exactly.

## 6. Clean up

- **Old GitHub repositories:** archive `travel-back` and `travel-front` (Settings → Archive) once both deployments build from `wanderluxe`.
- **Old Render resources:** delete the old Render database and service after step 0 and the smoke test.
- **Production secrets:** rotate any that were shared — the Supabase service-role key, the SMTP password, the old database password.

## Ongoing

- **Code changes:** pushing to `main` redeploys the API on Render (only when backend files change) and the frontend on Vercel.
- **Schema changes:** new migrations are **not** run automatically. Run step 2b against Supabase *before* pushing code that depends on them.
- **Rollback:** see DATABASE_AUDIT.md §6. Supabase's daily backups (paid plans) or a `pg_dump` before each migration give you a way back.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `ENETUNREACH` / `connect ETIMEDOUT` to `db.<ref>.supabase.co` | You're using the direct (IPv6) host. Use the Session pooler URL. |
| `self-signed certificate in certificate chain` | `DB_SSL_CA` is missing or truncated. Paste the full PEM, including the BEGIN/END lines. |
| `password authentication failed for user "wanderluxe_app"` | The pooler user must be `wanderluxe_app.<project-ref>`. Re-run `setup-roles.sql` to reset the password. |
| `permission denied for table …` | The table was created by a role other than `postgres`. Run migrations with the `postgres` URL (step 2b), then re-run `setup-roles.sql`. |
| Health check fails right after deploy | The free service is waking up, or `DATABASE_URL`/`DB_SSL` is wrong. Check the Render logs: the config error lists variable names. |
| Frontend calls `localhost` or `/api` on Vercel | `VITE_API_URL` is not set for Production. It is baked in at build time, so redeploy after setting it. The Vercel build now fails with this message instead of shipping a site whose API calls return HTML. |

## Keeping the API awake

Render's free web service sleeps after about 15 minutes without traffic, and the next visitor waits about a minute for it to start.

**Built in: `.github/workflows/keep-alive.yml`.** It calls `GET /health` every 10 minutes.
- **Cost:** GitHub Actions is free for public repositories.
- **Side effect:** `/health` runs `SELECT 1`, so the same ping keeps the Supabase project from pausing after a week of inactivity.
- **Manual run:** Actions → *Keep API awake* → *Run workflow*.
- **Different URL:** if the service URL changes, set a repository variable `API_HEALTH_URL` (Settings → Secrets and variables → Actions → Variables).
- **Failures:** a failed run e-mails you, which doubles as a basic downtime alert.

Limits to know:
- **Timing:** GitHub can delay scheduled runs at busy times, so an occasional cold start can still happen.
- **Auto-disable:** in public repos GitHub disables schedules after 60 days without commits. It e-mails you first; re-enable with one click.
- **Render free hours:** the free plan includes 750 instance hours per month per workspace. Running 24/7 uses about 720–744, so this fits only if this is your only free service that is kept awake.

**More punctual alternative (no code):** create a free monitor on [UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org):
- **Check:** HTTP(s) monitor on `https://wanderluxe-api.onrender.com/health`
- **Interval:** every 5 minutes
- **Bonus:** it also e-mails you when the API is down.

You can run it alongside the workflow, or instead of it. If you use only the external monitor, delete the workflow file.

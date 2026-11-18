# WanderLuxe — Final Audit & Modernization Report

_Date: 2026-11-17. Companion documents:_
- _[PROJECT_AUDIT.md](PROJECT_AUDIT.md): what was found_
- _[SECURITY_AUDIT.md](SECURITY_AUDIT.md) and [DATABASE_AUDIT.md](DATABASE_AUDIT.md): detail_
- _[REPOSITORY_MIGRATION.md](REPOSITORY_MIGRATION.md): git consolidation_

## 1. Original condition

- **Repositories:** two separate repos, `travel-back` (Express 5 + Sequelize, TypeScript) and `travel-front` (React 19 + Vite 6, TypeScript). Both were clean, with every branch merged.
- **Configuration:** both `.env` files held **production** values. There was no local setup.
- **Database:** the supplied dump imported fine, but the app could not work on it:
  - sequences were never advanced, so the first sign-up or booking would crash on a duplicate key;
  - the `contacts` table was missing, so the contact form and the admin dashboard failed;
  - the sequelize-cli config was missing, so migrations could not run.
- **Security:** two High issues, among others:
  - the password hash leaked to the client and was persisted in `localStorage`;
  - booking authorization used the wrong role.

  Also: plaintext reset tokens, useless refresh tokens, no validation, rate limiting or security headers, and an oversellable booking flow.
- **Frontend bugs:** a refresh-token loop, a crash after review delete, stale caches, and a modal that hijacked page state. Several contrast and accessibility gaps.
- **Tests and tooling:** no tests. Mixed yarn/npm lock files. Unused and outdated dependencies, several with advisories.

## 2. Architecture now

One npm-workspaces monorepo (`backend/`, `frontend/`, `database/`, `docs/`). PostgreSQL and Mailpit run in Docker Compose; the apps run on the host with hot reload. Details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

What was deliberately **kept**:
- TypeScript and the existing stack: Express 5, Sequelize, React Query, Zustand, Tailwind.
- Every route path, method and response shape. Changes are additive only, e.g. `/auth/signin` and `/auth/me` now also return `phone_number`.
- Business rules:
  - 3-day cancellation window for customers
  - 10 images per tour, at least one kept
  - drafts visible to admins only
  - member rank thresholds
  - cancelled bookings are deleted, not status-flagged
  - random order on the home-page reviews
- The visual identity: same palette, fonts and layout. Only light-mode token values were darkened, for contrast.

## 3. Problems fixed

### Security

See SECURITY_AUDIT.md for all 23 items. The highlights:

| Area | Change |
|---|---|
| Data exposure | Users are serialised through an allow-list. Password hashes and reset data are never returned. |
| Authorization | Booking detail checks the requester's role. Customers can delete their own reviews (the UI already offered it). Admins cannot delete or demote themselves. |
| Sessions | Access 15 min / refresh 7 days, separate secrets, HS256 pinned. Refresh tokens are revoked after a password change or reset. Bad refresh tokens get 401 instead of 500. |
| Reset & newsletter tokens | 256-bit random, stored as SHA-256, single use, 1 h. Responses don't reveal whether an account exists. |
| Input | zod validation on every route. Page size ≤ 100. Ids and dates are coerced. Search wildcards are escaped. Unknown keys are stripped. |
| Abuse | Rate limits: auth 20 / forms 10 per 15 min per IP. helmet headers, no `X-Powered-By`. Body size limits. |
| Injection | The contact-form e-mail is HTML-escaped. Uploaded "images" must actually decode with sharp. Storage paths are slugified and confined. |
| Least privilege | The app connects as a DML-only role. Migrations use the owner role. |
| Dev safety | The local storage driver means development can no longer upload to or delete from production buckets. Production secrets were moved out of the source folders. |

### Database

Five reversible, idempotent migrations:
1. create `contacts`;
2. sync sequences and set `OWNED BY`;
3. add 11 indexes;
4. add integrity constraints: unique (user, tour) for favourites and reviews, one cover image per tour, unique `lower(email)`, CHECKs for rating, people, price, spots and dates. Each checks the data first and never deletes anything;
5. add `users.password_changed_at`.

Undo and redo of all five was verified. Index use was verified with EXPLAIN (DATABASE_AUDIT.md §5).

### Backend

- Central validated config, with backward-compatible variable names.
- Transactions:
  - **booking creation** reserves seats with an atomic conditional `UPDATE`; a concurrency test proves no overselling;
  - also used for cancellation, tour + images, cover swap, image delete and newsletter confirmation.
- Storage files are deleted only after the DB commit.
- Error mapping: 400/401/404/409/413, JSON 404s, no stack traces.
- Structured logger, `/health`, graceful shutdown, configurable pool and SSL.
- Fixed bugs:
  - blog update returned `null` after a slug change;
  - an image could be set as the cover of another tour;
  - destination images got URLs even when empty;
  - departed tours were bookable;
  - contact form failed when SMTP was down (the message is stored first now).
- The contact recipient moved from source code to config. Dev-users script added. ESLint added.

### Frontend

- **API client:** `VITE_API_URL` with a Vite proxy. Single-flight token refresh through the non-intercepted client: no loop, logout on failure, and the cache is cleared on logout. The session is re-validated with the server at start.
- **Fixed bugs:**
  - the hash in `localStorage`; admins losing their role after a profile save;
  - the review delete crash;
  - stale review, favourite and seat caches;
  - the review modal moving `?page`;
  - `NaN` pages;
  - a repeating toast;
  - the empty phone field;
  - the wrong sign-up toast;
  - the "Booked on" date showing the tour start;
  - the newsletter page invisible in light mode;
  - the GlobalSearch closing on input click;
  - object-URL leaks.
- **Admin and profile pages:** moved from hand-rolled `useEffect` fetching to React Query, with error states. All `any` removed; ESLint has 0 errors (it had 32).
- **Dead code removed:** the stale Tailwind v4 `output.css`, the empty `App.css`, the unused Supabase URL helper and its `VITE_SUPABASE_STORAGE_URL`, and unused ESLint plugins.

### UI/UX & accessibility

- **WCAG AA light mode:** gold text 2.2 → 5.3:1, coral prices 2.95 → 4.5:1.
- Visible keyboard focus everywhere, and reduced-motion support.
- Modal scroll-lock re-enabled without layout shift (`scrollbar-gutter`).
- Accessible names on every icon-only button. Pagination is a labelled `nav`. The star rating is a radio group. The search has a label and `role="search"`; Escape and Enter work. Blog form labels are bound to their inputs. The set-cover button is reachable by keyboard.
- Clear states:
  - departed / sold-out tours show a message and a disabled "Unavailable" button;
  - booking cancellation and blog deletion ask for confirmation;
  - missing photos show a neutral placeholder instead of the broken-image icon.
- Checked in the browser at 1280 px and 375 px: no horizontal overflow, and nothing changed visually beyond the above.

### Performance

- FK and lookup indexes; `distinct` counts on paginated includes.
- The cover-only image join for "my bookings" replaces a join over all images.
- Single-query unique-slug generation, replacing a loop of queries.
- Bounded `limit` everywhere; `/search` defaults to 5 per type.
- React Query: no retries on 4xx, no refetch-on-focus storms. Vendor chunks split (`react`, `query`, `markdown`), with lazy routes as before.
- No premature work: no N+1 patterns were found, and the destination subqueries are now index-only scans.

### Dependencies

| Change | Why |
|---|---|
| removed `bcrypt` (native) → `bcryptjs` | No compiler needed. The same `$2b$` hashes verify unchanged. |
| removed `body-parser`, `nodemon`, `ts-node`, `sequelize-typescript`, `sequelize-auto`, `uuid`, `@types/bcrypt` | unused, or replaced by `node:crypto` |
| removed `eslint-plugin-vue/react/import`, `@types/react-router-dom` (v5), standalone `@typescript-eslint/*` | unused, or wrong major version |
| added `helmet`, `express-rate-limit`, `zod` (backend), `clsx` (declared; it was already imported) | security, validation, correctness |
| upgraded `multer` 1→2, `nodemailer` 7→10, `sharp` 0.34→0.35, `zod` 3→4, `vite` 6.3→6.4.6, `swiper` 11→12 | fix published advisories (critical/high) |
| added dev: `vitest`, `supertest`, `@testing-library/*`, `jsdom`, `@types/pg`, `concurrently`, ESLint for backend | testing and tooling |

`npm audit` at hand-over: **0 critical, 1 high, 10 moderate**. All are transitive or dev-time:
- `nanoid` inside `react-markdown-editor-lite` (admin editor, client-side)
- `minimatch`/`glob` inside `sequelize-cli`
- `postcss-selector-parser` inside `@tailwindcss/typography`
- `uuid` inside `sequelize` (affected functions not used)

None can be fixed without a major-version change of the parent package. See §6.

> **Update 2026-11-17 (dependency modernisation):** `npm audit` now reports **0 vulnerabilities**. Every package is on its latest major, except TypeScript (6.0, since typescript-eslint doesn't support 7 yet), `@types/node` (kept at 24 to match Node 24) and Sequelize (6; 7 is still alpha). The transitive advisories above are fixed with targeted npm `overrides` in the root `package.json`. See §8.

## 4. Environment changes

| Before | After |
|---|---|
| `travel-back/.env`, `travel-front/.env` with production values | Moved unchanged to `.backup/env/` (git-ignored, mode 600). |
| – | `.env` (compose) and `backend/.env` (API) with **random local secrets**, created by `npm run setup` |
| `VITE_BACK_BASE_URL=<prod API>` | `frontend/.env.development` → `VITE_API_URL=/api`, proxied to `localhost:3000` |
| `CORS` doubled as the e-mail link base | `CORS_ORIGIN` (list) + `APP_URL` |
| SMTP = production Gmail | Mailpit on `localhost:1025`, UI at `:8025` |
| Supabase (production, read/write) | `STORAGE_DRIVER=local` with an optional read-only fallback to the public bucket URL |

## 5. Verification (actually executed)

| # | Check | Result |
|---|---|---|
| 1 | PostgreSQL 17.11 starts (compose, healthcheck) | ✅ |
| 2 | Dump imports, single transaction | ✅ Re-import into a non-empty DB is refused. Full reset → import → migrate → dev-users flow re-run from scratch. |
| 3 | DB connections (least-privilege role) | ✅ App role has INSERT, no TRUNCATE, no CREATE |
| 4 | Backend starts: dev (`tsx watch`) and compiled production build (`npm start`) | ✅ `/health` → `{"status":"ok","database":"up"}` |
| 5 | Frontend starts (Vite) and production build | ✅ built in ~4 s |
| 6 | Frontend ↔ backend through the proxy | ✅ |
| 7 | Authentication | ✅ tests + sign-in as the local admin in the browser |
| 8 | Authorization | ✅ tests: 401/403/owner/admin matrices |
| 9 | Existing routes | ✅ every route in the inventory is exercised by tests or the browser |
| 10 | Features in the browser | ✅ catalogue, tour details, booking → profile → cancel, admin dashboard / users / messages / tour editor |
| 11 | Business rules | ✅ tests: 3-day rule, seat maths, price, image limits, drafts |
| 12 | DB behaviour | ✅ concurrency test (6 parallel bookings for 2 seats → exactly 2 succeed) |
| 13 | Responsive | ✅ 375 px: no horizontal scroll on home and tour details |
| 14 | Tests | ✅ **backend 37/37, frontend 16/16** (`npm run check` exit 0). Reintroducing two original bugs made 4 tests fail, so the tests do detect them. |
| 15 | Lint / typecheck | ✅ backend 0 errors (16 `any` warnings in Express/Sequelize typings), frontend 0 problems. `tsc` clean on both. |
| 16 | No production secrets tracked | ✅ All 18 production values compared against the tree and full git history. No secret (JWT, DB password, SMTP password, Supabase key/URL) appears. Public values do: bucket names, SMTP host, the owner's e-mail in the original seeder. |
| 17 | No destructive changes | ✅ Dump unchanged (checksum OK). No rows deleted by migrations. Original repos kept intact in `.backup/`. |
| 18 | Monorepo | ✅ One `.git`. Imported trees byte-identical. 118 commits. Identity `ArnoSahakyan <sahakyan.arno@gmail.com>` (repository-level). Nothing pushed. |
| 19 | Rate limiting | ✅ manual: the 21st sign-in in 15 min → `429` with `RateLimit` / `Retry-After` |

## 6. Remaining issues and manual steps

**Needs you:**
1. **Production rollout:** back up, then run the 5 migrations (DATABASE_AUDIT.md §6).
   - Create a least-privilege DB role.
   - Set `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (≥ 32 chars, different), `APP_URL`, `CORS_ORIGIN`, `CONTACT_RECIPIENT_EMAIL`, `TRUST_PROXY`.
   - Old variable names still work.
   - Existing sessions keep working; reset links sent before the deploy stop working.
2. **Rotate secrets** if the old `.env` files were ever shared.
3. **Redeploy from the new repository:** done 2026-11-17.
   - Database: Supabase (dump imported, migrations applied, Data API locked down).
   - API: Render (`wanderluxe-api.onrender.com`).
   - Frontend: Vercel (`wanderluxe.vercel.app`).
   - A GitHub Actions health ping keeps the API awake.
   - Old repos and the old Render service were deleted.

   See [DEPLOYMENT.md](DEPLOYMENT.md).
4. **SQL dump:** decided to keep it out of git because it contains personal data. Share it privately with developers who need real data (database/README.md).
5. **Missing production image:** the cover of "Family Fun in Gold Coast" (tour 4) no longer exists in the Supabase bucket. Re-upload it via the admin UI.

**Known limitations, deliberately not changed:**
- ~~**Tokens in `localStorage`** (S-20)~~ fixed on 2026-11-18: httpOnly session cookie, access token in memory (recommendation 1).
- **Cancelled bookings are deleted** rather than set to `cancelled`. That is the existing business rule, although the enum supports the softer option.
- **Reviews don't require a booking.** This is existing behaviour.
- **Tour dates in the dump are all in the past,** so locally nothing is bookable until an admin creates or edits a tour.
- ~~**Remaining `npm audit` items**~~ fixed on 2026-11-17 (§8).
- **Hero headline artefacts:** the `drop-shadow` filter showed jagged artefacts in the headless preview browser only. Not reproduced elsewhere, so left as designed.

## 7. Recommendations (in priority order)

1. ~~Move the refresh token to an `httpOnly; Secure; SameSite=Strict` cookie~~ done 2026-11-18. The refresh token is an opaque, rotating token stored hashed in `refresh_tokens`, sent only in a `SameSite=Strict` cookie scoped to `/api/auth`. The access token lives in memory. `/auth/logout` revokes the session on the server. Vercel forwards `/api` to Render so the cookie is first-party. See docs/ARCHITECTURE.md.
2. ~~Add a CI workflow~~ done: `.github/workflows/ci.yml`.
3. ~~Add Playwright end-to-end tests~~ done: `e2e/` (see docs/TESTING.md).
4. ~~Replace `react-markdown-editor-lite`~~ not needed. It is still maintained, and its `nanoid` advisory is fixed by an override (§8).
5. Make cancellation set `status='cancelled'` instead of deleting, if the business wants booking history and refunds. The enum already supports it.
6. ~~Upgrade Tailwind 3 → 4~~ done (§8). Upgrade Sequelize 6 → 7 once it leaves alpha.

## 8. Dependency modernisation (2026-11-17)

Done on `main` as separate commits, one per step:
- Each step ran `npm run check` (lint, typecheck, 39 API + 17 frontend tests, both builds) and the 5 Playwright tests.
- Before the upgrades, 46 full-page screenshots were taken: public pages, profile and admin, at desktop and mobile widths, in light and dark mode. The same pages were captured after each visual change and diffed pixel by pixel.

| Step | Change | Notes |
|---|---|---|
| minor/patch | every package raised to its latest minor; Prettier 3.5 → 3.10 | formatting-only source changes |
| Vite | 6.4 → 8.3 (Rolldown), `@vitejs/plugin-react` 4 → 6, sitemap plugin 0.11 | `manualChunks` → `codeSplitting` groups. JS+CSS downloaded (gzip): home 265 → 250 KiB in 10 instead of 40 files, tour page 303 → 285 KiB, sign-in 210 → 248 KiB |
| Tailwind | 3.4 → 4.3 via `@tailwindcss/upgrade`; `@tailwindcss/vite` instead of PostCSS | Config is now in `src/index.css`. Pointer cursors, placeholder and border colours keep their v3 values. Screenshots are identical, except date inputs, which are 2px shorter |
| lint/types | ESLint 9 → 10, TypeScript 5.9 → 6.0, react-hooks plugin 5 → 7 (React Compiler rules), react-refresh 0.5 | Fixed what the new rules found: state copied from props in effects (Tour/Destination/Blog forms, user edit modal), an impure render (tour page clock), `watch()` → `useWatch()` |
| libraries | `@hookform/resolvers` 7, swiper 14, jsdom 31, jest-dom 7, dotenv 18, `@types/*` | Swiper thumbnails verified in a production build |
| audit | npm `overrides`: nanoid 5 (markdown editor), uuid 11 (sequelize), glob 14 + minimatch 11 (sequelize-cli tooling), postcss-selector-parser 6.1.6 | 11 findings (1 high) → 0 |
| a11y | password-change and destination form labels linked to their inputs | found by scanning every page for `label[for]` without a target |

Follow-up cleanup, also 2026-11-17:
- `sitemap.xml`/`robots.txt` advertised `wanderluxe.am`, a domain the project doesn't use. They now use `SITE_URL` (default `https://wanderluxe.vercel.app`) and list all public pages.
- The last 16 `any` types in the backend are gone, so lint has 0 warnings.
- The tour gallery's thumbnails didn't switch slides in development: React StrictMode mounts the thumbs Swiper twice. Fixed. Production had always worked.
- Render deploys the API only after CI passes (`autoDeployTrigger: checksPass`).


## 9. Portfolio polish and code quality (2026-11-18)

- **Demo accounts.** *Try as customer* / *Try as admin*, enabled with `DEMO_MODE`. The demo admin is read-only and gets real customers' personal data masked. The demo customer can only touch their own trips, which are cleaned up after 24 h.
- **Bugs fixed.** Each now has a regression test.
  - "Booked on Invalid Date" on the profile dashboard.
  - Review dates showing "Invalid Date". The *My Reviews* page crashed once a user had a review, because the frontend read `created_at` while the API sends `createdAt`.
  - A blank error toast on sign-in/sign-up network errors.
  - The password form clearing itself even when the server rejected the change.
  - The favourite-status request firing for signed-out visitors.
  - Browser validation pre-empting the contact form's own messages.
- **Error handling.** A route-level error page and an app-level error boundary. A stale tab after a deploy reloads itself once instead of showing a blank page.
- **Accessibility and SEO.**
  - Lighthouse gives the main pages 100 for accessibility, best practices and SEO (was 98–100 / 100 / 91–92).
  - Fixes behind that: per-page titles, a meta description and social tags, one `h1` per page, ordered headings, and better gallery alt text.
  - Guarded in CI by `e2e/tests/quality.spec.ts` (axe-core).
- **Performance.**
  - Public images resized: the hero from 495 to 265 KiB, the About image from 1.4 MB to 199 KiB.
  - The first card and the gallery's first photo load eagerly at high priority. Font CSS no longer blocks the first paint.
  - Home page LCP under throttling went from 14.6 s to 7.5 s. Tours and destinations still wait on full-size storage images; see docs/FEATURE_PLANS.md.
- **Tests and CI.**
  - 52 API tests, up from 45.
  - 66 frontend tests, up from 21.
  - 18 Playwright tests, up from 6, now also run in CI as a second job.
- **README** rewritten for visitors, with screenshots and an architecture diagram. Feature plans are in docs/FEATURE_PLANS.md.

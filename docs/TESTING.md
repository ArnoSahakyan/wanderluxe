# Testing

```bash
npm run db:up    # PostgreSQL must be running for the API tests
npm test         # both workspaces
npm run check    # lint + typecheck + tests + production builds
```

## Backend — `backend/tests` (Vitest + Supertest, 75 tests)

- **Real database, hermetic.** `tests/globalSetup.ts` connects as the owner role and:
  1. drops the `wanderluxe_test` schema;
  2. loads `database/schema/baseline.sql`;
  3. runs every migration.

  It refuses to touch a database whose name does not end in `_test`.
- Tests talk to the Express `app` in-process with Supertest; nothing listens on a port.
- E-mails are captured in memory (`sentEmails` in `src/utils/sendEmail.ts`), so tests can read reset/confirmation tokens.
- Rate limiting is disabled when `NODE_ENV=test`.
- Images are written to a temporary uploads directory.

| File | Covers |
|---|---|
| `auth.test.ts` | sign-up validation and case-insensitive duplicates; sign-in without data leaks or enumeration, refresh token only in an `HttpOnly; SameSite=Strict; Path=/api/auth` cookie, stored hashed; `/me`; sessions: rotation on refresh, missing/garbage/access-token cookies, two tabs refreshing at once, reuse of a rotated token revoking the session, logout ending only that session, password change keeping this device and signing out others, deleted accounts; full password-reset flow including token hashing, single use and signing out every session |
| `account.test.ts` | profile update never returns the hash; e-mail conflicts; change password; admin-only routes (401/403/200); page-size cap; admin self-delete/self-demote guards |
| `bookings.test.ts` | price and seat maths; **concurrent overselling**; validation; departed tours; owner/admin/stranger access; cancelling keeps the booking as `cancelled` history with who/when/why and releases the seats; a second (or concurrent) cancel is 409 and releases nothing; 3-day rule vs admin; reason length; `/booking/my?view=` upcoming/past/cancelled; admin list, status filter and confirm; stats leave cancellations out |
| `bookingStatus.test.ts` | the transition table; pending → confirmed → completed → refunded with a history row per step (who, note); a disallowed move is 409 with the allowed next states; cancelling via status releases seats exactly once under concurrency; admin only; `next_statuses` in the admin list; finished tours complete confirmed bookings automatically (not pending ones) and revenue splits into completed and booked |
| `bookingEmails.test.ts` | "booking received" e-mail with reference, total, link and escaped name; confirmed and company-cancelled e-mails (escaped reason); customer-cancelled wording; completion asks for a review; nothing to example.com; a failing e-mail never fails the booking |
| `reviews.test.ts` | no booking, a future confirmed booking or a cancelled booking → 403; a completed booking → one review, then 409; a confirmed booking whose tour has ended counts; the eligibility endpoint for each case, sign-in and 404 |
| `demo.test.ts` | demo accounts: off unless `DEMO_MODE`; unknown role 400, missing account 503; the demo customer signs in without a password, may book and favourite, can't edit the account or password (403 with a clear message); refreshed tokens stay demo tokens; the demo admin is read-only and gets other users' e-mails and names masked; bookings older than 24 h are removed and seats released on the next demo sign-in; `maskPersonalData` masks contact messages but not status messages |
| `content.test.ts` | catalogue pagination and image URLs; id/limit validation; literal `%` search; JSON 404; security headers; real vs fake image uploads; cover-image ownership; date order; reviews (range, duplicate, owner delete); favourites; contact e-mail HTML escaping; admin stats; newsletter double-confirm |

Run one file: `npx vitest run tests/bookings.test.ts` (inside `backend/`).

## Frontend — `frontend/src/test` (Vitest + jsdom + Testing Library, 78 tests)

| File | Covers |
|---|---|
| `schemas.test.ts` | sign-up password policy (mirrors the API), confirm/terms, "required" messages, review rating, URL page parsing |
| `axios.test.ts` | concurrent 401s trigger **one** cookie refresh (no token in the body) and are retried; after a reload the token is fetched before the first request; a rejected session signs out without looping, a network error does not; no token ever reaches `localStorage`; `signOut` calls `/auth/logout` and signs out locally even offline |
| `components.test.tsx` | Pagination accessibility and edge states; `SmartImage` fallback; `StarRating` radio-group semantics |
| `forms.test.tsx` | sign-in and sign-up (validation, payloads, server and network errors), contact form, ReviewForm (stars, text, links rejected, signed-out redirect), PasswordChangeForm (cancel, mismatch, payload, keeps the input when the server rejects it) |
| `booking.test.tsx` | tour page booking box: total follows the guest count, the seat limit shows inline and disables Book, payload, API errors, signed-out redirect, departed and sold-out tours, tour not found |
| `booking-history.test.tsx` | My Bookings tabs ask the API for each view and show cancelled bookings with their date; a cancelled booking's details explain who cancelled and why, with no cancel button; cancelling sends the optional reason and opens the Cancelled tab |
| `review-gate.test.tsx` | the tour page shows the review form only when eligible; explanations for signed-out, not travelled and already reviewed; nothing for admins; completed bookings get a "Write a review" link |
| `admin.test.tsx` | `AdminRoute` / `ProtectedRoute` / `UnprotectedRoute` for visitor, customer and admin; admin Users page (rows, empty, error, delete only after confirming); admin Bookings page (Manage dialog offers only the allowed next states and sends the note, final bookings show history only, refused changes show the server's message, status filter, who cancelled and why) |
| `profile.test.tsx` | dashboard "Booked on" and My Reviews dates, using the API's real field names (`booking_date`, `createdAt`) |
| `errors.test.tsx` | a crashing page shows the recovery screen; unknown URLs show the 404 page; stale-chunk errors after a deploy are recognised; `AppErrorBoundary` catches errors outside the router |

`utils.tsx` holds the shared helpers: `mockApi` (answers every axios request and records it), `renderWithProviders` (fresh QueryClient, memory router, toasts) and `signInAs`.

## End-to-end — `e2e/` (Playwright, 20 tests)

The real app in a real browser (Chromium): the Vite dev server, the API and the local docker PostgreSQL + Mailpit. **Local stack only.** Nothing in `e2e/` knows a production URL.

### Run

```bash
npm install                                   # once: installs the e2e workspace
npx -w e2e playwright install chromium        # once per Playwright version
npm run db:up                                 # PostgreSQL + Mailpit must be running
npm run test:e2e
```

Useful variants (inside `e2e/`): `npx playwright test --ui`, `npx playwright test tests/booking.spec.ts`, `npx playwright test --headed`. Failed tests keep a trace and a screenshot in `e2e/test-results/`; open a trace with `npx playwright show-trace <path>/trace.zip`.

### What a run does

`e2e/playwright.config.ts` starts two servers through `webServer`, on their own ports so a normal `npm run dev` (3000/5173) can keep running:

| Server | Command | URL |
|---|---|---|
| api | `bash e2e/scripts/prepare-db.sh && npm run dev:backend` | http://localhost:3100 |
| web | `npm run dev -w frontend -- --port 5180 --strictPort` (proxying `/api` to 3100) | http://localhost:5180 |

`e2e/scripts/prepare-db.sh` runs before the API starts, on every run:
1. creates the database `wanderluxe_e2e` in the docker PostgreSQL if it is missing;
2. resets it and imports `database/schema/baseline.sql` (no personal data), then runs the migrations;
3. runs `backend/scripts/create-dev-users.ts`, which creates `admin@wanderluxe.local` and `customer@wanderluxe.local` with e2e-only passwords (`e2e/support/env.ts`).

It refuses a database name that doesn't end in `_e2e`, a non-local `DB_HOST`, or a set `DATABASE_URL`/`DB_MIGRATION_URL`. The API's environment comes from `apiEnv` in `e2e/support/env.ts`, which overrides `backend/.env`. It sets rate limiting off, Mailpit for SMTP, local uploads in a temp folder, and `APP_URL` pointing at the e2e frontend so e-mail links work. Servers are never reused: an already-running server could be connected to another database.

Each test creates the users and tours it needs through the API (`e2e/support/api.ts`), with unique names, so the tests run in parallel and don't depend on the catalogue. The baseline's own tours are in the past.

| File | Covers |
|---|---|
| `auth.spec.ts` | sign-up form → sign-in form → profile dashboard greets the user; the navbar user menu → Account Settings shows their name and e-mail. Session: no token in `localStorage` or `document.cookie`, the `wl_session` cookie is httpOnly/Strict/`/api/auth`; a reload keeps the user signed in; Sign Out removes the cookie and the server rejects a copy of it; profile pages then redirect to sign-in |
| `booking.spec.ts` | book 3 seats on a future tour (seats 8 → 5) → "booking received" e-mail in Mailpit → listed in My Bookings → details → confirm dialog ("Keep booking" first, then "Cancel booking" with a reason) → the booking is under *Cancelled* with its date and reason, *Upcoming* is empty, a cancellation e-mail arrives, seats back to 8 in the UI and the API |
| `review.spec.ts` | an admin confirms and then completes a booking in the Manage dialog (e-mails for both, history with the note) → the customer finds it under *Past*, follows "Write a review" and posts one; a customer who has not travelled sees "Reviews open after your trip" and a visitor sees a sign-in note |
| `departed-tour.spec.ts` | a tour that started 10 days ago shows a disabled "Unavailable" button, a disabled guest field and the "already departed" status |
| `admin.spec.ts` | admin signs in → user menu → Admin Panel; every dashboard metric shows a number → edits a tour's start/end dates → API returns the new dates, public page shows the new duration |
| `demo.spec.ts` | *Try as customer* → profile with the demo banner → saving Account Info is refused with the demo message; *Try as admin* → admin dashboard, read-only banner, customer e-mails masked on the Users page |
| `quality.spec.ts` | for nine public pages and a tour page: the page title, a meta description, exactly one `h1`, headings that never skip a level, and no axe-core violations at WCAG 2.1 A/AA. Keeps the Lighthouse accessibility/SEO scores from slipping without depending on network speed |
| `password-reset.spec.ts` | "Forgot password?" → e-mail read from Mailpit's API (`/api/v1/messages`) → link opens the e2e frontend → new password → sign-in works; the old password and a second use of the link are rejected |

### Settings

| Variable | Default | |
|---|---|---|
| `E2E_API_PORT` / `E2E_WEB_PORT` | 3100 / 5180 | if those ports are taken |
| `E2E_DB_NAME` | `<POSTGRES_DB>_e2e` | must end in `_e2e` |
| `E2E_DB_IMPORT_FILE` | `database/schema/baseline.sql` | e.g. `database/dump/wanderluxe.sql` to run against the private dump |
| `MAILPIT_UI_PORT` / `MAILPIT_SMTP_PORT` | 8025 / 1025 | match the root `.env` if you changed them |
| `E2E_API_LOG_LEVEL` | warn | `info`/`debug` to see API requests in the output |

`npm run db:prepare -w e2e` rebuilds the e2e database on its own, for example to look at it with `database/scripts/db.sh psql --db wanderluxe_e2e`.

Mailpit is shared with `npm run dev`. The tests only read messages sent to their own unique `@e2e.test` addresses, so other mail in the inbox doesn't matter.
## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every pull request and on every push to `main`. A newer push to the same branch cancels the run already in progress. Pushes to `main` deploy to Render and Vercel automatically, so CI is the check that a change still passes before it ships.

1. Installs with `npm ci` on the Node version in `.nvmrc`, using a cached npm download directory.
2. Starts a `postgres:17-alpine` service container, the same image as `docker-compose.yml`.
3. Runs `database/docker/initdb/01-roles.sh` inside that container, so CI gets the same owner role, least-privilege `wanderluxe_app` role, `wanderluxe_test` database and grants as local Docker.
4. Writes a CI-only `backend/.env` with a random app-role password and random JWT secrets. Migrations use the owner role. The API uses the app role.
5. Runs `npm run check`. `tests/globalSetup.ts` then rebuilds `wanderluxe_test` from the baseline and migrations, exactly as it does locally.

CI needs no repository secrets. The Vercel API-URL guard in `frontend/vite.config.ts` only applies when `VERCEL` is set, so it does not run in CI. If CI fails but `npm run check` passes locally, check whether a migration or test relies on data that exists only in your local database.

A second job, **End-to-end (Playwright)**, runs the browser suite on the same stack as locally:
1. `npm run setup` writes `.env` files with random local passwords.
2. `npm run db:up` starts docker compose (PostgreSQL + Mailpit).
3. Playwright installs Chromium.
4. `npm run test:e2e` runs the suite. On failure the HTML report and traces are uploaded as the `playwright-report` artifact (kept 7 days).

Render deploys only once both jobs pass.

### Lighthouse

Performance is measured by hand, because it depends on the network and on the image host. To run it:
- build: `npm run build -w frontend`;
- serve: `npx vite preview` in `frontend/`, with the API running;
- audit: `npx lighthouse@13 http://localhost:4173/tours`.

Results on 2026-11-18, mobile profile:
- accessibility, best practices and SEO are 100 on every main page;
- the home page's largest paint halved after the hero image was resized;
- the tours and destinations pages are slowed mainly by full-size photos from Supabase Storage (see docs/FEATURE_PLANS.md).

## Adding tests

- **API.** Use `createUser('admin' | 'customer')` and `createTour(adminAuth, {...})` from `tests/helpers.ts`. Create the data each test needs rather than relying on rows from other tests.
- **UI.** Query by role and accessible name (`getByRole('button', { name: … })`). If a control can't be found that way, users of assistive technology can't find it either.
- **E2E.** Create data with `signUp`, `signIn` and `createTour` from `e2e/support/api.ts`; read e-mail with `waitForEmail` from `e2e/support/mailpit.ts`. Use `getByRole`/`getByLabel`; a form label needs `htmlFor` pointing at its input's `id`.

## Still checked by hand

These were exercised by hand against the local stack on 2026-11-17 and have no e2e test yet:
- home page
- admin users and messages pages
- a 375 px mobile layout check

Booking, cancellation with the confirm dialog, the departed-tour state, the admin dashboard and tour editor, and password reset are now covered by `e2e/`.

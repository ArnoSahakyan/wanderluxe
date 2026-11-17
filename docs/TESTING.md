# Testing

```bash
npm run db:up    # PostgreSQL must be running for the API tests
npm test         # both workspaces
npm run check    # lint + typecheck + tests + production builds
```

## Backend — `backend/tests` (Vitest + Supertest, 37 tests)

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
| `auth.test.ts` | sign-up validation and case-insensitive duplicates; sign-in without data leaks or enumeration; `/me`; refresh (valid, garbage, access-token-as-refresh); full password-reset flow including token hashing, single use and refresh-token revocation |
| `account.test.ts` | profile update never returns the hash; e-mail conflicts; change password; admin-only routes (401/403/200); page-size cap; admin self-delete/self-demote guards |
| `bookings.test.ts` | price and seat maths; **concurrent overselling**; validation; departed tours; owner/admin/stranger access; cancellation rules (3-day rule vs admin); admin list and confirm |
| `content.test.ts` | catalogue pagination and image URLs; id/limit validation; literal `%` search; JSON 404; security headers; real vs fake image uploads; cover-image ownership; date order; reviews (range, duplicate, owner delete); favourites; contact e-mail HTML escaping; admin stats; newsletter double-confirm |

Run one file: `npx vitest run tests/bookings.test.ts` (inside `backend/`).

## Frontend — `frontend/src/test` (Vitest + jsdom + Testing Library, 16 tests)

| File | Covers |
|---|---|
| `schemas.test.ts` | sign-up password policy (mirrors the API), confirm/terms, "required" messages, review rating, URL page parsing |
| `axios.test.ts` | concurrent 401s trigger **one** refresh and are retried; rejected refresh logs out without looping |
| `components.test.tsx` | Pagination accessibility and edge states; `SmartImage` fallback; `StarRating` radio-group semantics |

## Adding tests

- **API.** Use `createUser('admin' | 'customer')` and `createTour(adminAuth, {...})` from `tests/helpers.ts`. Create the data each test needs rather than relying on rows from other tests.
- **UI.** Query by role and accessible name (`getByRole('button', { name: … })`). If a control can't be found that way, users of assistive technology can't find it either.

## Not covered by automated tests (checked manually in the browser)

These were exercised by hand against the local stack on 2026-11-17:
- home page
- tour details: departed-tour state and booking
- profile bookings
- cancellation with the confirm dialog
- admin dashboard, users, messages and tour editor
- a 375 px mobile layout check

End-to-end browser tests (e.g. Playwright) are a recommended next step.

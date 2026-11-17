# WanderLuxe — Security Audit

_Audit date: 2026-11-17. Scope: Express API, PostgreSQL access, React SPA, configuration and repository history._

Severity follows a simple scale:
- **Critical**: directly exploitable, high impact.
- **High**: exploitable, meaningful impact.
- **Medium**: needs specific conditions, or has limited impact.
- **Low**: hardening or defence in depth.

The **Status** column says what was done. "Fixed" items are covered by the backend test-suite where marked ✅T.

## Findings

| ID | Severity | Area | Finding | Status |
|---|---|---|---|---|
| S-01 | **High** | Data exposure | `PUT /account/info` and `PATCH /account/:id/role` return the whole Sequelize user, **including the bcrypt password hash and the reset token**. The SPA then stores that object in `localStorage`. | Fixed ✅T. Users are serialised through an allow-list (`toPublicUser`). |
| S-02 | **High** | Broken authorization | `GET /booking/:id` decides "admin" from the **booking owner's** role, not the requester's. Admins get 403 on other users' bookings. An admin who owns a booking would expose the `user` block to anyone, but ownership is still checked, so this is a logic flaw rather than an IDOR. | Fixed ✅T. Uses the requester's role from the verified JWT. |
| S-03 | **High** | Authentication | Password-reset tokens are stored **in plaintext**. Anyone with DB read access (backup, SQL console, a future injection bug) can take over accounts. Tokens also stay valid after the password changes. | Fixed ✅T. Only a SHA-256 hash is stored, the token is single-use, and it is cleared on use. |
| S-04 | **High** | Session management | Access and refresh tokens both live 1 h, so the "refresh" token adds no value. A refresh token can't be invalidated: after a password change or reset, old refresh tokens keep working, and a deleted user's refresh token returned a 500. | Fixed ✅T. Access 15 min, refresh 7 days (configurable). Refresh tokens are rejected if issued before `password_changed_at`. Invalid or expired refresh token → 401. |
| S-05 | **Medium** | Brute force | No rate limiting on sign-in, sign-up, password reset, contact or newsletter endpoints. | Fixed. `express-rate-limit` on auth and form endpoints (20 and 10 requests per 15 min per IP, configurable). Disabled in the test-suite; verified manually: the 21st sign-in attempt gets `429` with `RateLimit`/`Retry-After` headers. |
| S-06 | **Medium** | Account enumeration | `POST /auth/request-password-reset` answers 404 for unknown e-mails. | Fixed ✅T. Always returns the same 200 message. |
| S-07 | **Medium** | Injection (HTML e-mail) | The contact form inserts `full_name`, `email`, `phone_number` and `message` unescaped into the admin notification e-mail. This allows HTML/link injection and phishing via the brand's own mailbox. | Fixed ✅T. All values are HTML-escaped. |
| S-08 | **Medium** | Input validation / DoS | No server-side validation. Pagination `limit` is unbounded (`?limit=1000000`), `/search` has no limit at all, and non-numeric ids/pages cause 500s. Review `rating` isn't range-checked. Booking `number_of_people` accepts strings and decimals. | Fixed ✅T. zod schemas on every route, `limit` capped at 100, numeric coercion, 400 responses. |
| S-09 | **Medium** | Business logic / race | Booking creation reads `available_spots`, then writes it without a transaction or lock, so concurrent bookings can oversell. Bookings were also accepted for tours that had already started. | Fixed ✅T. Atomic conditional `UPDATE … WHERE available_spots >= n` inside a transaction, plus a started-tour check. A DB `CHECK (available_spots >= 0)` is the last line of defence. |
| S-10 | **Medium** | Missing security headers | No Helmet. `X-Powered-By: Express` is exposed. | Fixed ✅T. `helmet()` with an API-appropriate config. |
| S-11 | **Medium** | Client-trusted identity | `GET /tours/:id?user_id=` trusts a client-supplied user id to compute `hasReviewed`. | Fixed. The token (optional auth) is used. The query parameter is still accepted only as a fallback, because the value it reveals is already public. |
| S-12 | **Medium** | Integrity | `PATCH /tours/cover` didn't check that the image belongs to the tour, so it could leave a tour with no cover and another with two. | Fixed ✅T. Ownership check + transaction + DB partial unique index. |
| S-13 | **Low** | Error handling | JWT, multer and Sequelize errors (unique, FK, validation) became generic 500s. Body-parser errors used Express defaults. | Fixed ✅T (401/400/409 paths). Mapped to 400/401/409/413. Stack traces are never sent. |
| S-14 | **Low** | CORS | Only a single origin was supported, and the value doubled as the e-mail link base. | Fixed. `CORS_ORIGIN` takes a comma-separated allow-list, and `APP_URL` is separate. |
| S-15 | **Low** | Password storage | bcrypt cost 10, and no server-side password policy (only the client enforced one). | Fixed. Cost 12 for new hashes (old hashes still verify). Server enforces 8–128 characters with upper, lower, digit and symbol, matching the client rules. |
| S-16 | **Low** | Upload hardening | Image MIME type was taken from the client header. Destination/blog storage paths were built from free-text names. | Fixed. Images must decode with sharp (rejects spoofed files). Path segments are slugified. multer upgraded to 2.x (fixes CVE-2025-47935/47944 DoS). |
| S-17 | **Low** | Least privilege (DB) | The production app connects as a single DB user of unknown privilege. | Fixed locally: the app uses `wanderluxe_app` (DML only, no DDL, no TRUNCATE), and migrations use the owner role. **Production: manual action required**, see FINAL_AUDIT_REPORT. |
| S-18 | **Low** | Self-lockout | An admin could delete or demote their own account. | Fixed ✅T. Blocked with 400. |
| S-19 | **Low** | Customer review deletion | The UI offers "delete my review", but the API was admin-only, so the 403 sent users to Home. | Fixed ✅T. Owner **or** admin may delete. |
| S-20 | **Info** | Token storage (SPA) | Access and refresh tokens are stored in `localStorage`, so any XSS would leak them. No XSS sinks were found (no `dangerouslySetInnerHTML`, and markdown is rendered without raw HTML). | Accepted for now. Moving the refresh token to an httpOnly cookie changes the API contract; it is listed as a recommendation. |
| S-21 | **Info** | Secrets hygiene | No secrets in either git history. `.env` files were ignored, but the frontend `.gitignore` had a malformed last line. | Fixed. One root `.gitignore` covers `.env*` (except examples) and backups. |
| S-22 | **Info** | Dev uploads to production | A developer running locally with the production `.env` would upload to and **delete from** the production Supabase buckets. | Fixed. `STORAGE_DRIVER=local` (default in development) writes to `backend/uploads/` and never deletes remote files. |
| S-23 | **Info** | Hard-coded recipient | The contact form recipient was hard-coded in source. | Moved to `CONTACT_RECIPIENT_EMAIL`. |

## Checked and not vulnerable

- **SQL injection:**
  - All queries go through Sequelize with bound parameters.
  - The few `Sequelize.literal` uses contain no user input.
  - `iLike` search terms are bound. `%`/`_` are now escaped, so wildcards are taken literally.
  - Express 5's default "simple" query parser means attackers cannot inject operator objects.
- **XSS (SPA):**
  - React escapes output.
  - react-markdown v10 runs without `rehype-raw`, and its default URL transform strips `javascript:` URLs.
- **IDOR:**
  - Bookings, favourites, reviews and the profile are all scoped to `req.user_id` from the verified JWT.
  - Admin routes are guarded server-side. Frontend guards are UX only.
- **CSRF:**
  - The API authenticates with a `Bearer` header, not cookies, so browsers do not attach credentials cross-site.
- **Path traversal:**
  - Storage keys are generated server-side (uuid + slug).
  - The local driver resolves paths inside its root and rejects anything outside it.
- **JWT:**
  - Access and refresh tokens use separate secrets.
  - The algorithm is pinned to HS256 on verification.
  - Startup refuses secrets shorter than 32 characters in production.

## Dependency audit

`npm audit` is run as part of the final verification. See FINAL_AUDIT_REPORT.md for the result at hand-over.

## Production follow-ups (cannot be done from this repository)

1. **Rotate secrets** if this `.env` was ever shared: JWT secrets, SMTP password, Supabase service-role key. Rotating the JWT secrets logs everyone out.
2. Create a least-privilege DB role in production, mirroring `database/docker/initdb/01-roles.sh`.
3. Apply the new migrations to production after taking a backup (see DATABASE_AUDIT.md §6).
4. Serve the API behind HTTPS and set `TRUST_PROXY` correctly, so rate limits use the client IP.

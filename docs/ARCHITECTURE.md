# Architecture

```
Browser ──► React SPA (Vite) ──/api──► Express API ──► PostgreSQL
                │                          │  └──────► Image storage (local disk | Supabase)
                │                          └─────────► SMTP (Mailpit locally)
                └── dev: Vite proxies /api and /uploads to :3000 (same origin, no CORS)
```

## Backend request lifecycle

```
helmet → cors (allow-list) → json/urlencoded (size-limited) → request log
  → /api router
      → [rate limiter]            auth & form endpoints only
      → verifyToken | optionalAuth  identity from the signed JWT only
      → isAdmin                     role from the JWT; never from the client
      → upload (multer, memory)     images: ≤10 × 5 MB, type-checked
      → validate({params,query,body})  zod: coerce, trim, strip unknown keys, 400 on failure
      → controller (asHandler)      business rules, Sequelize, transactions
  → notFoundHandler (JSON 404)
  → globalErrorHandler            AppError / multer / Sequelize / body-parser → {message}
```

- **Layers.** routes → middleware → controllers → Sequelize models.
  - The controllers are small, so a separate service/repository layer would only add indirection.
  - Logic that needs atomicity uses `sequelize.transaction()` inline: booking create/cancel, tour creation with images, cover swap, image deletion, newsletter confirmation.
- **Configuration.** `src/config/env.ts` is the only place that reads `process.env`. It validates every variable at start-up.
- **Errors.** Throw `NotFoundError`, `BadRequestError`, `ForbiddenError` or `AppError(status, msg)`. The client always receives `{ message }`; validation errors also include `errors: [{field, message}]`.
- **Storage.** `src/lib/storage.ts` provides `put`/`remove` with two drivers.
  - The DB stores only object keys. `toPublicImageUrl(key, bucket)` builds URLs.
  - Files are deleted only **after** the DB change commits (`removeQuietly`), so a storage outage can never leave a row without its file.
- **Logging.** `src/lib/logger.ts` writes levelled lines in development and JSON lines in production. Secrets are never logged.

## Authentication & authorization

| Step | Detail |
|---|---|
| Sign-in | `POST /auth/signin`. Case-insensitive e-mail lookup. bcrypt compare, with a dummy hash for unknown users so timing is constant. Returns `{token, user}` and sets the session cookie. |
| Access token | HS256 JWT `{user_id, role}`, 15 min, `JWT_ACCESS_SECRET` |
| Session cookie | `wl_session`: an opaque 256-bit random token, `HttpOnly; SameSite=Strict; Path=/api/auth` (+ `Secure` in production), 7 days sliding (`JWT_REFRESH_EXPIRES_IN`). Only its SHA-256 is stored, in `refresh_tokens` (`src/lib/sessions.ts`). |
| Refresh | `POST /auth/refresh` (no body). Rotates the token on every call and returns `{token, user}`. A rotated token presented again more than 30 s later is treated as stolen and revokes the whole session; within 30 s (two tabs refreshing together) it just gets an access token. |
| Logout & revocation | `POST /auth/logout` revokes this browser's session and clears the cookie. A password reset or an admin deleting the account revokes every session; a password change revokes the others and starts a new one for the current browser. |
| Same origin | The browser only talks to its own origin: `/api` is proxied by Vite in development and forwarded to Render by the rewrite in `frontend/vercel.json` in production. That keeps the cookie first-party, so `SameSite=Strict` blocks cross-site use (CSRF) and no CORS is involved. |
| Password reset | 256-bit random token e-mailed to the user. Only its SHA-256 is stored. Valid 1 h, single use. Same response whether or not the e-mail exists. |
| Authorization | `isAdmin` for admin routes. Resource ownership is checked in controllers (bookings, reviews, favourites) against `req.user_id` from the token. |
| SPA | The access token is kept in memory only; `localStorage` holds just the profile and a signed-in flag for the first paint. After a reload the first API call (or `useRehydrateAuth`) exchanges the cookie for a new access token. The axios interceptor refreshes once on 401: a single in-flight refresh, sent through a client without the interceptor. A rejected session signs the user out and clears the query cache; a network error does not. Sign-out calls `/auth/logout` first. Route guards are UX only; the API enforces everything. |

## Frontend structure

| Folder | Responsibility |
|---|---|
| `api/` | one module per resource; `public_api` (no token) and `api` (token + refresh) |
| `queries/` | React Query key factories, used for targeted invalidation |
| `hooks/` | `useQuery`/`useMutation` wrappers with toasts and invalidation |
| `store/` | zustand: auth (persisted), theme |
| `router/` | `createBrowserRouter`, lazy pages, `ProtectedRoute`, `AdminRoute`, `UnprotectedRoute` |
| `pages/`, `admin/` | screens; `components/` shared UI (cards, modals, states, pagination, `SmartImage`) |
| `shared/` | types, zod schemas (mirroring the API rules), constants |
| `lib/queryClient.ts` | shared client: no retries on 4xx, no refetch on focus |

Styling is Tailwind CSS 4, configured in CSS (there is no `tailwind.config.ts`), loaded through the `@tailwindcss/vite` plugin:
- Design tokens live in the `@theme` block of `src/index.css`. Colours are `primary`, `secondary`, `accent`, `background` and `text`, each in a light and dark shade (`bg-primary-light`, `dark:bg-primary-dark`, …).
- Shared component classes are `@utility` blocks in the same file: `form-input`, `form-button`, `btn-icon-primary`, etc.
- Dark mode is class-based (`@custom-variant dark`), toggled on `<html>` by `store/themeStore.ts`.
- Opacity uses the modifier form (`bg-primary-light/90`). The v3 `bg-opacity-*` utilities no longer exist.
- `space-y-*` puts its margin on the *previous* sibling in v4, so a child's own `mt-*` now adds to it rather than being replaced. Avoid putting `mt-*` on direct children of `space-y-*`.

Light-mode tokens meet WCAG AA contrast.

## Data model (summary)

```
roles 1─* users 1─* bookings *─1 tours *─1 destinations
                 1─* favorites *─1 tours *─1 categories
                 1─* reviews   *─1 tours 1─* tour_images (exactly one is_cover)
posts · newsletter_subscribers · newsletter_verifications · contacts (standalone)
```

See [DATABASE_AUDIT.md](../DATABASE_AUDIT.md) for constraints and indexes.

## Conventions

- **Language.** TypeScript strict on both sides. Request types are derived from the zod validators (`z.infer`).
- **API contract.** Paths, methods and response shapes are those of the original API (PROJECT_AUDIT.md §4). Additive fields are fine; renames or removals need a migration plan for the SPA.
- **Schema changes.** Only through a new migration in `backend/src/db/migrations`. Never edit `database/dump/*` or `baseline.sql` by hand.

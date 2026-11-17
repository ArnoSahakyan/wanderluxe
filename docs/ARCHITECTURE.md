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
| Sign-in | `POST /auth/signin`. Case-insensitive e-mail lookup. bcrypt compare, with a dummy hash for unknown users so timing is constant. Returns `{token, refreshToken, user}`. |
| Access token | HS256 JWT `{user_id, role}`, 15 min, `JWT_ACCESS_SECRET` |
| Refresh token | HS256 JWT `{user_id}`, 7 days, separate `JWT_REFRESH_SECRET`. Rejected if issued before `users.password_changed_at`, so every session ends after a password change or reset. |
| Password reset | 256-bit random token e-mailed to the user. Only its SHA-256 is stored. Valid 1 h, single use. Same response whether or not the e-mail exists. |
| Authorization | `isAdmin` for admin routes. Resource ownership is checked in controllers (bookings, reviews, favourites) against `req.user_id` from the token. |
| SPA | Tokens are stored in `localStorage` (zustand persist). The axios interceptor refreshes once on 401: a single in-flight refresh, sent through a client without the interceptor. If that fails, the user is logged out and the query cache is cleared. Route guards are UX only; the API enforces everything. |

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

Styling is Tailwind with design tokens in `tailwind.config.ts`:
- Colours: `primary`, `secondary`, `accent`, `background`, `text`, each in light/dark.
- Shared component classes in `src/index.css`: `form-input`, `form-button`, `btn-icon-primary`, etc.

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

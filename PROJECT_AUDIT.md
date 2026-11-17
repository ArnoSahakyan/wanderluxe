# WanderLuxe — Project Audit (Stage 1: Discovery)

_Audit date: 2026-11-17. This was written **before** any application code was changed. For what was fixed afterwards, see [FINAL_AUDIT_REPORT.md](FINAL_AUDIT_REPORT.md)._

WanderLuxe is a travel-agency web app. Visitors browse destinations, tours and blog posts. Signed-in customers book tours, keep favourites and write reviews. Admins manage the catalogue, users, bookings, reviews, blog posts, newsletter subscribers and contact messages.

## 1. Repository layout (as found)

```
wanderluxe/                    (not a git repository)
├── travel-back/   git repo — Express API          34 commits, branch main, remote github:ArnoSahakyan/travel-back
├── travel-front/  git repo — React SPA            81 commits, branch main, remote github:ArnoSahakyan/travel-front
├── wanderluxe.sql plain-SQL dump of the production schema + data
└── .idea/         JetBrains workspace files
```

- Both working trees were clean, with no stashes and no tags.
- Every remote branch was already merged into `main`:
  - backend: `dev`, `development`, `sequelize-cli-setup`
  - frontend: `admin-panel`, `blogs-fix`, `bookings-improvement`, `dev`, `match-backend-changes`, `search`
- No `.env` or other secret file was ever committed in either history. The only tracked env file is `travel-front/.env.example`.

## 2. Technology inventory

| Area | Found |
|---|---|
| Language | **TypeScript** in both apps (strict mode). No JS→TS migration is needed. |
| Frontend | React 19, Vite 6.3, React Router 7 (data router), TanStack Query 5, Zustand 5 (auth + theme, persisted to localStorage), react-hook-form + zod, Tailwind CSS 3.4 (+ typography), Headless UI, Heroicons, react-toastify, Swiper, react-markdown, react-markdown-editor-lite, react-photo-view |
| Backend | Node (ESM) + Express 5.1, Sequelize 6 (no `sequelize-typescript` decorators are used, even though it is installed), `pg`, jsonwebtoken, bcrypt, multer 1.x (memory storage), sharp, nodemailer, `@supabase/supabase-js` (image storage) |
| Database | PostgreSQL. The dump uses `int4` + `nextval` (SERIAL-style), `timestamptz` throughout, `numeric(10,2)` for money, and one ENUM type. No views, functions, triggers or extensions. |
| Runtime | No `engines` / `.nvmrc`. Backend `start` script runs `tsx dist/index.js`. |
| Package manager | backend: yarn (`yarn.lock`). frontend: **both** `yarn.lock` and `package-lock.json`. |
| Tests | **None** in either project. |
| Lint/format | frontend: ESLint 9 flat config + Prettier. backend: none. |
| Deployment hints | frontend `vercel.json` (SPA rewrite), sitemap plugin for `wanderluxe.am`. Backend: none. |
| Docs | Two READMEs (backend README partly outdated, e.g. describes `npm run seed`). |

## 3. Backend architecture

```
src/index.ts          connects Sequelize, starts the server
src/app.ts            cors → json → urlencoded → /api routes → error handler
src/routes/*.ts       13 routers; asHandler() wraps async handlers
src/controllers/*.ts  all logic (validation, DB access, storage, e-mail)
src/middlewares/      verifyToken, isAdmin, optionalAuth, multer upload, error handler
src/db/models/        13 Sequelize models + associations
src/db/migrations/    13 sequelize-cli migrations (.cjs)
src/db/seeders/       12 seeders (.cjs)
src/utils/            JWT generation, Supabase client + image pipeline, mailer, slug, AppError classes
src/emails/           3 HTML e-mail templates
```

What works well:
- The routes / controllers / models split is clear.
- Typed requests are used throughout.
- There is a central `AppError` hierarchy and one global error handler.
- Sequelize uses parameterised queries everywhere, and the only raw SQL literals are static.

Weaknesses:
- No configuration module. `dotenv.config()` is called in 6 files, and there is no check that required variables are set.
- No request validation layer. Query params are typed as `number` but arrive as strings, and pagination `limit` is unbounded.
- No security headers or rate limiting, and request size limits are left at defaults.
- Multi-step writes (booking + seat count, cover-image swap) have no transactions.
- Logging is unstructured `console.*`.
- The sequelize-cli config file is git-ignored and missing, so **migrations cannot run** from a fresh clone.
- Unused or misplaced dependencies:
  - Unused: `bcryptjs`, `body-parser`, `nodemon`, `ts-node`, `sequelize-typescript`, `sequelize-auto`.
  - In `dependencies` instead of `devDependencies`: `typescript`, `@types/node`.

## 4. API inventory

All routes are mounted under `/api`. Auth levels: **P** = public, **U** = valid access token, **A** = admin role, **O** = optional token.

| Method | Path | Auth | Request | Response | Notes |
|---|---|---|---|---|---|
| POST | /auth/signup | P | `{full_name,email,password,phone_number?}` | 201 `{message}` | role hard-coded to id 2 |
| POST | /auth/signin | P | `{email,password}` | `{token,refreshToken,user{user_id,full_name,email,role}}` | |
| POST | /auth/refresh | P | `{refreshToken}` | `{token}` | invalid token → 500 |
| POST | /auth/request-password-reset | P | `{email}` | `{message}` | 404 reveals unknown e-mails |
| POST | /auth/reset-password?token= | P | `{new_password}` | `{message}` | |
| GET | /auth/me | U | – | `{user{user_id,full_name,email,phone,role}}` | |
| PUT | /account/info | U | `{full_name,email,phone_number?}` | `{message,user}` | **returns password hash** |
| PUT | /account/password | U | `{current_password,new_password}` | `{message}` | |
| GET | /account/stats | U | – | `{stats{…,rank},recentBookings}` | |
| GET | /account | A | `?page&limit` | `{total,page,totalPages,users}` | |
| GET / PUT / DELETE | /account/:user_id | A | PUT `{full_name,email,phone_number,role_id}` | user / `{message,user}` / `{message}` | |
| PATCH | /account/:user_id/role | A | `{role_id}` | `{message,user}` | returns password hash; unused by UI |
| GET | /blog, /blog/:slug | O | `?page&limit&search` | `{total,currentPage,totalPages,posts}` / post | drafts only visible to admins |
| POST | /blog | A | multipart `images`, title, slug?, excerpt, content, is_published | post | |
| PUT | /blog/:slug | A | multipart | post | returns `null` if the slug changes |
| DELETE | /blog/:id | A | – | `{message}` | |
| GET | /booking/my | U | `?page&limit` | `{total,page,totalPages,bookings[]}` (flattened) | |
| GET | /booking | A | `?page&limit` | `{…,bookings}` (nested) | |
| GET | /booking/:booking_id | U | – | flattened booking | **admin check uses the booking owner's role** |
| POST | /booking | U | `{tour_id,number_of_people}` | 201 booking | race on seat count; can book past tours |
| DELETE | /booking/:booking_id | U (owner/admin) | – | `{message}` | rule: customers ≥ 3 days before start |
| PATCH | /booking/:booking_id/confirm | A | – | `{message,booking}` | |
| GET / POST | /categories | A | `{name}` | list / category | |
| GET | /categories/:id | P | – | category | |
| PUT / DELETE | /categories/:id | A | `{name}` | category / `{message}` | |
| POST | /contact | P | `{full_name,email,phone_number,message}` | `{message}` | **table missing in DB**; HTML injection into e-mail |
| GET / GET:id / PUT :id/status / DELETE | /contact… | A | `{status}` | | |
| GET | /destinations, /destinations/:id | P | `?page&limit&search` | `{total,currentPage,totalPages,destinations}` | |
| POST / PUT / DELETE | /destinations[/:id] | A | multipart | | |
| GET | /favorite | U | `?page&limit` | `{…,favorites}` | |
| POST | /favorite | U | `{tour_id}` | 201 | |
| GET | /favorite/check/:tour_id | O | – | `{inFavorites}` | |
| DELETE | /favorite/:tour_id | U | – | `{message}` | |
| POST | /newsletter/subscribe | P | `{email}` | `{message}` | |
| GET | /newsletter/verify?token | P | – | `{message}` | |
| POST | /newsletter/unsubscribe[?email] | U (A for `?email`) | – | `{message}` | |
| GET | /newsletter/is-subscribed | U | – | `{subscribed}` | |
| GET | /newsletter/all | A | `?page&limit` | `{…,subscribers}` | |
| GET | /review | P | `?page&limit` | `{…,reviews}` | random order |
| GET | /review/tour/:tour_id | P | `?page&limit` | `{…,reviews}` | |
| GET | /review/my | U | `?page&limit` | `{…,reviews}` | |
| POST | /review | U | `{tour_id,rating,comment?}` | 201 | rating range not validated |
| DELETE | /review/:review_id | **A** | – | `{message}` | **the UI lets customers delete their own reviews → 403** |
| GET | /search | P | `?query&limit` | `{destinations,tours,posts}` | no default limit |
| GET | /stats | A | – | `{metrics,recentBookings}` | |
| GET | /tours | P | `?page&limit&category_id&destination_id&search` | `{total,currentPage,totalPages,tours}` | |
| GET | /tours/:id | P | `?user_id` | tour + `hasReviewed` | trusts client-supplied `user_id` |
| POST | /tours | A | multipart | 201 tour | |
| PUT / DELETE | /tours/:id | A | JSON | | |
| POST | /tours/:tour_id/images | A | multipart | 201 images | max 10 per tour |
| GET | /tours/:tour_id/images | P | – | images | |
| PATCH | /tours/cover | A | `{tour_id,image_id}` | `{message}` | does not check the image belongs to the tour |
| DELETE | /tours/:tour_id/images/:image_id | A | – | `{message}` | |

Frontend ↔ backend check: every frontend call maps to an existing route. There are two functional mismatches:
- Customers' review deletion is blocked by the admin-only `DELETE /review/:id`.
- The frontend reads `user.phone_number`, but `/auth/me` returns `phone`, so the profile phone field is always empty.

## 5. Frontend architecture

```
src/api/        axios clients (public_api, api with auth + refresh interceptor) and one module per resource
src/hooks/      React Query hooks per resource
src/store/      zustand auth store (persisted) and theme store
src/router/     createBrowserRouter: public Layout, ProtectedRoute (/profile/*), AdminRoute (/admin/*), UnprotectedRoute (/auth/*)
src/pages/      public and profile pages
src/admin/      admin layout and pages
src/components/ shared UI (Navbar, Footer, cards, modals, pagination, states)
src/shared/     types, zod schemas, constants
```

Main findings:

| Severity | Finding |
|---|---|
| High | Password hash from `PUT /account/info` is written into localStorage. The user object also loses `role`, so an admin is kicked out of `/admin` until they log in again. |
| High | The refresh call goes through the intercepted client. A 401 from `/auth/refresh` recurses, and parallel 401s each start their own refresh. Every 403 navigates to Home. |
| High | `useDeleteReview` reads `context.tour_id` with no `onMutate`, so it throws on success. |
| Medium | Logout doesn't clear the React Query cache, so the previous user's data can show for the next login in the same tab. |
| Medium | Wrong invalidation keys: a new review doesn't appear, and the favourites list goes stale. |
| Medium | The reviews modal shares the URL `?page` param with the page behind it. |
| Medium | Five admin pages fetch with `useEffect`/`useState`, with no cancellation and no error state. |
| Medium | Object-URL leaks in TourForm, BlogForm and DestinationForm. |
| Low | `output.css` is a stale Tailwind v4 build that nothing imports. `index.css` contains v4-only `@plugin`, a duplicated `.form-checkbox`, and `html{overflow:auto !important}`, which breaks the modal scroll lock. |
| Low | Gold body text `#D4A96A` on white (~2:1 contrast). Icon-only buttons have no accessible name. BlogForm labels aren't connected to their inputs. |
| Low | Unused dev dependencies: `eslint-plugin-vue`, `eslint-plugin-react`, `eslint-plugin-import`, `@types/react-router-dom` v5, the standalone `@typescript-eslint/*`. `clsx` is used but not declared. |

Positives:
- Consistent React Query hooks, zod schemas for every form, and Headless UI dialogs that handle focus trapping.
- No `dangerouslySetInnerHTML`, and react-markdown is used without raw HTML.
- Dark mode, and broad use of responsive classes.

## 6. Environment configuration (names only — values are production)

| File | Variables | Notes |
|---|---|---|
| travel-back/.env | `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `CORS`, `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `PORT`, `SMTP_HOST/PORT/SECURE/USER/PASS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLIC_URL`, `SUPABASE_BUCKET_TOURS/DESTINATIONS/BLOGS` | All production values. `CORS` doubles as the frontend URL in e-mail links. There's no `DB_PORT` or SSL option. |
| travel-front/.env | `VITE_BACK_BASE_URL`, `VITE_SUPABASE_STORAGE_URL` | Both are public values (safe in the client bundle). |

No backend secret is exposed through a `VITE_` variable.

## 7. Plan derived from this audit

1. Consolidate into one repository using a history-preserving subtree merge. Back up first. See [REPOSITORY_MIGRATION.md](REPOSITORY_MIGRATION.md).
2. Set up a local stack: Docker Compose PostgreSQL 17 + Mailpit, a least-privilege app DB role, a safe dump import, and reversible migrations for the database defects. See [DATABASE_AUDIT.md](DATABASE_AUDIT.md).
3. Backend:
   - central config and validation
   - security middleware
   - fixes for the vulnerabilities in [SECURITY_AUDIT.md](SECURITY_AUDIT.md)
   - transactions
   - a local storage driver, so development never writes to production Supabase
   - tests
4. Frontend:
   - fix the auth and refresh flow, cache invalidation and leaks
   - point the API at the local backend through the Vite proxy
   - CSS cleanup, accessibility and contrast fixes, lint fixes, tests
5. Keep TypeScript as it is, keep every route and response shape, and keep the business rules (3-day cancellation window, max 10 images per tour, rank thresholds, and so on).

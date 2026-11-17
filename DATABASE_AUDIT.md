# WanderLuxe — Database Audit

_Reference: `database/dump/wanderluxe.sql` (plain SQL, 13 tables). It was imported unchanged into PostgreSQL 17.11 to run every check below. The original dump is never modified. Its SHA-256 is kept in `.backup/wanderluxe.sql.sha256`._

## 1. Schema overview

| Table | PK | Notable columns | FKs (on delete) | Rows in dump |
|---|---|---|---|---|
| roles | role_id | name UNIQUE | – | 2 (admin, customer) |
| users | user_id | email UNIQUE, password (bcrypt), role_id, reset_password_token, reset_token_expires, deleted_at (soft delete) | role_id → roles (SET NULL) | 2 |
| destinations | destination_id | name, description, image (storage key) | – | 10 |
| categories | category_id | name | – | 7 |
| tours | tour_id | price numeric(10,2), start/end_date timestamptz, available_spots | category_id, destination_id (SET NULL) | 3 |
| tour_images | image_id | image_url (storage key), is_cover | tour_id (CASCADE) | 12 |
| bookings | booking_id | number_of_people, total_price numeric(10,2), status `enum_bookings_status` | user_id, tour_id (CASCADE) | 1 |
| favorites | favorite_id | – | user_id, tour_id (CASCADE) | 1 |
| reviews | review_id | rating int, comment | user_id, tour_id (CASCADE) | 0 |
| newsletter_subscribers | subscriber_id | email UNIQUE | – | 0 |
| newsletter_verifications | id | email, token UNIQUE, expires_at | – | 0 |
| posts | post_id | slug UNIQUE, is_published | – | 0 |
| SequelizeMeta | name | migration ledger | – | 13 |

How it is built:
- Identifiers are `int4` with sequence defaults (SERIAL style).
- All timestamps are `timestamptz`; the server and containers run in UTC.
- There are no views, materialized views, functions, triggers or extensions, and no JSON columns.
- Identifiers are quoted in the dump but are all lowercase, apart from `"SequelizeMeta"`.

## 2. Defects found

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| D-01 | **Critical** | **Sequences never advanced.** The dump inserts explicit ids but never calls `setval`, so every sequence would hand out `1` next. The first sign-up, booking, image upload, category, etc. would fail with a duplicate-key error. | All 12 sequences had `last_value = NULL` after import; `max(user_id) = 2`, `max(image_id) = 12`. |
| D-02 | **High** | **`contacts` table missing.** The `Contact` model, the contact form and the admin "messages" pages all use it, but neither the dump nor any migration creates it. The contact form and **`GET /api/stats` (admin dashboard) fail**. | `\dt` shows no `contacts`. No migration file mentions it. |
| D-03 | Medium | **Sequences not owned by their columns** (`OWNED BY` missing), so dropping a table leaves orphaned sequences. | `pg_depend` has no auto dependency. |
| D-04 | Medium | **No indexes on foreign-key columns.** Every "my bookings / favourites / reviews", per-tour review list, tour filter and cascade delete is a sequential scan. | Only PK and unique indexes exist. |
| D-05 | Medium | **No uniqueness for (user_id, tour_id)** in `favorites` or `reviews`. The app checks first and then inserts, so a race creates duplicates. | No such constraint. |
| D-06 | Medium | **No CHECK constraints.** `rating` 1–5, `number_of_people > 0`, `available_spots >= 0`, `price >= 0` and `end_date >= start_date` are not enforced anywhere. | – |
| D-07 | Low | **"Exactly one cover image per tour"** is enforced only in app code, and `PATCH /tours/cover` could break it. | – |
| D-08 | Low | E-mail uniqueness is case-sensitive, so `John@x.com` and `john@x.com` could both register. | `users_email_key` on `email`. |
| D-09 | Low | The reset-token lookup has no index. | – |
| D-10 | Low | `newsletter_verifications.email` isn't indexed, but it is looked up on every subscribe. | – |
| D-11 | Info | `bookings.status` enum includes `cancelled`/`refunded`, but the app **deletes** cancelled bookings. That is an existing business rule and is kept. | – |
| D-12 | Info | Tour dates in the dump are all in 2025, so they are in the past. Locally no tour is bookable until an admin creates a future one. | – |

Integrity checks run against the imported data:
- No orphaned bookings.
- No duplicate favourites.
- No case-insensitive duplicate e-mails.
- Every tour has exactly one cover image.
- No tour ends before it starts.
- Booking `total_price` matches `price × people`.

So every constraint below could be added **without changing any row**.

## 3. Backend ↔ schema compatibility

| Check | Result |
|---|---|
| Model ↔ table names and columns | Match for 12 of 13 models. `Contact` has no table (D-02). |
| `underscored: true` + `paranoid` on users | `deletedAt` → `deleted_at` ✔ |
| Timestamps | Models with `timestamps: true` match tables that have `created_at`/`updated_at`. Tables without them use `timestamps: false` ✔ |
| ENUM | `Booking.status` values match `enum_bookings_status` ✔ |
| Money | `numeric` comes back from `pg` as a string. Arithmetic in `createBooking` relied on implicit coercion; now explicit. |
| sequelize-cli | `.sequelizerc` pointed to a git-ignored, missing `config.cjs`, so migrations couldn't run. Now restored as an env-driven file with no secrets. |
| Seeders | Seeders insert without explicit ids, so they are fine on an empty DB. They duplicate the dump and must not be run on top of it. |
| Connection pool | Sequelize defaults (max 5). Now configurable (`DB_POOL_MAX`), with an idle timeout. Connections are released by Sequelize; there was no manual client checkout to leak. |
| Transactions | None were used. Now used for booking create/cancel, tour creation with images, cover swap, image deletion and newsletter verification. |
| N+1 | None found. Includes are eager. `GET /destinations` uses two correlated subqueries per row (count and min price), which is fine for this data size, and they are now backed by the `tours(destination_id)` index. |

## 4. Migrations added (all reversible, all idempotent, no data deleted)

| Migration | Purpose | Fixes |
|---|---|---|
| `20261117000001-create-contacts.cjs` | Creates `enum_contacts_status` and `contacts` exactly as the existing model defines them. | D-02 |
| `20261117000002-sync-sequences.cjs` | `setval(seq, max(id))` for every serial column, then `ALTER SEQUENCE … OWNED BY`. `down` removes the ownership only; sequence values are never moved backwards. | D-01, D-03 |
| `20261117000003-add-indexes.cjs` | FK indexes on bookings, favorites, reviews, tours and tour_images; partial index on `users(reset_password_token)`; `newsletter_verifications(email)`. | D-04, D-09, D-10 |
| `20261117000004-add-integrity-constraints.cjs` | Unique (user, tour) on favorites and reviews; CHECK constraints; partial unique "one cover per tour"; unique `lower(email)`. **Pre-flight:** counts violating rows first and aborts with a clear message rather than deleting anything. | D-05 – D-08 |
| `20261117000005-add-password-changed-at.cjs` | Nullable `users.password_changed_at timestamptz`, used to invalidate refresh tokens after a password change. | S-04 |

## 5. Index verification (EXPLAIN)

The dataset is tiny, so the planner prefers sequential scans regardless. Plans were checked with `SET enable_seqscan = off` to confirm the new indexes can be used. Plans after migration (`enable_seqscan = off`):

| Query | Plan |
|---|---|
| `bookings WHERE user_id = ? ORDER BY booking_date DESC LIMIT 10` | Index Scan using `bookings_booking_date_idx` (plus filter). With real data volume the planner will choose between this and `bookings_user_id_idx`. |
| `reviews WHERE tour_id = ? ORDER BY created_at DESC LIMIT 4` | Bitmap Index Scan on `reviews_tour_id_created_at_idx` |
| `count(*) FROM tours WHERE destination_id = ?` (destination list subquery) | Index Only Scan using `tours_destination_id_idx` |
| `users WHERE lower(email) = ?` (sign-in) | Index Scan using `users_email_lower_key` |
| `users WHERE reset_password_token = ?` | Index Scan using `users_reset_password_token_idx` |

Before the migration, every one of these was a sequential scan.

## 6. Applying these migrations to production (manual, not done here)

1. Take a backup: `pg_dump -Fc -f wanderluxe-$(date +%F).dump "$PROD_URL"`.
2. Run on a staging copy first: restore the backup, then `npm run db:migrate -w backend`.
3. Each constraint migration checks the data first and stops with a message if any rows would violate it. No row is ever changed or deleted automatically.
4. Run against production with the owner credentials (`DB_MIGRATION_URL`).
5. To roll back: `npx sequelize-cli db:migrate:undo` (one step at a time), or restore the backup from step 1.

# Database

## Files

| Path | Tracked | What |
|---|---|---|
| `dump/wanderluxe.sql` | **no** (git-ignored) | The supplied production dump: schema plus data, including real users' e-mails and bcrypt hashes. Never edited. Its checksum is in `.backup/wanderluxe.sql.sha256`. |
| `schema/baseline.sql` | yes | Generated from the dump **with the INSERTs for `users`, `bookings` and `favorites` removed**. Used by tests and by anyone without the private dump. |
| `docker/initdb/01-roles.sh` | yes | First-start init: least-privilege `wanderluxe_app` role and the `wanderluxe_test` database |
| `scripts/db.sh` | yes | `import`, `reset`, `psql` helper (used by the `npm run db:*` scripts) |

Putting the dump on a new machine: copy it to `database/dump/wanderluxe.sql`, then run `npm run db:import`.

> **Decision for the owner:** the dump is kept out of git because it contains personal data. If this repository stays private and you want the dump versioned anyway, remove the `database/dump/*.sql` line from `.gitignore`.

## Compatibility

- The dump is plain SQL with `CREATE SEQUENCE`/`CREATE TABLE`/`INSERT` statements and one ENUM, and no extensions.
- It imports cleanly into **PostgreSQL 17.11**, which is what docker compose uses. It is also compatible with 13+.
- `db.sh import` detects custom-format archives (`PGDMP` header) and uses `pg_restore` for them.

## Roles

| Role | Rights | Used by |
|---|---|---|
| `wanderluxe_owner` | owns schema objects (container superuser) | imports, migrations, test setup |
| `wanderluxe_app` | `CONNECT`; `SELECT/INSERT/UPDATE/DELETE` on tables; `USAGE/SELECT/UPDATE` on sequences, through default privileges. No DDL, no `TRUNCATE`. | the running API |

## Migrations

- Migrations live in `backend/src/db/migrations`, run with sequelize-cli as the owner role.
- The dump's `SequelizeMeta` table already lists the 13 original migrations, so only newer ones run. See [DATABASE_AUDIT.md](../DATABASE_AUDIT.md) §4.

```bash
npm run db:migrate                                    # apply
npm run db:migrate:status -w backend                  # list
npm run db:migrate:undo -w backend                    # revert the last one
```

## Seeders

- The original seeders (`backend/src/db/seeders`) recreate the same catalogue as the dump.
- They are meant for an **empty** schema built only from migrations. **Do not run them on top of the dump**: they would create duplicates.
- For local logins, use `npm run db:dev-users` instead.

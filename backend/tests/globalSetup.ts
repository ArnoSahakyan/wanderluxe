/**
 * Rebuilds the *test* database before the suite runs:
 *   drop schema → load database/schema/baseline.sql → run all migrations.
 * Connects with the owner (migration) role from backend/.env and refuses to
 * touch any database whose name does not end in "_test".
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');

export default async function setup() {
    dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });
    const database = process.env.DB_NAME_TEST ?? 'wanderluxe_test';
    if (!database.endsWith('_test')) throw new Error(`Refusing to reset non-test database "${database}"`);

    const owner = process.env.DB_MIGRATION_USER || process.env.DB_USER;
    const appUser = process.env.DB_USER;
    const client = new pg.Client({
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        user: owner,
        password: process.env.DB_MIGRATION_PASSWORD || process.env.DB_PASSWORD,
        database,
    });

    try {
        await client.connect();
    } catch (err) {
        throw new Error(
            `Cannot connect to test database "${database}". Start PostgreSQL with \`npm run db:up\`.\n${(err as Error).message}`,
        );
    }

    const grants =
        appUser && appUser !== owner
            ? `GRANT USAGE ON SCHEMA public TO "${appUser}";
               ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${appUser}";
               ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "${appUser}";
               ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA public GRANT USAGE ON TYPES TO "${appUser}";`
            : '';

    await client.query(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION "${owner}"; ${grants}`);
    await client.query(fs.readFileSync(path.resolve(backendRoot, '../database/schema/baseline.sql'), 'utf8'));
    await client.end();

    execFileSync('npx', ['sequelize-cli', 'db:migrate', '--env', 'test'], {
        cwd: backendRoot,
        env: { ...process.env, NODE_ENV: 'test', DB_NAME_TEST: database },
        stdio: 'pipe',
    });
}

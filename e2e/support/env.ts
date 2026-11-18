/**
 * Shared settings for the e2e run. Used by playwright.config.ts (to start the
 * servers) and by the tests (to call the API and Mailpit directly).
 *
 * Every URL here is local. The API and Vite run on their own ports so a normal
 * `npm run dev` (3000 / 5173) can keep running next to the tests.
 */
import os from 'node:os';
import path from 'node:path';

const port = (name: string, fallback: number) => Number(process.env[name] || fallback);

export const API_PORT = port('E2E_API_PORT', 3100);
export const WEB_PORT = port('E2E_WEB_PORT', 5180);
const MAILPIT_UI_PORT = port('MAILPIT_UI_PORT', 8025);
const MAILPIT_SMTP_PORT = port('MAILPIT_SMTP_PORT', 1025);

export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const MAILPIT_URL = `http://localhost:${MAILPIT_UI_PORT}`;

export const E2E_DB_NAME = process.env.E2E_DB_NAME || `${process.env.POSTGRES_DB || 'wanderluxe'}_e2e`;

/** Created (or reset) by backend/scripts/create-dev-users.ts during DB preparation. */
export const ADMIN = { email: 'admin@wanderluxe.local', password: 'E2eAdmin#2026' };
export const CUSTOMER = { email: 'customer@wanderluxe.local', password: 'E2eCustomer#2026' };

/**
 * Environment for `npm run dev:backend` (and the DB preparation that runs just
 * before it). It overrides backend/.env, whose values only fill the gaps.
 */
export const apiEnv: Record<string, string> = {
    NODE_ENV: 'development',
    PORT: String(API_PORT),
    LOG_LEVEL: process.env.E2E_API_LOG_LEVEL || 'warn',
    // Database: the local docker PostgreSQL, the dedicated e2e database only.
    DATABASE_URL: '',
    DB_MIGRATION_URL: '',
    DB_HOST: 'localhost',
    DB_SSL: 'false',
    DB_NAME: E2E_DB_NAME,
    E2E_DB_NAME,
    // Links in e-mails must point at the e2e frontend.
    APP_URL: WEB_URL,
    CORS_ORIGIN: WEB_URL,
    // Many sign-ins from one IP in a few seconds.
    RATE_LIMIT_ENABLED: 'false',
    // "Try as customer / admin" on the sign-in page (accounts made by create-demo-users.ts).
    DEMO_MODE: 'true',
    DEMO_CUSTOMER_EMAIL: 'demo-customer@example.com',
    DEMO_ADMIN_EMAIL: 'demo-admin@example.com',
    BCRYPT_ROUNDS: '10',
    // E-mail goes to Mailpit from docker compose.
    SMTP_HOST: 'localhost',
    SMTP_PORT: String(MAILPIT_SMTP_PORT),
    SMTP_SECURE: 'false',
    SMTP_USER: '',
    SMTP_PASS: '',
    CONTACT_RECIPIENT_EMAIL: 'inbox@wanderluxe.test',
    // Uploads go to a throw-away folder, never to Supabase.
    STORAGE_DRIVER: 'local',
    UPLOADS_DIR: path.join(os.tmpdir(), 'wanderluxe-e2e-uploads'),
    STORAGE_PUBLIC_URL: `${WEB_URL}/uploads`,
    STORAGE_FALLBACK_URL: '',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    DEV_ADMIN_PASSWORD: ADMIN.password,
    DEV_CUSTOMER_PASSWORD: CUSTOMER.password,
};

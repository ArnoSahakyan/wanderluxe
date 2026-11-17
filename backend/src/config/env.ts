/**
 * Central, validated configuration.
 *
 * Every environment variable the API uses is declared here, once. The process
 * refuses to start with a readable error when something required is missing or
 * malformed, instead of failing later with an obscure runtime error.
 *
 * Older variable names from the original deployment are still accepted
 * (ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, CORS, SUPABASE_PUBLIC_URL) so an
 * existing production .env keeps working unchanged.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Existing process variables always win (tests and hosting platforms set them directly).
dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });

const bool = (fallback: boolean) =>
    z
        .enum(['true', 'false', '1', '0', ''])
        .optional()
        .transform((v) => (v === undefined || v === '' ? fallback : v === 'true' || v === '1'));

const csv = z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []));

const optionalString = z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const schema = z
    .object({
        NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
        PORT: z.coerce.number().int().positive().default(3000),
        TRUST_PROXY: z.string().optional(),
        LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),

        /** Public URL of the SPA — used for links inside e-mails. */
        APP_URL: optionalString,
        /** Comma-separated list of allowed browser origins. */
        CORS_ORIGIN: csv,
        CORS: optionalString, // legacy single-origin variable

        DATABASE_URL: optionalString,
        DB_HOST: z.string().default('localhost'),
        DB_PORT: z.coerce.number().int().positive().default(5432),
        DB_NAME: optionalString,
        DB_USER: optionalString,
        DB_PASSWORD: optionalString,
        DB_SSL: bool(false),
        /** PEM of the server's CA (e.g. Supabase's root certificate). "\n" escapes are accepted. */
        DB_SSL_CA: optionalString,
        /** Only set to false if you cannot supply DB_SSL_CA: traffic stays encrypted but the server is not verified. */
        DB_SSL_REJECT_UNAUTHORIZED: bool(true),
        DB_POOL_MAX: z.coerce.number().int().positive().default(10),
        DB_LOG_SQL: bool(false),

        JWT_ACCESS_SECRET: optionalString,
        JWT_REFRESH_SECRET: optionalString,
        ACCESS_TOKEN_SECRET: optionalString, // legacy
        REFRESH_TOKEN_SECRET: optionalString, // legacy
        JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
        JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
        BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

        RATE_LIMIT_ENABLED: bool(true),
        RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(20),
        RATE_LIMIT_FORMS_MAX: z.coerce.number().int().positive().default(10),
        RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(15),

        SMTP_HOST: optionalString,
        SMTP_PORT: z.coerce.number().int().positive().default(587),
        SMTP_SECURE: bool(false),
        SMTP_USER: optionalString,
        SMTP_PASS: optionalString,
        MAIL_FROM: optionalString,
        CONTACT_RECIPIENT_EMAIL: optionalString,

        STORAGE_DRIVER: z.enum(['local', 'supabase']).optional(),
        /** Base URL images are served from, without trailing slash. */
        STORAGE_PUBLIC_URL: optionalString,
        SUPABASE_PUBLIC_URL: optionalString, // legacy name of STORAGE_PUBLIC_URL
        /** local driver only: where to redirect for files not on disk (read-only). */
        STORAGE_FALLBACK_URL: optionalString,
        UPLOADS_DIR: z.string().default(path.join(backendRoot, 'uploads')),
        SUPABASE_URL: optionalString,
        SUPABASE_SERVICE_ROLE_KEY: optionalString,
        SUPABASE_BUCKET_TOURS: z.string().default('tours'),
        SUPABASE_BUCKET_DESTINATIONS: z.string().default('destinations'),
        SUPABASE_BUCKET_BLOGS: z.string().default('blogs'),
    })
    .superRefine((env, ctx) => {
        const access = env.JWT_ACCESS_SECRET ?? env.ACCESS_TOKEN_SECRET;
        const refresh = env.JWT_REFRESH_SECRET ?? env.REFRESH_TOKEN_SECRET;
        const minLength = env.NODE_ENV === 'production' ? 32 : 16;
        for (const [name, value] of [
            ['JWT_ACCESS_SECRET', access],
            ['JWT_REFRESH_SECRET', refresh],
        ] as const) {
            if (!value || value.length < minLength) {
                ctx.addIssue({
                    code: 'custom',
                    path: [name],
                    message: `must be set and at least ${minLength} characters`,
                });
            }
        }
        if (access && refresh && access === refresh) {
            ctx.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'must differ from the access secret' });
        }
        if (!env.DATABASE_URL && (!env.DB_NAME || !env.DB_USER)) {
            ctx.addIssue({ code: 'custom', path: ['DB_NAME'], message: 'set DATABASE_URL or DB_NAME + DB_USER (+ DB_PASSWORD)' });
        }
        const driver = env.STORAGE_DRIVER ?? (env.NODE_ENV === 'production' ? 'supabase' : 'local');
        if (driver === 'supabase' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
            ctx.addIssue({
                code: 'custom',
                path: ['SUPABASE_URL'],
                message: 'STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
            });
        }
    });

// Empty assignments (`KEY=`) mean "not set" — lets .env.example keep placeholders.
const rawEnv = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''));
const parsed = schema.safeParse(rawEnv);

if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.') || '(env)'}: ${i.message}`);
    // Never print values — only names and the reason.
    console.error(`\n❌ Invalid backend configuration (backend/.env):\n${lines.join('\n')}\n`);
    process.exit(1);
}

const env = parsed.data;
const isProduction = env.NODE_ENV === 'production';
const storageDriver = env.STORAGE_DRIVER ?? (isProduction ? 'supabase' : 'local');
// Browsers send Origin as scheme://host[:port] — no path, no trailing slash, lower-case.
// Normalise configured values the same way so "https://site.app/" still matches.
const normaliseOrigin = (value: string): string => {
    const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
    try {
        return new URL(trimmed).origin;
    } catch {
        return trimmed.replace(/\/+$/, '').toLowerCase();
    }
};
const corsOrigins = [
    ...new Set((env.CORS_ORIGIN.length ? env.CORS_ORIGIN : env.CORS ? [env.CORS] : []).map(normaliseOrigin)),
];

const parseTrustProxy = (value?: string): boolean | number | string => {
    if (value === undefined || value === '' || value === 'false') return false;
    if (value === 'true') return true;
    const n = Number(value);
    return Number.isInteger(n) ? n : value;
};

export const config = {
    env: env.NODE_ENV,
    isProduction,
    isTest: env.NODE_ENV === 'test',
    port: env.PORT,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : isProduction ? 'info' : 'debug'),
    appUrl: (env.APP_URL ?? corsOrigins[0] ?? 'http://localhost:5173').replace(/\/+$/, ''),
    corsOrigins,
    db: {
        url: env.DATABASE_URL,
        host: env.DB_HOST,
        port: env.DB_PORT,
        name: env.DB_NAME,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        ssl: env.DB_SSL
            ? {
                  require: true,
                  rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
                  ...(env.DB_SSL_CA ? { ca: env.DB_SSL_CA.replace(/\\n/g, '\n') } : {}),
              }
            : undefined,
        poolMax: env.DB_POOL_MAX,
        logSql: env.DB_LOG_SQL,
    },
    jwt: {
        accessSecret: (env.JWT_ACCESS_SECRET ?? env.ACCESS_TOKEN_SECRET) as string,
        refreshSecret: (env.JWT_REFRESH_SECRET ?? env.REFRESH_TOKEN_SECRET) as string,
        accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
        refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    },
    bcryptRounds: env.BCRYPT_ROUNDS,
    rateLimit: {
        enabled: env.RATE_LIMIT_ENABLED && env.NODE_ENV !== 'test',
        authMax: env.RATE_LIMIT_AUTH_MAX,
        formsMax: env.RATE_LIMIT_FORMS_MAX,
        windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60_000,
    },
    mail: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.MAIL_FROM ?? `"WanderLuxe Travel" <${env.SMTP_USER ?? 'no-reply@wanderluxe.local'}>`,
        contactRecipient: env.CONTACT_RECIPIENT_EMAIL ?? env.SMTP_USER,
    },
    storage: {
        driver: storageDriver,
        publicUrl: (env.STORAGE_PUBLIC_URL ?? env.SUPABASE_PUBLIC_URL ?? `http://localhost:${env.PORT}/uploads`).replace(/\/+$/, ''),
        fallbackUrl: env.STORAGE_FALLBACK_URL?.replace(/\/+$/, ''),
        uploadsDir: path.resolve(env.UPLOADS_DIR),
        supabaseUrl: env.SUPABASE_URL,
        supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
        buckets: {
            tours: env.SUPABASE_BUCKET_TOURS,
            destinations: env.SUPABASE_BUCKET_DESTINATIONS,
            blogs: env.SUPABASE_BUCKET_BLOGS,
        },
    },
} as const;

export type AppConfig = typeof config;

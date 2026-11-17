#!/usr/bin/env node
/**
 * Creates local .env files from the committed examples, filling in random
 * passwords/secrets. Never overwrites an existing file.
 *   npm run setup
 */
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const secret = (bytes = 24) => randomBytes(bytes).toString('hex');

const readEnv = (file) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );

const write = (file, content) => {
  writeFileSync(file, content);
  chmodSync(file, 0o600);
  console.log(`✔ created ${file.replace(root + '/', '')}`);
};

// 1. root .env (docker compose)
const rootEnv = join(root, '.env');
if (!existsSync(rootEnv)) {
  write(
    rootEnv,
    readFileSync(join(root, '.env.example'), 'utf8')
      .replace('change-me-owner', secret(16))
      .replace('change-me-app', secret(16)),
  );
} else console.log('• .env exists — left unchanged');

const db = readEnv(rootEnv);

// 2. backend/.env
const backendEnv = join(root, 'backend/.env');
if (!existsSync(backendEnv)) {
  const set = (text, key, value) => text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
  let text = readFileSync(join(root, 'backend/.env.example'), 'utf8');
  text = set(text, 'DB_PORT', db.POSTGRES_PORT ?? '5432');
  text = set(text, 'DB_NAME', db.POSTGRES_DB ?? 'wanderluxe');
  text = set(text, 'DB_USER', db.APP_DB_USER ?? 'wanderluxe_app');
  text = set(text, 'DB_PASSWORD', db.APP_DB_PASSWORD ?? '');
  text = set(text, 'DB_MIGRATION_USER', db.POSTGRES_USER ?? 'wanderluxe_owner');
  text = set(text, 'DB_MIGRATION_PASSWORD', db.POSTGRES_PASSWORD ?? '');
  text = set(text, 'JWT_ACCESS_SECRET', secret(32));
  text = set(text, 'JWT_REFRESH_SECRET', secret(32));
  text = set(text, 'SMTP_PORT', db.MAILPIT_SMTP_PORT ?? '1025');
  write(backendEnv, text);
} else console.log('• backend/.env exists — left unchanged');

// 3. frontend/.env.development.local is optional; the committed .env.development works as-is.
if (!existsSync(join(root, 'frontend/.env.development'))) {
  copyFileSync(join(root, 'frontend/.env.example'), join(root, 'frontend/.env.development'));
}
console.log('\nNext: npm run db:up && npm run db:import && npm run db:migrate && npm run dev');

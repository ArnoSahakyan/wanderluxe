'use strict';
/**
 * sequelize-cli configuration (migrations & seeders).
 *
 * Migrations need DDL rights, so they connect with the *owner* role
 * (DB_MIGRATION_USER / DB_MIGRATION_PASSWORD). The running app connects with
 * the least-privilege role in DB_USER / DB_PASSWORD. If no migration user is
 * configured, the app credentials are used (e.g. single-role setups).
 *
 * No secrets live in this file — everything comes from backend/.env.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const base = {
  dialect: 'postgres',
  migrationStorageTableName: 'SequelizeMeta',
  logging: false,
};

// Mirrors src/config/env.ts: DB_SSL, DB_SSL_CA, DB_SSL_REJECT_UNAUTHORIZED.
const ssl =
  process.env.DB_SSL === 'true'
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
          ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') } : {}),
        },
      }
    : {};

const fromEnv = (dbName) => {
  if (process.env.DB_MIGRATION_URL) {
    return { ...base, url: process.env.DB_MIGRATION_URL, dialectOptions: ssl };
  }
  return {
    ...base,
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: dbName,
    username: process.env.DB_MIGRATION_USER || process.env.DB_USER,
    password: process.env.DB_MIGRATION_PASSWORD || process.env.DB_PASSWORD,
    dialectOptions: ssl,
  };
};

module.exports = {
  development: fromEnv(process.env.DB_NAME || 'wanderluxe'),
  test: fromEnv(process.env.DB_NAME_TEST || `${process.env.DB_NAME || 'wanderluxe'}_test`),
  production: fromEnv(process.env.DB_NAME),
};

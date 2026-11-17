/**
 * Minimal levelled logger.
 * - development: readable single lines
 * - production: one JSON object per line (ready for log aggregation)
 * No dependency; swap for pino later if log volume ever justifies it.
 */
import { config } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const threshold = order[config.logLevel];

const serializeError = (err: unknown) =>
    err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err;

const write = (level: Level, message: string, meta?: Record<string, unknown>) => {
    if (order[level] < threshold) return;
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    const safeMeta = meta
        ? Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, k === 'err' ? serializeError(v) : v]))
        : undefined;

    if (config.isProduction) {
        stream.write(JSON.stringify({ time: new Date().toISOString(), level, message, ...safeMeta }) + '\n');
        return;
    }
    const extra = safeMeta && Object.keys(safeMeta).length ? ' ' + JSON.stringify(safeMeta) : '';
    stream.write(`${new Date().toISOString().slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${message}${extra}\n`);
};

export const logger = {
    debug: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
};

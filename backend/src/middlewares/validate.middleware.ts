import type { RequestHandler } from 'express';
import { z } from 'zod';

interface Schemas {
    params?: z.ZodType;
    query?: z.ZodType;
    body?: z.ZodType;
}

const formatIssues = (error: z.ZodError) =>
    error.issues.map((issue) => ({ field: issue.path.join('.') || undefined, message: issue.message }));

/**
 * Validates and coerces request parts with zod. On success the parsed values
 * replace the raw ones (so controllers receive numbers, trimmed strings, and
 * no unknown keys). On failure responds 400 with
 * `{ message, errors: [{ field, message }] }` — `message` keeps the existing
 * `{ message }` error contract the SPA already displays.
 */
export const validate =
    (schemas: Schemas): RequestHandler =>
    (req, res, next) => {
        for (const part of ['params', 'query', 'body'] as const) {
            const schema = schemas[part];
            if (!schema) continue;

            const result = schema.safeParse(req[part] ?? {});
            if (!result.success) {
                const errors = formatIssues(result.error);
                const first = errors[0];
                res.status(400).json({
                    message: first ? `${first.field ? `${first.field}: ` : ''}${first.message}` : 'Invalid request.',
                    errors,
                });
                return;
            }

            // Express 5 exposes req.query through a getter, so redefine it.
            Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true, enumerable: true });
        }
        next();
    };

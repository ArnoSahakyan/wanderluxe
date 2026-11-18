import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import {
    DatabaseError,
    ForeignKeyConstraintError,
    UniqueConstraintError,
    ValidationError as SequelizeValidationError,
} from 'sequelize';
import { logger } from '../lib/logger';
import { AppError } from '../utils/errors';

const MULTER_MESSAGES: Partial<Record<multer.MulterError['code'], string>> = {
    LIMIT_FILE_SIZE: 'Each image must be 5 MB or smaller.',
    LIMIT_FILE_COUNT: 'You can upload at most 10 images.',
    LIMIT_UNEXPECTED_FILE: 'Unexpected file field; use "images".',
};

/** 404 for unknown API routes (JSON, not Express' HTML page). */
export const notFoundHandler = (req: Request, res: Response) => {
    res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl.split('?')[0]}` });
};

/**
 * Converts every error into `{ message }` with a meaningful status.
 * Internal details (stack, SQL, constraint names) are logged, never returned.
 */
export const globalErrorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (res.headersSent) return;

    if (err instanceof AppError) {
        res.status(err.statusCode).json({ message: err.message, ...err.details });
        return;
    }
    if (err instanceof multer.MulterError) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        res.status(status).json({ message: MULTER_MESSAGES[err.code] ?? 'Invalid upload.' });
        return;
    }
    if (err instanceof UniqueConstraintError) {
        res.status(409).json({ message: 'This record already exists.' });
        return;
    }
    if (err instanceof ForeignKeyConstraintError) {
        res.status(409).json({ message: 'This record is referenced by, or references, data that does not exist.' });
        return;
    }
    if (err instanceof SequelizeValidationError) {
        res.status(400).json({ message: err.errors[0]?.message ?? 'Invalid data.' });
        return;
    }
    if (err instanceof DatabaseError && (err.parent as { code?: string } | undefined)?.code === '23514') {
        // CHECK constraint violation (e.g. not enough spots left)
        res.status(400).json({ message: 'The request violates a data rule.' });
        return;
    }

    // body-parser errors (malformed JSON, payload too large) carry a status.
    const status = (err as { status?: number; type?: string }).status;
    if (status && status >= 400 && status < 500) {
        const message = status === 413 ? 'Request body is too large.' : 'Malformed request body.';
        res.status(status).json({ message });
        return;
    }

    logger.error('Unhandled error', { err, method: req.method, path: req.originalUrl.split('?')[0] });
    res.status(500).json({ message: 'Internal server error.' });
};

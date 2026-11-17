import multer, { type FileFilterCallback } from 'multer';
import type { Request } from 'express';
import { BadRequestError } from '../utils/errors';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
    if (ALLOWED_TYPES.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new BadRequestError('Only images are allowed (jpg, png, webp, avif).'));
    }
};

/** Up to 10 images of 5 MB each, held in memory and re-encoded before storage. */
export const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024, files: 10, fields: 30, fieldSize: 1024 * 1024 },
}).array('images', 10);

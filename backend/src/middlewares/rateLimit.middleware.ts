import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config/env';

const passThrough: RequestHandler = (_req, _res, next) => next();

const limiter = (limit: number, message: string): RequestHandler =>
    config.rateLimit.enabled
        ? rateLimit({
              windowMs: config.rateLimit.windowMs,
              limit,
              standardHeaders: 'draft-8',
              legacyHeaders: false,
              message: { message },
          })
        : passThrough;

/** Sign-in, sign-up, token refresh and password reset. */
export const authLimiter = limiter(config.rateLimit.authMax, 'Too many attempts. Please try again later.');

/** Public forms that send e-mails (contact, newsletter). */
export const formLimiter = limiter(config.rateLimit.formsMax, 'Too many requests. Please try again later.');

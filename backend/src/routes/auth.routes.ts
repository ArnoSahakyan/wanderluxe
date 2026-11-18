import express from 'express';
import {
    demoSignIn,
    demoStatus,
    logout,
    refreshToken,
    userInfo,
    signUp,
    signIn,
    requestPasswordReset,
    resetPassword,
} from '../controllers/auth.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { authLimiter } from '../middlewares/rateLimit.middleware';
import { validate } from '../middlewares/validate.middleware';
import { asHandler } from '../utils';
import * as v from '../validators';

const router = express.Router();

// Public routes
router.post('/signup', authLimiter, validate({ body: v.signUpBody }), asHandler(signUp));
router.post('/signin', authLimiter, validate({ body: v.signInBody }), asHandler(signIn));
// Session cookie (httpOnly, path /api/auth) — no body.
router.post('/refresh', asHandler(refreshToken));
router.post('/logout', asHandler(logout));
router.get('/demo', demoStatus);
router.post('/demo', authLimiter, validate({ body: v.demoBody }), asHandler(demoSignIn));
router.post('/request-password-reset', authLimiter, validate({ body: v.emailBody }), asHandler(requestPasswordReset));
router.post(
    '/reset-password',
    authLimiter,
    validate({ query: v.resetPasswordQuery, body: v.resetPasswordBody }),
    asHandler(resetPassword),
);

// Protected route
router.get('/me', verifyToken, asHandler(userInfo));

export default router;

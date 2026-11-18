import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { Op, fn, col, where as sqlWhere } from 'sequelize';
import { config } from '../config/env';
import { EXPIRATION_TIME } from '../constants';
import { Role, User } from '../db/models';
import { generateResetPasswordEmail } from '../emails';
import { logger } from '../lib/logger';
import { cleanUpDemoCustomer, demoEmail, isDemoEmail } from '../lib/demo';
import { endSession, revokeAllSessions, rotateSession, startSession } from '../lib/sessions';
import type { AuthenticatedRequest, TypedRequest } from '../types';
import {
    AppError,
    BadRequestError,
    NotFoundError,
    UnauthorizedError,
    generateOpaqueToken,
    generateToken,
    hashToken,
    sendEmail,
} from '../utils';
import type { z } from 'zod';
import type * as v from '../validators';

// Hash used when the e-mail is unknown, so sign-in takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', config.bcryptRounds);

/** Case-insensitive e-mail match (works for addresses stored before normalisation). */
export const emailEquals = (email: string) => sqlWhere(fn('lower', col('email')), email.toLowerCase());

/** The profile the SPA keeps for the signed-in user. */
const toSessionUser = (user: User) => ({
    user_id: user.user_id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone_number ?? null,
    phone_number: user.phone_number ?? null,
    role: user.Role?.name,
    ...(isDemoEmail(user.email) ? { demo: true } : {}),
});

// POST /auth/signup
export const signUp = async (req: TypedRequest<{}, {}, z.infer<typeof v.signUpBody>>, res: Response) => {
    const { full_name, email, password, phone_number } = req.body;

    const existingUser = await User.findOne({ where: emailEquals(email), paranoid: false });
    if (existingUser) {
        throw new AppError(409, 'Email already in use.');
    }

    const customerRole = await Role.findOne({ where: { name: 'customer' } });

    await User.create({
        full_name,
        email,
        password: await bcrypt.hash(password, config.bcryptRounds),
        phone_number: phone_number ?? null,
        role_id: customerRole?.role_id ?? 2,
    });

    res.status(201).json({ message: 'Registration successful.' });
};

// POST /auth/signin
export const signIn = async (req: TypedRequest<{}, {}, z.infer<typeof v.signInBody>>, res: Response) => {
    const { email, password } = req.body;

    const user = await User.findOne({
        where: emailEquals(email),
        include: { model: Role, as: 'Role' },
    });

    const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);

    if (!user || !valid) {
        throw new UnauthorizedError('Invalid credentials.');
    }

    // The refresh token travels only in the httpOnly cookie, never in the body.
    await startSession(res, user.user_id);
    res.json({ token: generateToken(user), user: toSessionUser(user) });
};

// GET /auth/demo — lets the sign-in page decide whether to offer the demo buttons.
export const demoStatus = (_req: Request, res: Response) => {
    res.json({ enabled: config.demo.enabled });
};

// POST /auth/demo { role } — signs in as the demo customer or demo admin (DEMO_MODE only).
export const demoSignIn = async (req: TypedRequest<{}, {}, z.infer<typeof v.demoBody>>, res: Response) => {
    if (!config.demo.enabled) {
        throw new NotFoundError('The demo is not available.');
    }

    const user = await User.findOne({
        where: emailEquals(demoEmail(req.body.role)),
        include: { model: Role, as: 'Role' },
    });
    if (!user || user.Role?.name !== req.body.role) {
        logger.error('Demo account missing or has the wrong role; run npm run db:demo-users', { role: req.body.role });
        throw new AppError(503, 'The demo is not available right now.');
    }

    if (req.body.role === 'customer') await cleanUpDemoCustomer(user.user_id);
    await startSession(res, user.user_id);
    res.json({ token: generateToken(user), user: toSessionUser(user) });
};

// POST /auth/refresh — rotates the session cookie; returns a new access token and the current profile.
export const refreshToken = async (req: Request, res: Response) => {
    const userId = await rotateSession(req, res);

    const user = await User.findByPk(userId, {
        include: { model: Role, as: 'Role', attributes: ['name'] },
    });
    if (!user) {
        // Account deleted since sign-in.
        await revokeAllSessions(userId);
        await endSession(req, res);
        throw new UnauthorizedError('Session expired. Please sign in again.');
    }

    res.json({ token: generateToken(user), user: toSessionUser(user) });
};

// POST /auth/logout — ends this browser's session. Works without an access token.
export const logout = async (req: Request, res: Response) => {
    await endSession(req, res);
    res.status(204).end();
};

// GET /auth/me
export const userInfo = async (req: AuthenticatedRequest, res: Response) => {
    const user = await User.findByPk(req.user_id, {
        include: { model: Role, as: 'Role', attributes: ['name'] },
    });

    if (!user) {
        throw new NotFoundError('User not found.');
    }

    res.json({ user: toSessionUser(user) });
};

const RESET_REQUESTED_MESSAGE = 'If an account exists for this e-mail, a reset link has been sent.';

// POST /auth/request-password-reset
export const requestPasswordReset = async (req: TypedRequest<{}, {}, z.infer<typeof v.emailBody>>, res: Response) => {
    const user = await User.findOne({ where: emailEquals(req.body.email) });

    // Same answer whether or not the account exists (no e-mail enumeration).
    if (user) {
        const token = generateOpaqueToken();
        user.reset_password_token = hashToken(token);
        user.reset_token_expires = new Date(Date.now() + EXPIRATION_TIME);
        await user.save();

        try {
            await sendEmail({
                to: user.email,
                subject: 'Reset Your Password',
                html: generateResetPasswordEmail({ token }),
            });
        } catch (err) {
            logger.error('Password reset e-mail failed', { err });
            throw new AppError(502, 'We could not send the e-mail right now. Please try again later.');
        }
    }

    res.status(200).json({ message: RESET_REQUESTED_MESSAGE });
};

// POST /auth/reset-password?token=
export const resetPassword = async (
    req: TypedRequest<{}, {}, z.infer<typeof v.resetPasswordBody>, z.infer<typeof v.resetPasswordQuery>>,
    res: Response,
): Promise<void> => {
    const user = await User.findOne({
        where: {
            reset_password_token: hashToken(req.query.token),
            reset_token_expires: { [Op.gt]: new Date() },
        },
    });

    if (!user) {
        throw new BadRequestError('Invalid or expired reset token.');
    }

    user.password = await bcrypt.hash(req.body.new_password, config.bcryptRounds);
    user.password_changed_at = new Date();
    user.reset_password_token = null;
    user.reset_token_expires = null;
    await user.save();
    // Whoever had the old password is signed out everywhere.
    await revokeAllSessions(user.user_id);

    res.status(200).json({ message: 'Password has been reset successfully.' });
};

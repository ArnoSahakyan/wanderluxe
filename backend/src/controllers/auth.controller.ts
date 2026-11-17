import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { Op, fn, col, where as sqlWhere } from 'sequelize';
import { config } from '../config/env';
import { EXPIRATION_TIME } from '../constants';
import { Role, User } from '../db/models';
import { generateResetPasswordEmail } from '../emails';
import { logger } from '../lib/logger';
import type { AuthenticatedRequest, TypedRequest } from '../types';
import {
    AppError,
    BadRequestError,
    NotFoundError,
    UnauthorizedError,
    generateOpaqueToken,
    generateRefreshToken,
    generateToken,
    hashToken,
    sendEmail,
    verifyRefreshToken,
} from '../utils';
import type { z } from 'zod';
import type * as v from '../validators';

// Hash used when the e-mail is unknown, so sign-in takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', config.bcryptRounds);

/** Case-insensitive e-mail match (works for addresses stored before normalisation). */
export const emailEquals = (email: string) => sqlWhere(fn('lower', col('email')), email.toLowerCase());

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

    res.json({
        token: generateToken(user),
        refreshToken: generateRefreshToken(user),
        user: {
            user_id: user.user_id,
            full_name: user.full_name,
            email: user.email,
            phone: user.phone_number ?? null,
            phone_number: user.phone_number ?? null,
            role: user.Role?.name,
        },
    });
};

// POST /auth/refresh
export const refreshToken = async (req: TypedRequest<{}, {}, z.infer<typeof v.refreshBody>>, res: Response) => {
    const payload = verifyRefreshToken(req.body.refreshToken);
    if (!payload) {
        throw new UnauthorizedError('Invalid or expired refresh token.');
    }

    const user = await User.findByPk(payload.user_id, {
        include: { model: Role, as: 'Role', attributes: ['name'] },
    });

    if (!user) {
        throw new UnauthorizedError('User not found.');
    }

    // Tokens issued before the last password change/reset are revoked.
    // (JWT iat has 1-second resolution, so compare at second precision.)
    if (user.password_changed_at && payload.iat < Math.floor(user.password_changed_at.getTime() / 1000)) {
        throw new UnauthorizedError('Session expired. Please sign in again.');
    }

    res.json({ token: generateToken(user) });
};

// GET /auth/me
export const userInfo = async (req: AuthenticatedRequest, res: Response) => {
    const user = await User.findByPk(req.user_id, {
        include: { model: Role, as: 'Role', attributes: ['name'] },
    });

    if (!user) {
        throw new NotFoundError('User not found.');
    }

    res.json({
        user: {
            user_id: user.user_id,
            full_name: user.full_name,
            email: user.email,
            phone: user.phone_number,
            phone_number: user.phone_number,
            role: user.Role?.name,
        },
    });
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

    res.status(200).json({ message: 'Password has been reset successfully.' });
};

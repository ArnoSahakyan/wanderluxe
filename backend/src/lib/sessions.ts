/**
 * Sign-in sessions backed by rotating refresh tokens.
 *
 * - The browser gets an opaque random token in an httpOnly, SameSite=Strict
 *   cookie scoped to /api/auth, so page scripts can never read it and it is
 *   only sent to the refresh and logout endpoints.
 * - The database stores only the token's SHA-256 hash (refresh_tokens).
 * - Each refresh exchanges the token for a new one in the same session. A token
 *   presented again after it was exchanged means it was copied: the whole
 *   session is revoked. A short grace period lets two tabs that refresh at the
 *   same moment both succeed instead of tripping that alarm.
 */
import { randomUUID } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { Op } from 'sequelize';
import { config } from '../config/env';
import { RefreshToken } from '../db/models';
import { UnauthorizedError } from '../utils/errors';
import { generateOpaqueToken, hashToken } from '../utils/security';
import { logger } from './logger';

export const SESSION_COOKIE = 'wl_session';

/** A token exchanged less than this long ago is not treated as stolen. */
export const ROTATION_GRACE_MS = 30_000;

const cookieOptions = (): CookieOptions => ({
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: 'strict',
    path: '/api/auth',
});

const readCookie = (req: Request): string | undefined => {
    const value: unknown = req.cookies?.[SESSION_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export const clearSessionCookie = (res: Response) => {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
};

const issueToken = async (res: Response, userId: number, sessionId: string) => {
    const token = generateOpaqueToken();
    await RefreshToken.create({
        user_id: userId,
        session_id: sessionId,
        token_hash: hashToken(token),
        expires_at: new Date(Date.now() + config.session.ttlMs),
    });
    res.cookie(SESSION_COOKIE, token, {
        ...cookieOptions(),
        maxAge: config.session.ttlMs,
    });
};

/** New session after a successful sign-in (or a password change on this device). */
export const startSession = async (res: Response, userId: number) => {
    // Housekeeping: this user's expired tokens can no longer be used or reused.
    await RefreshToken.destroy({
        where: { user_id: userId, expires_at: { [Op.lt]: new Date() } },
    });
    await issueToken(res, userId, randomUUID());
};

const revokeWhere = (where: { session_id: string } | { user_id: number }) =>
    RefreshToken.update({ revoked_at: new Date() }, { where: { ...where, revoked_at: null } });

/**
 * Validates the session cookie and rotates it. Returns the user id the session
 * belongs to; throws 401 (and clears the cookie) when there is no valid session.
 */
export const rotateSession = async (req: Request, res: Response): Promise<number> => {
    const deny = (message: string): never => {
        clearSessionCookie(res);
        throw new UnauthorizedError(message);
    };

    const token = readCookie(req);
    if (!token) return deny('Not signed in.');

    const row = await RefreshToken.findOne({
        where: { token_hash: hashToken(token) },
    });
    if (!row || row.revoked_at || row.expires_at.getTime() <= Date.now()) {
        return deny('Session expired. Please sign in again.');
    }

    if (row.rotated_at) {
        if (Date.now() - row.rotated_at.getTime() <= ROTATION_GRACE_MS) {
            // Another request from this browser rotated it a moment ago and already
            // set the new cookie; answer without rotating again.
            return row.user_id;
        }
        await revokeWhere({ session_id: row.session_id });
        logger.warn('Refresh token reused after rotation; session revoked', {
            user_id: row.user_id,
        });
        return deny('Session expired. Please sign in again.');
    }

    // Conditional update: of two simultaneous requests only one wins the rotation;
    // the other is inside the grace period and simply gets an access token.
    const [rotated] = await RefreshToken.update(
        { rotated_at: new Date() },
        { where: { id: row.id, rotated_at: null, revoked_at: null } },
    );
    if (rotated === 1) await issueToken(res, row.user_id, row.session_id);
    return row.user_id;
};

/** Logout: revokes this browser's session (if any) and clears the cookie. */
export const endSession = async (req: Request, res: Response) => {
    const token = readCookie(req);
    if (token) {
        const row = await RefreshToken.findOne({
            where: { token_hash: hashToken(token) },
        });
        if (row) await revokeWhere({ session_id: row.session_id });
    }
    clearSessionCookie(res);
};

/** Signs the user out everywhere (password change/reset, account removal). */
export const revokeAllSessions = (userId: number) => revokeWhere({ user_id: userId });

import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';
import type { User } from '../db/models';

export type UserRole = 'customer' | 'admin';

export interface AccessTokenPayload {
    user_id: number;
    role: UserRole;
}

const ALGORITHM = 'HS256' as const;

export const generateToken = (user: User): string =>
    jwt.sign({ user_id: user.user_id, role: (user.Role?.name as UserRole) || 'customer' }, config.jwt.accessSecret, {
        algorithm: ALGORITHM,
        expiresIn: config.jwt.accessExpiresIn as SignOptions['expiresIn'],
    });

const isPayload = (decoded: unknown): decoded is Record<string, unknown> =>
    typeof decoded === 'object' && decoded !== null && Number.isInteger((decoded as { user_id?: unknown }).user_id);

/** Returns the payload or null for any invalid/expired/forged token. */
export const verifyAccessToken = (token: string): AccessTokenPayload | null => {
    try {
        const decoded = jwt.verify(token, config.jwt.accessSecret, { algorithms: [ALGORITHM] });
        if (!isPayload(decoded)) return null;
        const role = decoded.role === 'admin' ? 'admin' : 'customer';
        return { user_id: decoded.user_id as number, role };
    } catch {
        return null;
    }
};

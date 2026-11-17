import type { NextFunction, RequestHandler, Response } from 'express';
import type { AuthenticatedRequest } from '../types';
import { verifyAccessToken } from '../utils/generateTokens';

const bearerToken = (req: AuthenticatedRequest): string | undefined => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length).trim() || undefined;
};

/** Requires a valid access token. 401 tells the SPA to try its refresh token. */
export const verifyToken: RequestHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (!token) {
        res.status(401).json({ message: 'No token provided!' });
        return;
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
        res.status(401).json({ message: 'Unauthorized!' });
        return;
    }

    req.user_id = payload.user_id;
    req.user_role = payload.role;
    next();
};

/** Must run after verifyToken. Role comes from the signed token, never from the client. */
export const isAdmin: RequestHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.user_role === 'admin') {
        next();
        return;
    }
    res.status(403).json({ message: 'Admin access required.' });
};

/** Attaches the user when a valid token is present; otherwise continues as a guest. */
export const optionalAuth: RequestHandler = (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    const payload = token ? verifyAccessToken(token) : null;
    if (payload) {
        req.user_id = payload.user_id;
        req.user_role = payload.role;
    }
    next();
};

import type { Request } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

export type TypedRequest<
    Params = ParamsDictionary,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery = ParsedQs
> = Request<Params, ResBody, ReqBody, ReqQuery>;

/** Request after verifyToken/optionalAuth: identity comes from the verified JWT. */
export interface AuthenticatedRequest<
    Params = ParamsDictionary,
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery = ParsedQs
> extends Request<Params, ResBody, ReqBody, ReqQuery> {
    user_id?: number;
    user_role?: 'customer' | 'admin';
    /** Signed in with a demo account (lib/demo.ts). */
    is_demo?: boolean;
}

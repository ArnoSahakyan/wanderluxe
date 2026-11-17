import type { Request } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

export type TypedRequest<
    Params = ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = ParsedQs
> = Request<Params, ResBody, ReqBody, ReqQuery>;

/** Request after verifyToken/optionalAuth: identity comes from the verified JWT. */
export interface AuthenticatedRequest<
    Params = ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = ParsedQs
> extends Request<Params, ResBody, ReqBody, ReqQuery> {
    user_id?: number;
    user_role?: 'customer' | 'admin';
}

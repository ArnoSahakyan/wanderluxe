import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

export function asHandler<TParams = ParamsDictionary, TResBody = unknown, TReqBody = unknown, TQuery = ParsedQs>(
    handler: (req: Request<TParams, TResBody, TReqBody, TQuery>, res: Response, next: NextFunction) => unknown
): RequestHandler {
    return (req, res, next) => {
        Promise.resolve(handler(req as unknown as Request<TParams, TResBody, TReqBody, TQuery>, res, next)).catch(next);
    };
}

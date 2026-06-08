import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

type AsyncHandler<
  TBody = unknown,
  TParams extends ParamsDictionary = ParamsDictionary,
  TQuery extends ParsedQs = ParsedQs,
> = (
  req: Request<TParams, unknown, TBody, TQuery>,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wraps an async Express route handler to forward errors to the error middleware.
 * Accepts typed body, params, and query generics so controllers can use Zod-inferred types.
 */
export const catchAsync = <
  TBody = unknown,
  TParams extends ParamsDictionary = ParamsDictionary,
  TQuery extends ParsedQs = ParsedQs,
>(
  fn: AsyncHandler<TBody, TParams, TQuery>,
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    (fn as AsyncHandler)(req, res, next).catch(next);
  };
};

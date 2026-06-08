import type { Request } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

/**
 * A typed Express Request that narrows body, params, and query to Zod-inferred types.
 * Use this in controller functions instead of raw `Request` to get full type safety
 * after the `validate()` middleware has already parsed and replaced req.body/params/query.
 *
 * @example
 * export const myController = catchAsync(
 *   async (req: TypedRequest<MyBodyType>, res: Response) => {
 *     const { field } = req.body; // ✅ fully typed
 *   }
 * );
 */
export type TypedRequest<
  TBody = unknown,
  TParams extends ParamsDictionary = ParamsDictionary,
  TQuery extends ParsedQs = ParsedQs,
> = Request<TParams, unknown, TBody, TQuery>;

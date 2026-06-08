import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { catchAsync } from '../shared/utils/catch-async';


/**
 * Express middleware to validate request body, query, and params using a Zod schema.
 * 
 * Example Schema:
 * const mySchema = z.object({
 *   body: z.object({ name: z.string() }),
 *   query: z.object({ page: z.string().optional() }),
 *   params: z.object({ id: z.string().uuid() }),
 * });
 */
export const validate = (schema: z.ZodSchema) =>
  catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    // Parse the request using the provided schema. 
    // This will strip unknown keys if the schema uses .strip() (which is the Zod default)
    const parsedData = (await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    })) as { 
      body?: any; 
      query?: any; 
      params?: any; 
    };

    // Re-assign the validated and potentially transformed data back to the request object.
    // In Express 5, `req.query` is a getter with no setter, so a plain assignment throws.
    // We redefine the property with the parsed value instead.
    if (parsedData.body !== undefined) req.body = parsedData.body;
    if (parsedData.query !== undefined) {
      Object.defineProperty(req, 'query', {
        value: parsedData.query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    if (parsedData.params !== undefined) req.params = parsedData.params as Request['params'];

    next();
  });

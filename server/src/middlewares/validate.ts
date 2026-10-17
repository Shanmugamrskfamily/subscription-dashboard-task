import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AnyObject, ObjectSchema } from 'yup';

type Schemas = Partial<Record<'params' | 'query' | 'body', ObjectSchema<AnyObject>>>;

/**
 * Validates and casts request input with the shared Yup schemas. Unknown keys are
 * stripped, every failing rule is collected (not just the first), and the clean
 * result lands on `req.valid`. Handlers never read raw `req.body` or `req.query`.
 */
export function validate(schemas: Schemas): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const valid: Request['valid'] = {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      valid[part] = await schema.validate(req[part] ?? {}, {
        abortEarly: false,
        stripUnknown: true,
      });
    }
    req.valid = valid;
    next();
  };
}

/** Typed accessors so handlers don't cast `unknown` by hand. */
export const input = {
  body: <T>(req: Request) => req.valid.body as T,
  query: <T>(req: Request) => req.valid.query as T,
  params: <T>(req: Request) => req.valid.params as T,
};

import { isUnsafeKey } from '@planpilot/shared';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/api-error';

const MAX_DEPTH = 6;

function findUnsafeKey(value: unknown, depth = 0): string | null {
  if (depth > MAX_DEPTH) return '(nested too deeply)';
  if (Array.isArray(value)) {
    for (const item of value) {
      const bad = findUnsafeKey(item, depth + 1);
      if (bad) return bad;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (isUnsafeKey(key)) return key;
      const bad = findUnsafeKey(child, depth + 1);
      if (bad) return bad;
    }
  }
  return null;
}

/**
 * Rejects NoSQL-injection shapes such as `{ "email": { "$gt": "" } }` or prototype
 * pollution keys. It runs AFTER the payload is decrypted, so encrypted bodies get the
 * same checks as plain ones. Free text is cleaned per field by the Yup schemas.
 */
export function rejectUnsafeKeys(req: Request, _res: Response, next: NextFunction) {
  const bad = findUnsafeKey(req.body) ?? findUnsafeKey(req.query) ?? findUnsafeKey(req.params);
  if (bad) throw ApiError.badRequest(`Field name "${bad}" is not allowed`);
  next();
}

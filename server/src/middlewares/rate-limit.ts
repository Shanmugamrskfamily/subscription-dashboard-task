import { ERROR_CODES } from '@planpilot/shared';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Options } from 'express-rate-limit';
import { ApiError } from '../utils/api-error';

const MINUTE = 60_000;

function limiter(windowMs: number, limit: number, extra: Partial<Options> = {}): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        ApiError.tooMany(
          'Too many requests. Please wait a moment and try again.',
          ERROR_CODES.RATE_LIMITED,
          {
            retryAfterSeconds: Math.ceil(windowMs / 1000),
          },
        ),
      ),
    ...extra,
  });
}

const passThrough: RequestHandler = (_req, _res, next) => next();

export interface Limiters {
  api: RequestHandler;
  auth: RequestHandler;
  refresh: RequestHandler;
  payments: RequestHandler;
}

/** Tests turn limits off so hundreds of requests can run without waiting. */
export function createLimiters(enabled: boolean): Limiters {
  if (!enabled)
    return { api: passThrough, auth: passThrough, refresh: passThrough, payments: passThrough };
  return {
    api: limiter(15 * MINUTE, 600),
    // Counts failed attempts only, so a correct sign-in never uses up the budget.
    auth: limiter(15 * MINUTE, 20, { skipSuccessfulRequests: true }),
    refresh: limiter(15 * MINUTE, 120),
    payments: limiter(15 * MINUTE, 40),
  };
}

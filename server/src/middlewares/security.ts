import { ERROR_CODES } from '@planpilot/shared';
import { ENC_HEADERS } from '@planpilot/shared/crypto';
import cors from 'cors';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import type { AppConfig } from '../config/env';
import { ApiError } from '../utils/api-error';

/** The API only ever returns JSON, so its own CSP can forbid everything. */
export const securityHeaders = (): RequestHandler =>
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
  });

export const corsPolicy = (config: AppConfig): RequestHandler =>
  cors({
    origin(origin, callback) {
      // Same-origin requests (through the Vercel or Vite proxy) send no Origin header.
      if (!origin || config.clientOrigins.includes(origin)) return callback(null, true);
      return callback(ApiError.forbidden('This origin is not allowed'));
    },
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Request-Id',
      ENC_HEADERS.session,
      ENC_HEADERS.kid,
      ENC_HEADERS.ts,
      ENC_HEADERS.nonce,
    ],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'Date', ENC_HEADERS.response],
    maxAge: 600,
  });

export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'planpilot';

/**
 * Cookie-authenticated routes (refresh, logout) need more than SameSite=Strict:
 * a custom header (which a cross-site form can't send) and an allowed Origin.
 */
export const requireAppRequest =
  (config: AppConfig): RequestHandler =>
  (req, _res, next) => {
    if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
      throw ApiError.forbidden('Request blocked', ERROR_CODES.FORBIDDEN);
    }
    const origin = req.get('origin');
    if (origin && !config.clientOrigins.includes(origin)) {
      throw ApiError.forbidden('Request blocked', ERROR_CODES.FORBIDDEN);
    }
    next();
  };

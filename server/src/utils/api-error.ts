import { ERROR_CODES } from '@planpilot/shared';
import type { ApiFieldError, ErrorCode } from '@planpilot/shared';

/**
 * The only error type services throw on purpose. The error handler turns it into
 * `{ success: false, error: { code, message, details, meta, requestId } }`.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ApiFieldError[],
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(
    message = 'The request is not valid',
    code: ErrorCode = ERROR_CODES.BAD_REQUEST,
    meta?: Record<string, unknown>,
  ) {
    return new ApiError(400, code, message, undefined, meta);
  }

  static unauthorized(
    message = 'Please sign in to continue',
    code: ErrorCode = ERROR_CODES.UNAUTHORIZED,
  ) {
    return new ApiError(401, code, message);
  }

  static forbidden(
    message = 'You do not have access to this',
    code: ErrorCode = ERROR_CODES.FORBIDDEN,
    meta?: Record<string, unknown>,
  ) {
    return new ApiError(403, code, message, undefined, meta);
  }

  static notFound(message = 'Not found', code: ErrorCode = ERROR_CODES.NOT_FOUND) {
    return new ApiError(404, code, message);
  }

  static conflict(
    message: string,
    code: ErrorCode = ERROR_CODES.CONFLICT,
    meta?: Record<string, unknown>,
  ) {
    return new ApiError(409, code, message, undefined, meta);
  }

  static tooMany(
    message: string,
    code: ErrorCode = ERROR_CODES.RATE_LIMITED,
    meta?: Record<string, unknown>,
  ) {
    return new ApiError(429, code, message, undefined, meta);
  }
}

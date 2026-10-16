import { ERROR_CODES } from '@planpilot/shared';
import type { ApiErrorBody, ApiFieldError } from '@planpilot/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { ValidationError } from 'yup';
import { ApiError } from '../utils/api-error';

function uniqueDetails(details: ApiFieldError[]): ApiFieldError[] {
  const seen = new Set<string>();
  return details.filter((d) => {
    const key = `${d.field}|${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Maps anything thrown in a route to an ApiError with a stable code. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof ValidationError) {
    const issues = err.inner.length ? err.inner : [err];
    const details = uniqueDetails(issues.map((e) => ({ field: e.path ?? '', message: e.message })));
    return new ApiError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      'Please fix the highlighted fields',
      details,
    );
  }

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for ${err.path}`);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return new ApiError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      'Please fix the highlighted fields',
      details,
    );
  }

  if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000) {
    return ApiError.conflict('This record already exists');
  }

  if (err instanceof jwt.TokenExpiredError) {
    return ApiError.unauthorized('Your session has expired', ERROR_CODES.TOKEN_EXPIRED);
  }
  if (err instanceof jwt.JsonWebTokenError) {
    return ApiError.unauthorized('Your session is not valid', ERROR_CODES.INVALID_TOKEN);
  }

  // body-parser errors carry a `type` and an HTTP status.
  const type =
    typeof err === 'object' && err !== null ? (err as { type?: unknown }).type : undefined;
  if (type === 'entity.parse.failed') {
    return ApiError.badRequest('The request body is not valid JSON', ERROR_CODES.INVALID_JSON);
  }
  if (type === 'entity.too.large') {
    return new ApiError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, 'The request body is too large');
  }

  return new ApiError(
    500,
    ERROR_CODES.INTERNAL_ERROR,
    'Something went wrong on our side. Please try again.',
  );
}

export const notFound: RequestHandler = (req) => {
  throw ApiError.notFound(`Route ${req.method} ${req.path} does not exist`);
};

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const apiError = toApiError(err);

  if (apiError.status >= 500) req.log.error({ err }, 'Request failed');
  else req.log.warn({ code: apiError.code, status: apiError.status }, apiError.message);

  if (res.headersSent) {
    next(err);
    return;
  }

  const retryAfter = apiError.meta?.retryAfterSeconds;
  if (typeof retryAfter === 'number') res.setHeader('Retry-After', String(retryAfter));

  const body: ApiErrorBody = {
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details?.length ? { details: apiError.details } : {}),
      ...(apiError.meta ? { meta: apiError.meta } : {}),
      requestId: String(req.id),
    },
  };
  res.status(apiError.status).json(body);
};

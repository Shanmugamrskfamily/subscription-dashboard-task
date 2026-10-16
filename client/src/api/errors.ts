import { ERROR_CODES } from '@planpilot/shared';
import type { ApiErrorBody, ApiFieldError, ErrorCode } from '@planpilot/shared';
import { isAxiosError } from 'axios';

/** The one error shape every screen, toast and form deals with. */
export interface AppError {
  status: number;
  code: ErrorCode | 'NETWORK_ERROR' | 'TIMEOUT';
  message: string;
  details: ApiFieldError[];
  meta: Record<string, unknown>;
  requestId?: string;
}

const isErrorBody = (value: unknown): value is ApiErrorBody =>
  Boolean(
    value &&
    typeof value === 'object' &&
    (value as ApiErrorBody).success === false &&
    (value as ApiErrorBody).error,
  );

export function toAppError(error: unknown): AppError {
  if (isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') {
      return {
        status: 0,
        code: 'TIMEOUT',
        message: 'The server took too long to answer. Please try again.',
        details: [],
        meta: {},
      };
    }
    if (!error.response) {
      return {
        status: 0,
        code: 'NETWORK_ERROR',
        message:
          navigator.onLine === false
            ? 'You are offline. Check your connection.'
            : 'Could not reach the server. Please try again.',
        details: [],
        meta: {},
      };
    }
    const body = error.response.data as unknown;
    if (isErrorBody(body)) {
      return {
        status: error.response.status,
        code: body.error.code,
        message: body.error.message,
        details: body.error.details ?? [],
        meta: body.error.meta ?? {},
        requestId: body.error.requestId,
      };
    }
    return {
      status: error.response.status,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Something went wrong on our side. Please try again.',
      details: [],
      meta: {},
    };
  }
  return {
    status: 0,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: error instanceof Error ? error.message : 'Something went wrong.',
    details: [],
    meta: {},
  };
}

export const isAppError = (value: unknown): value is AppError =>
  Boolean(
    value &&
    typeof value === 'object' &&
    'code' in value &&
    'status' in value &&
    'message' in value,
  );

/** RTK Query hands errors back as `unknown`; this narrows them for the UI. */
export function errorOf(value: unknown): AppError | null {
  if (!value) return null;
  return isAppError(value) ? value : toAppError(value);
}

/** Turns server field errors into Formik's `{ field: message }` shape. */
export function fieldErrors(error: AppError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of error.details) if (d.field && !out[d.field]) out[d.field] = d.message;
  return out;
}

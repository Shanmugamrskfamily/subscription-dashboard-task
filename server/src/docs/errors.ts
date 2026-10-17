import { ERROR_CODES } from '@planpilot/shared';
import type { ApiFieldError, ErrorCode } from '@planpilot/shared';
import type { OpenAPIV3_1 } from 'openapi-types';
import { exampleRef, headerRef, responseRef, schemaRef } from './refs';
import type { Response } from './refs';

interface ErrorInfo {
  status: number;
  /** One line for the error table and the response descriptions. */
  meaning: string;
  message: string;
  details?: ApiFieldError[];
  meta?: Record<string, unknown>;
}

const C = ERROR_CODES;
const SUPPORT = 'support@planpilot.demo';

/**
 * Every error code the API can return. Typed as a full record, so adding a code to
 * the shared list without documenting it here fails the type check.
 */
export const ERROR_CATALOGUE: Record<ErrorCode, ErrorInfo> = {
  // ---- generic ----
  [C.VALIDATION_ERROR]: {
    status: 422,
    meaning: 'One or more fields failed validation; `details` lists every failing field.',
    message: 'Please fix the highlighted fields',
    details: [
      { field: 'email', message: 'Enter a valid email address' },
      { field: 'password', message: 'Add an uppercase letter' },
    ],
  },
  [C.BAD_REQUEST]: {
    status: 400,
    meaning:
      'The request is malformed, e.g. a field name containing `$` or `.`, or a value of the wrong type.',
    message: 'Field name "$gt" is not allowed',
  },
  [C.INVALID_JSON]: {
    status: 400,
    meaning: 'The request body is not valid JSON.',
    message: 'The request body is not valid JSON',
  },
  [C.PAYLOAD_TOO_LARGE]: {
    status: 413,
    meaning: 'The JSON body is larger than 16 KB.',
    message: 'The request body is too large',
  },
  [C.NOT_FOUND]: {
    status: 404,
    meaning: 'The route or the record does not exist (or does not belong to the caller).',
    message: 'Not found',
  },
  [C.CONFLICT]: {
    status: 409,
    meaning: 'The change conflicts with the current state, e.g. a duplicate or a concurrent edit.',
    message: 'This record already exists',
  },
  [C.RATE_LIMITED]: {
    status: 429,
    meaning: 'Too many requests from this IP; wait `Retry-After` seconds.',
    message: 'Too many requests. Please wait a moment and try again.',
    meta: { retryAfterSeconds: 900 },
  },
  [C.INTERNAL_ERROR]: {
    status: 500,
    meaning: 'Unexpected server error. Quote `requestId` when reporting it.',
    message: 'Something went wrong on our side. Please try again.',
  },

  // ---- authentication and account state ----
  [C.INVALID_CREDENTIALS]: {
    status: 401,
    meaning: 'Wrong email or password; `meta.attemptsLeft` counts down to the lockout.',
    message: 'Email or password is incorrect.',
    meta: { attemptsLeft: 4 },
  },
  [C.EMAIL_TAKEN]: {
    status: 409,
    meaning: 'An account with this email already exists.',
    message: 'An account with this email already exists.',
  },
  [C.ACCOUNT_LOCKED]: {
    status: 429,
    meaning: 'Five failed sign-ins in a row: the email is locked for 15 minutes.',
    message: 'Too many failed attempts. Try again in 15 minutes.',
    meta: { retryAfterSeconds: 900 },
  },
  [C.ACCOUNT_INACTIVE]: {
    status: 403,
    meaning: 'An administrator set the account to inactive.',
    message: 'Your account is inactive.',
    meta: { reason: 'Account paused at the customer’s request', supportEmail: SUPPORT },
  },
  [C.ACCOUNT_BLOCKED]: {
    status: 403,
    meaning: 'An administrator blocked the account.',
    message: 'Your access has been blocked by an administrator.',
    meta: { reason: 'Repeated chargebacks', supportEmail: SUPPORT },
  },
  [C.ACCOUNT_ACCESS_EXPIRED]: {
    status: 403,
    meaning: 'The account’s “access until” date has passed.',
    message: 'Your access expired on 1 Oct 2026.',
    meta: {
      expiredAt: '2026-09-30T18:30:00.000Z',
      reason: 'Trial access ended',
      supportEmail: SUPPORT,
    },
  },
  [C.UNAUTHORIZED]: {
    status: 401,
    meaning: 'No `Authorization: Bearer` access token was sent.',
    message: 'Please sign in to continue',
  },
  [C.TOKEN_EXPIRED]: {
    status: 401,
    meaning: 'The access token has expired; call `POST /auth/refresh` and retry.',
    message: 'Your session has expired',
  },
  [C.INVALID_TOKEN]: {
    status: 401,
    meaning: 'The access token is malformed, forged or belongs to a deleted user.',
    message: 'Your session is not valid',
  },
  [C.SESSION_EXPIRED]: {
    status: 401,
    meaning:
      'The session was revoked or the refresh token is missing, expired or reused; sign in again. `meta.retry: true` means another tab just rotated the cookie: retry once.',
    message: 'Your session has ended. Please sign in again.',
  },
  [C.FORBIDDEN]: {
    status: 403,
    meaning:
      'The caller’s role may not use this operation, the CSRF header is missing, or the Origin is not allowed.',
    message: 'You do not have permission to do this',
  },
  [C.WRONG_PASSWORD]: {
    status: 400,
    meaning: 'The current password given for a password change is wrong.',
    message: 'Your current password is not correct.',
    details: [{ field: 'currentPassword', message: 'Your current password is not correct' }],
  },

  // ---- encrypted envelope ----
  [C.ENCRYPTION_REQUIRED]: {
    status: 400,
    meaning: 'Encryption is required (production) but the request has no `x-enc-session`.',
    message: 'This API only accepts encrypted requests',
  },
  [C.INVALID_PAYLOAD]: {
    status: 400,
    meaning:
      'The envelope headers or sealed body could not be read (bad key, wrong AAD, tampered bytes).',
    message: 'The request could not be read',
  },
  [C.REPLAYED_REQUEST]: {
    status: 409,
    meaning: 'An encrypted mutating request reused a nonce that was already processed.',
    message: 'This request was already processed',
  },
  [C.STALE_REQUEST]: {
    status: 400,
    meaning:
      '`x-enc-ts` is more than 2 minutes from server time; `meta.serverTime` lets the client correct its clock and retry.',
    message: 'Request expired. Check your device clock.',
    meta: { serverTime: 1792229400000 },
  },
  [C.UNKNOWN_KEY]: {
    status: 400,
    meaning: '`x-enc-kid` names a server key that is not current; reload the client.',
    message: 'Encryption key is out of date. Reload the page.',
  },

  // ---- subscriptions, payments, limits ----
  [C.PLAN_NOT_FOUND]: {
    status: 404,
    meaning: 'No plan has this id.',
    message: 'That plan does not exist',
  },
  [C.PLAN_INACTIVE]: {
    status: 400,
    meaning: 'The plan is archived and can no longer be bought or assigned.',
    message: 'That plan is no longer available',
  },
  [C.ALREADY_SUBSCRIBED]: {
    status: 409,
    meaning: 'The user is already on this plan (renew or extend it instead).',
    message: 'You are already on the Pro plan.',
  },
  [C.NO_ACTIVE_SUBSCRIPTION]: {
    status: 400,
    meaning: 'The operation needs an active plan and there is none.',
    message: 'You have no active plan to cancel.',
  },
  [C.PAYMENT_FAILED]: {
    status: 400,
    meaning: 'This checkout was already marked as failed or closed; start a new one.',
    message: 'This checkout was closed. Start a new one from Plans.',
  },
  [C.PAYMENT_VERIFICATION_FAILED]: {
    status: 400,
    meaning: 'The Razorpay signature does not match the order and payment ids.',
    message: 'We could not verify this payment.',
  },
  [C.GATEWAY_ERROR]: {
    status: 502,
    meaning: 'Razorpay could not be reached or refused to create the order.',
    message: 'The payment service is not responding. Please try again.',
  },
  [C.PLAN_LIMIT_REACHED]: {
    status: 403,
    meaning: 'The plan’s project or team-member limit is used up; `meta` has the numbers.',
    message: "You've reached the Starter limit of 3 projects.",
    meta: { key: 'projects', limit: 3, used: 3, plan: 'Starter' },
  },
  [C.READ_ONLY]: {
    status: 403,
    meaning: 'No active plan: the workspace can be viewed and cleaned up, not changed.',
    message: 'Your workspace is read-only. Renew a plan to make changes.',
  },

  // ---- admin guard rails ----
  [C.SELF_ACTION_FORBIDDEN]: {
    status: 403,
    meaning: 'Administrators cannot change their own status or role.',
    message: 'You cannot change your own account status',
  },
  [C.LAST_ADMIN]: {
    status: 409,
    meaning: 'The change would leave no active administrator.',
    message: 'At least one active admin must remain',
  },
  [C.PLAN_IN_USE]: {
    status: 409,
    meaning:
      'Reserved. Not returned today: deleting a plan with subscription history archives it instead.',
    message: 'This plan has subscribers',
  },
};

export const ERROR_CODE_LIST = Object.keys(ERROR_CATALOGUE) as ErrorCode[];

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad request.',
  401: 'Not signed in, or the session is no longer valid.',
  403: 'Forbidden.',
  404: 'Not found.',
  409: 'Conflict.',
  413: 'Payload too large.',
  422: 'Validation failed.',
  429: 'Too many requests.',
  500: 'Internal server error.',
  502: 'Payment gateway error.',
};

/** Error example components, one per code, referenced by every error response. */
export const errorExamples: Record<string, OpenAPIV3_1.ExampleObject> = Object.fromEntries(
  ERROR_CODE_LIST.map((code) => {
    const info = ERROR_CATALOGUE[code];
    return [
      code,
      {
        summary: `${info.status} ${code}`,
        value: {
          success: false,
          error: {
            code,
            message: info.message,
            ...(info.details ? { details: info.details } : {}),
            ...(info.meta ? { meta: info.meta } : {}),
            requestId: '3f2c9a1e-7b4d-4c8e-9f60-2a5d8e1b7c34',
          },
        },
      },
    ];
  }),
);

/** A code, or a code plus what it means for this particular operation. */
export type ErrorSpec = ErrorCode | readonly [ErrorCode, string];

const rateLimitHeaders = {
  'Retry-After': headerRef('RetryAfter'),
  RateLimit: headerRef('RateLimit'),
  'RateLimit-Policy': headerRef('RateLimitPolicy'),
};

function inlineResponse(status: number, specs: ErrorSpec[]): OpenAPIV3_1.ResponseObject {
  const lines = specs.map((spec) => {
    const [code, note] = typeof spec === 'string' ? [spec, undefined] : spec;
    return `- \`${code}\`: ${note ?? ERROR_CATALOGUE[code].meaning}`;
  });
  const codes = [...new Set(specs.map((spec) => (typeof spec === 'string' ? spec : spec[0])))];
  return {
    description: `${STATUS_TITLES[status] ?? 'Error.'}\n\n${lines.join('\n')}`,
    ...(status === 429 ? { headers: rateLimitHeaders } : {}),
    content: {
      'application/json': {
        schema: schemaRef('ErrorResponse'),
        examples: Object.fromEntries(codes.map((code) => [code, exampleRef(code)])),
      },
    },
  };
}

/**
 * Shared error responses. An operation whose codes for a status are exactly one of
 * these sets references the component instead of repeating it inline.
 */
const SHARED: Record<string, { status: number; codes: ErrorCode[] }> = {
  BadRequest: {
    status: 400,
    codes: [
      C.BAD_REQUEST,
      C.INVALID_JSON,
      C.ENCRYPTION_REQUIRED,
      C.UNKNOWN_KEY,
      C.INVALID_PAYLOAD,
      C.STALE_REQUEST,
    ],
  },
  Unauthorized: {
    status: 401,
    codes: [C.UNAUTHORIZED, C.TOKEN_EXPIRED, C.INVALID_TOKEN, C.SESSION_EXPIRED],
  },
  AccountRestricted: {
    status: 403,
    codes: [C.ACCOUNT_BLOCKED, C.ACCOUNT_INACTIVE, C.ACCOUNT_ACCESS_EXPIRED],
  },
  Forbidden: {
    status: 403,
    codes: [C.FORBIDDEN, C.ACCOUNT_BLOCKED, C.ACCOUNT_INACTIVE, C.ACCOUNT_ACCESS_EXPIRED],
  },
  NotFound: { status: 404, codes: [C.NOT_FOUND] },
  Replayed: { status: 409, codes: [C.REPLAYED_REQUEST] },
  PayloadTooLarge: { status: 413, codes: [C.PAYLOAD_TOO_LARGE] },
  ValidationFailed: { status: 422, codes: [C.VALIDATION_ERROR] },
  RateLimited: { status: 429, codes: [C.RATE_LIMITED] },
  InternalError: { status: 500, codes: [C.INTERNAL_ERROR] },
};

export const sharedErrorResponses: Record<string, OpenAPIV3_1.ResponseObject> = Object.fromEntries(
  Object.entries(SHARED).map(([name, { status, codes }]) => [name, inlineResponse(status, codes)]),
);

const sameCodes = (a: ErrorCode[], b: ErrorCode[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Groups error codes by HTTP status into responses, reusing shared components where possible. */
export function errorResponses(specs: ErrorSpec[]): Record<string, Response> {
  const byStatus = new Map<number, ErrorSpec[]>();
  for (const spec of specs) {
    const code = typeof spec === 'string' ? spec : spec[0];
    const status = ERROR_CATALOGUE[code].status;
    const list = byStatus.get(status) ?? [];
    // A code given with a note replaces the same code given without one.
    const existing = list.findIndex((s) => (typeof s === 'string' ? s : s[0]) === code);
    if (existing === -1) list.push(spec);
    else if (typeof spec !== 'string') list[existing] = spec;
    byStatus.set(status, list);
  }

  const responses: Record<string, Response> = {};
  for (const status of [...byStatus.keys()].sort((a, b) => a - b)) {
    const list = byStatus.get(status) ?? [];
    const plainCodes = list.every((s) => typeof s === 'string') ? (list as ErrorCode[]) : null;
    const shared = plainCodes
      ? Object.entries(SHARED).find(
          ([, set]) => set.status === status && sameCodes(set.codes, plainCodes),
        )
      : undefined;
    responses[String(status)] = shared ? responseRef(shared[0]) : inlineResponse(status, list);
  }
  return responses;
}

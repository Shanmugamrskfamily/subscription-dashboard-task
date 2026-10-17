import {
  ADMIN_RANGES,
  CHANGE_TYPES,
  PAGE_SIZES,
  ROLES,
  SUBSCRIPTION_SORTS,
  SUBSCRIPTION_STATUSES,
  USER_SORTS,
  USER_STATUSES,
} from '@planpilot/shared';
import { ENC_HEADERS } from '@planpilot/shared/crypto';
import type { OpenAPIV3_1 } from 'openapi-types';

export const OBJECT_ID_PATTERN = '^[a-fA-F0-9]{24}$';

type ParameterObject = OpenAPIV3_1.ParameterObject;

const objectIdPath = (description: string, example: string): ParameterObject => ({
  name: 'id',
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', pattern: OBJECT_ID_PATTERN },
  example,
});

const query = (
  name: string,
  description: string,
  schema: ParameterObject['schema'],
  example?: unknown,
): ParameterObject => ({
  name,
  in: 'query',
  required: false,
  description,
  schema,
  ...(example !== undefined ? { example } : {}),
});

const encHeader = (name: string, description: string, pattern: string): ParameterObject => ({
  name,
  in: 'header',
  required: false,
  description: `${description} Part of the encrypted envelope: required on every request when \`ENCRYPTION_REQUIRED\` is on (production); leave empty for plaintext in local development.`,
  schema: { type: 'string', pattern },
});

export const parameters: Record<string, ParameterObject> = {
  // ---- path ----
  PlanId: {
    name: 'planId',
    in: 'path',
    required: true,
    description: 'Id of the plan to subscribe or switch to.',
    schema: { type: 'string', pattern: OBJECT_ID_PATTERN },
    example: '66f1a2b3c4d5e6f708192a02',
  },
  OrderId: {
    name: 'orderId',
    in: 'path',
    required: true,
    description: 'Razorpay order id returned in `checkout.orderId`.',
    schema: { type: 'string', pattern: '^order_[A-Za-z0-9]{6,40}$' },
    example: 'order_Q7xK2mP9vB4nL1',
  },
  SessionId: {
    name: 'id',
    in: 'path',
    required: true,
    description: 'Session id from `GET /me/sessions` (a UUID naming the refresh-token family).',
    schema: { type: 'string', format: 'uuid', pattern: '^[0-9a-fA-F-]{36}$' },
    example: '0b7c6f2e-5d1a-4e8b-9c3f-7a2d6e4b1f90',
  },
  NotificationId: objectIdPath('Notification id.', '6703a9b8c7d6e5f4a3b2c101'),
  ProjectId: objectIdPath('Project id.', '6703b1c2d3e4f5a6b7c8d901'),
  TeamMemberId: objectIdPath('Team member id.', '6703b1c2d3e4f5a6b7c8da01'),
  SubscriptionId: objectIdPath('Subscription id.', '6702c4d5e6f7a8b9c0d1e2f3'),
  UserId: objectIdPath('User id.', '66f1b7c8d9e0f1a2b3c4d501'),
  AdminPlanId: objectIdPath('Plan id.', '66f1a2b3c4d5e6f708192a02'),

  // ---- query ----
  Page: query(
    'page',
    '1-based page number.',
    { type: 'integer', minimum: 1, maximum: 10_000, default: 1 },
    1,
  ),
  PageSize: query('pageSize', 'Rows per page.', {
    type: 'integer',
    enum: [...PAGE_SIZES],
    default: PAGE_SIZES[0],
  }),
  Search: query(
    'search',
    'Case-insensitive match on the name or email of the user (for subscriptions: of the subscriber).',
    { type: 'string', maxLength: 80, default: '' },
  ),
  Unread: query('unread', 'Only unread notifications.', { type: 'boolean', default: false }),
  StatsRange: query(
    'range',
    'Reporting window: the last 7, 30 or 90 days (daily buckets) or 12 months (monthly buckets), compared with the window before it.',
    { type: 'string', enum: [...ADMIN_RANGES], default: '30d' },
  ),
  SubscriptionStatusFilter: query('status', 'Subscription status.', {
    type: 'string',
    enum: [...SUBSCRIPTION_STATUSES, 'all'],
    default: 'all',
  }),
  PlanIdFilter: query('planId', 'Only subscriptions to this plan.', {
    type: 'string',
    pattern: OBJECT_ID_PATTERN,
  }),
  ChangeTypeFilter: query('changeType', 'How the subscription started.', {
    type: 'string',
    enum: [...CHANGE_TYPES, 'all'],
    default: 'all',
  }),
  FromDate: query(
    'from',
    'Only subscriptions that started on or after this date.',
    { type: 'string', format: 'date' },
    '2026-09-01',
  ),
  ToDate: query(
    'to',
    'Only subscriptions that started on or before this date (inclusive, to the end of that day). Must not be before `from`.',
    { type: 'string', format: 'date' },
    '2026-10-17',
  ),
  SubscriptionSort: query('sort', 'Sort field; a leading `-` sorts descending.', {
    type: 'string',
    enum: [...SUBSCRIPTION_SORTS],
    default: '-createdAt',
  }),
  ExportFormat: query(
    'format',
    '`json` returns a page of rows; `csv` returns the whole filtered list (up to 5,000 rows) as CSV text inside the JSON envelope, ignoring `page` and `pageSize`.',
    { type: 'string', enum: ['json', 'csv'], default: 'json' },
  ),
  RoleFilter: query('role', 'Account role.', {
    type: 'string',
    enum: [...ROLES, 'all'],
    default: 'all',
  }),
  UserStatusFilter: query('status', 'Account status.', {
    type: 'string',
    enum: [...USER_STATUSES, 'all'],
    default: 'all',
  }),
  SubscriptionFilter: query(
    'subscription',
    '`active`: has an active plan now. `expired` / `cancelled`: the latest subscription has that status. `none`: never subscribed.',
    { type: 'string', enum: [...SUBSCRIPTION_STATUSES, 'none', 'all'], default: 'all' },
  ),
  UserSort: query('sort', 'Sort field; a leading `-` sorts descending.', {
    type: 'string',
    enum: [...USER_SORTS],
    default: '-createdAt',
  }),

  // ---- headers ----
  RequestedWith: {
    name: 'X-Requested-With',
    in: 'header',
    required: true,
    description:
      'CSRF guard for the cookie-authenticated routes. Must be exactly `planpilot`; a cross-site form cannot set custom headers.',
    schema: { type: 'string', enum: ['planpilot'], default: 'planpilot' },
  },
  EncSession: encHeader(
    ENC_HEADERS.session,
    'The browser tab’s ephemeral ECDH P-256 public key, raw (65 bytes, uncompressed point) in base64.',
    '^[A-Za-z0-9+/]{87}=$',
  ),
  EncKid: encHeader(
    ENC_HEADERS.kid,
    'Id of the server key pair the client derived its key from (e.g. `k1`). A stale id returns `400 UNKNOWN_KEY`.',
    '^[a-z0-9-]{1,16}$',
  ),
  EncTimestamp: encHeader(
    ENC_HEADERS.ts,
    'Client time in Unix milliseconds (13 digits). Must be within ±2 minutes of server time.',
    '^\\d{13}$',
  ),
  EncNonce: encHeader(
    ENC_HEADERS.nonce,
    '16 random bytes in base64, unique per request. Bound into the AAD and remembered for mutating requests to stop replays.',
    '^[A-Za-z0-9+/]{22}==$',
  ),
};

/** Optional envelope headers, listed on every operation that passes through the envelope middleware. */
export const ENVELOPE_PARAMETERS = ['EncSession', 'EncKid', 'EncTimestamp', 'EncNonce'];

export const headers: Record<string, OpenAPIV3_1.HeaderObject> = {
  XRequestId: {
    description:
      'Request id: your own `X-Request-Id` (8–64 letters, digits or hyphens) or a fresh UUID. Also in `error.requestId`.',
    schema: { type: 'string' },
    example: '3f2c9a1e-7b4d-4c8e-9f60-2a5d8e1b7c34',
  },
  XEnc: {
    description:
      'Present with value `1` when the body is a sealed envelope (the request opened an encrypted session). Sealed responses are also `Cache-Control: no-store`.',
    schema: { type: 'string', enum: ['1'] },
  },
  RateLimit: {
    description: 'Remaining requests and seconds until the window resets (IETF draft-8 format).',
    schema: { type: 'string' },
    example: '"600-in-15min"; r=598; t=840',
  },
  RateLimitPolicy: {
    description: 'The limit and window that apply (IETF draft-8 format).',
    schema: { type: 'string' },
    example: '"600-in-15min"; q=600; w=900; pk=:a1b2c3d4e5f6:',
  },
  RetryAfter: {
    description: 'Seconds to wait before trying again.',
    schema: { type: 'integer', minimum: 1 },
    example: 900,
  },
  SetRefreshCookie: {
    description:
      'Sets the rotated refresh token: `pp_rt` in development, `__Host-pp_rt` in production. `HttpOnly; SameSite=Strict; Path=/` (plus `Secure` in production), expires with the session (7 days by default).',
    schema: { type: 'string' },
    example: 'pp_rt=9Jx2kQ...; Max-Age=604800; Path=/; HttpOnly; SameSite=Strict',
  },
  ClearRefreshCookie: {
    description: 'Clears the refresh cookie.',
    schema: { type: 'string' },
    example: 'pp_rt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict',
  },
};

export const securitySchemes: Record<string, OpenAPIV3_1.SecuritySchemeObject> = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Access token from `data.accessToken` of register, login or refresh. HS256 JWT, valid 15 minutes by default. Role and account status are re-checked against the database on every request.',
  },
  refreshCookie: {
    type: 'apiKey',
    in: 'cookie',
    name: 'pp_rt',
    description:
      'Opaque refresh token in an HttpOnly cookie, set by register, login and refresh. Named `pp_rt` in development and `__Host-pp_rt` in production. The browser sends it automatically on this page after you sign in; it cannot be typed in here. Rotated on every refresh.',
  },
};

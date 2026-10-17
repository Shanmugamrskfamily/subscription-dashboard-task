import { ERROR_CODES } from '@planpilot/shared';
import type { ErrorCode, PageMeta, Role } from '@planpilot/shared';
import type { OpenAPIV3_1 } from 'openapi-types';
import { ENVELOPE_PARAMETERS } from './components';
import { errorResponses } from './errors';
import type { ErrorSpec } from './errors';
import { envelope, headerRef, parameterRef } from './refs';
import type { Example, Header, Operation, Parameter, Schema } from './refs';

const C = ERROR_CODES;

/** The rate-limit buckets of `middlewares/rate-limit.ts`, for descriptions and the overview table. */
export const RATE_LIMITS = {
  api: {
    limit: '600 requests per IP per 15 minutes',
    scope: 'every `/api` operation except `/health`, `/openapi.json` and `/docs`',
  },
  auth: {
    limit: '20 failed attempts per IP per 15 minutes (successful requests do not count)',
    scope: '`POST /auth/register`, `POST /auth/login`',
  },
  refresh: { limit: '120 requests per IP per 15 minutes', scope: '`POST /auth/refresh`' },
  payments: {
    limit: '40 requests per IP per 15 minutes',
    scope: '`POST /subscribe/{planId}`, `POST /payments/verify`',
  },
} as const;

export type Access =
  | { kind: 'public' }
  | { kind: 'bearer'; roles: Role[] }
  | { kind: 'refreshCookie'; optional?: boolean };

export const PUBLIC: Access = { kind: 'public' };
export const CUSTOMER: Access = { kind: 'bearer', roles: ['user'] };
export const ADMIN: Access = { kind: 'bearer', roles: ['admin'] };
export const SIGNED_IN: Access = { kind: 'bearer', roles: ['user', 'admin'] };

export interface SuccessSpec {
  status?: number;
  description: string;
  /** Schema of `data` inside the `{ success: true, data }` envelope. */
  data?: Schema;
  /** Whole-body schema, for the few responses that are not the standard envelope. */
  body?: Schema;
  paged?: boolean;
  /** Example of `data`; wrapped in the envelope automatically. */
  example?: unknown;
  metaExample?: PageMeta;
  /** Named whole-body examples (used instead of `example`). */
  examples?: Record<string, Example>;
  headers?: Record<string, Header>;
}

export interface OperationSpec {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  /** Path relative to the `/api` server URL, with `{param}` templates. */
  path: string;
  operationId: string;
  tag: string;
  summary: string;
  description?: string;
  access: Access;
  /** Served before the rate limiter and the envelope middleware (health and docs). */
  plain?: boolean;
  limiter?: 'auth' | 'refresh' | 'payments';
  parameters?: Parameter[];
  body?: {
    schema: Schema;
    required?: boolean;
    description?: string;
    example?: unknown;
    examples?: Record<string, Example>;
  };
  /** Whether input is checked by a schema (422 possible). Defaults to "has a body or parameters". */
  validated?: boolean;
  success: SuccessSpec | SuccessSpec[];
  /** Error codes specific to this operation; the generic ones are added automatically. */
  errors?: ErrorSpec[];
}

export interface BuiltOperation {
  path: string;
  method: OperationSpec['method'];
  operation: Operation;
}

const ACCOUNT_STATE: ErrorCode[] = [
  C.ACCOUNT_BLOCKED,
  C.ACCOUNT_INACTIVE,
  C.ACCOUNT_ACCESS_EXPIRED,
];

function accessNote(access: Access): string {
  switch (access.kind) {
    case 'public':
      return '**Access:** public, no sign-in needed.';
    case 'refreshCookie':
      return access.optional
        ? '**Access:** the refresh cookie if present, plus `X-Requested-With: planpilot`.'
        : '**Access:** the refresh cookie plus `X-Requested-With: planpilot` (no access token).';
    case 'bearer':
      if (access.roles.length > 1) return '**Access:** any signed-in user (customer or admin).';
      return access.roles[0] === 'admin'
        ? '**Access:** administrators only (role `admin`); customers get `403 FORBIDDEN`.'
        : '**Access:** customers only (role `user`); administrators get `403 FORBIDDEN`.';
  }
}

function security(access: Access): OpenAPIV3_1.SecurityRequirementObject[] {
  switch (access.kind) {
    case 'public':
      return [];
    case 'refreshCookie':
      return access.optional ? [{ refreshCookie: [] }, {}] : [{ refreshCookie: [] }];
    case 'bearer':
      return [{ bearerAuth: [] }];
  }
}

function successResponse(spec: SuccessSpec, plain: boolean): OpenAPIV3_1.ResponseObject {
  const schema = spec.body ?? envelope(spec.data ?? { type: 'object' }, spec.paged);
  const media: OpenAPIV3_1.MediaTypeObject = { schema };
  if (spec.examples) media.examples = spec.examples;
  else if (spec.example !== undefined) {
    media.example = spec.body
      ? spec.example
      : {
          success: true,
          data: spec.example,
          ...(spec.paged && spec.metaExample ? { meta: spec.metaExample } : {}),
        };
  }
  return {
    description: spec.description,
    headers: {
      'X-Request-Id': headerRef('XRequestId'),
      ...(plain
        ? {}
        : {
            'x-enc': headerRef('XEnc'),
            RateLimit: headerRef('RateLimit'),
            'RateLimit-Policy': headerRef('RateLimitPolicy'),
          }),
      ...spec.headers,
    },
    content: { 'application/json': media },
  };
}

/** Turns a compact spec into a full operation with the generic error responses filled in. */
export function defineOperation(spec: OperationSpec): BuiltOperation {
  const plain = spec.plain ?? false;
  const parameters: Parameter[] = [
    ...(spec.parameters ?? []),
    ...(plain ? [] : ENVELOPE_PARAMETERS.map(parameterRef)),
  ];
  const validated = spec.validated ?? Boolean(spec.body || spec.parameters?.length);

  const errors: ErrorSpec[] = [];
  if (plain) errors.push(C.INTERNAL_ERROR);
  else {
    errors.push(
      C.BAD_REQUEST,
      C.INVALID_JSON,
      C.ENCRYPTION_REQUIRED,
      C.UNKNOWN_KEY,
      C.INVALID_PAYLOAD,
      C.STALE_REQUEST,
      C.RATE_LIMITED,
      C.INTERNAL_ERROR,
    );
    if (spec.method !== 'get') errors.push(C.REPLAYED_REQUEST);
  }
  if (spec.body) errors.push(C.PAYLOAD_TOO_LARGE);
  if (validated) errors.push(C.VALIDATION_ERROR);
  if (spec.access.kind === 'bearer') {
    errors.push(C.UNAUTHORIZED, C.TOKEN_EXPIRED, C.INVALID_TOKEN, C.SESSION_EXPIRED);
    if (spec.access.roles.length === 1) errors.push(C.FORBIDDEN);
    errors.push(...ACCOUNT_STATE);
  }
  errors.push(...(spec.errors ?? []));

  const successes = Array.isArray(spec.success) ? spec.success : [spec.success];
  const notes = [
    spec.description,
    accessNote(spec.access),
    spec.limiter
      ? `**Rate limit:** \`${spec.limiter}\` bucket, ${RATE_LIMITS[spec.limiter].limit}, on top of the global limit.`
      : undefined,
    plain ? '**Plain JSON:** never encrypted and not rate limited.' : undefined,
  ];

  const operation: Operation = {
    operationId: spec.operationId,
    tags: [spec.tag],
    summary: spec.summary,
    description: notes.filter(Boolean).join('\n\n'),
    security: security(spec.access),
    ...(parameters.length ? { parameters } : {}),
    ...(spec.body
      ? {
          requestBody: {
            required: spec.body.required ?? true,
            ...(spec.body.description ? { description: spec.body.description } : {}),
            content: {
              'application/json': {
                schema: spec.body.schema,
                ...(spec.body.example !== undefined ? { example: spec.body.example } : {}),
                ...(spec.body.examples ? { examples: spec.body.examples } : {}),
              },
            },
          },
        }
      : {}),
    responses: {
      ...Object.fromEntries(
        successes.map((s) => [String(s.status ?? 200), successResponse(s, plain)]),
      ),
      ...errorResponses(errors),
    },
    ...(spec.access.kind === 'bearer' ? { 'x-roles': spec.access.roles } : {}),
  };
  return { path: spec.path, method: spec.method, operation };
}

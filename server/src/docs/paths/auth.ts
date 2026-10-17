import { ERROR_CODES as C } from '@planpilot/shared';
import * as ex from '../examples';
import { PUBLIC, SIGNED_IN, defineOperation } from '../operation';
import { flagResult, headerRef, parameterRef, schemaRef } from '../refs';

const ACCOUNT_RESTRICTED_AT_LOGIN =
  'An administrator restricted the account. Only revealed after the correct password, so strangers learn nothing; `meta` has the reason and the support email.';

export const authOperations = [
  defineOperation({
    method: 'post',
    path: '/auth/register',
    operationId: 'register',
    tag: 'Auth',
    summary: 'Create an account',
    description:
      'Creates a customer account, signs it in and sets the refresh cookie. New accounts start without a plan (read-only workspace) and get a welcome notification.',
    access: PUBLIC,
    limiter: 'auth',
    body: {
      schema: schemaRef('RegisterRequest'),
      example: { name: 'Priya Sharma', email: 'priya.sharma@example.com', password: 'Secure123' },
    },
    success: {
      status: 201,
      description: 'Account created and signed in.',
      data: schemaRef('AuthSession'),
      example: {
        ...ex.authSession,
        user: { ...ex.user, email: 'priya.sharma@example.com', createdAt: ex.user.lastSeenAt },
      },
      headers: { 'Set-Cookie': headerRef('SetRefreshCookie') },
    },
    errors: [C.EMAIL_TAKEN],
  }),

  defineOperation({
    method: 'post',
    path: '/auth/login',
    operationId: 'login',
    tag: 'Auth',
    summary: 'Sign in',
    description:
      'Checks the email and password, returns an access token and sets the refresh cookie. Five wrong passwords in a row lock the email for 15 minutes; unknown emails get exactly the same responses.',
    access: PUBLIC,
    limiter: 'auth',
    body: {
      schema: schemaRef('LoginRequest'),
      examples: {
        customer: {
          summary: 'Demo customer',
          value: { email: 'priya@planpilot.demo', password: 'Demo@12345' },
        },
        admin: {
          summary: 'Demo administrator',
          value: { email: 'admin@planpilot.demo', password: 'Admin@12345' },
        },
      },
    },
    success: {
      description: 'Signed in.',
      data: schemaRef('AuthSession'),
      example: ex.authSession,
      headers: { 'Set-Cookie': headerRef('SetRefreshCookie') },
    },
    errors: [
      C.INVALID_CREDENTIALS,
      C.ACCOUNT_LOCKED,
      [C.ACCOUNT_BLOCKED, ACCOUNT_RESTRICTED_AT_LOGIN],
      [C.ACCOUNT_INACTIVE, ACCOUNT_RESTRICTED_AT_LOGIN],
      [C.ACCOUNT_ACCESS_EXPIRED, ACCOUNT_RESTRICTED_AT_LOGIN],
    ],
  }),

  defineOperation({
    method: 'post',
    path: '/auth/refresh',
    operationId: 'refreshSession',
    tag: 'Auth',
    summary: 'Get a new access token',
    description:
      'Rotates the refresh cookie and returns a fresh access token. The presented refresh token is revoked; presenting it again later revokes the whole session (reuse detection). Call it shortly before `accessTokenExpiresAt`, or after a `401 TOKEN_EXPIRED`.',
    access: { kind: 'refreshCookie' },
    limiter: 'refresh',
    parameters: [parameterRef('RequestedWith')],
    validated: false,
    success: {
      description: 'New access token; the refresh cookie was rotated.',
      data: schemaRef('AuthSession'),
      example: ex.authSession,
      headers: { 'Set-Cookie': headerRef('SetRefreshCookie') },
    },
    errors: [
      [
        C.SESSION_EXPIRED,
        'The cookie is missing, expired, revoked or reused (reuse revokes the whole session), and is cleared. With `meta.retry: true` another tab rotated it a moment ago: retry once, the cookie is kept.',
      ],
      [
        C.FORBIDDEN,
        'The `X-Requested-With: planpilot` header is missing or the `Origin` is not allowed.',
      ],
      [C.ACCOUNT_BLOCKED, 'The account was restricted since sign-in; the session is revoked.'],
      [C.ACCOUNT_INACTIVE, 'The account was restricted since sign-in; the session is revoked.'],
      [C.ACCOUNT_ACCESS_EXPIRED, 'The access date has passed; the session is revoked.'],
    ],
  }),

  defineOperation({
    method: 'post',
    path: '/auth/logout',
    operationId: 'logout',
    tag: 'Auth',
    summary: 'Sign out',
    description:
      'Revokes the session the refresh cookie belongs to and clears the cookie. Access tokens of that session stop working at once. Succeeds without a cookie too, so it is safe to call twice.',
    access: { kind: 'refreshCookie', optional: true },
    parameters: [parameterRef('RequestedWith')],
    validated: false,
    success: {
      description: 'Signed out.',
      data: flagResult('loggedOut', 'Always true.'),
      example: { loggedOut: true },
      headers: { 'Set-Cookie': headerRef('ClearRefreshCookie') },
    },
    errors: [
      [
        C.FORBIDDEN,
        'The `X-Requested-With: planpilot` header is missing or the `Origin` is not allowed.',
      ],
    ],
  }),

  defineOperation({
    method: 'get',
    path: '/auth/me',
    operationId: 'getCurrentUser',
    tag: 'Auth',
    summary: 'Who am I',
    description: 'The signed-in user, read fresh from the database.',
    access: SIGNED_IN,
    success: { description: 'The signed-in user.', data: schemaRef('User'), example: ex.user },
  }),
];

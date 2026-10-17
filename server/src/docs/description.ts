import { ENC_HEADERS, MAX_CLOCK_SKEW_MS } from '@planpilot/shared/crypto';
import { ERROR_CATALOGUE, ERROR_CODE_LIST } from './errors';
import { RATE_LIMITS } from './operation';

const skewMinutes = MAX_CLOCK_SKEW_MS / 60_000;

const errorTable = [
  '| Code | HTTP | Meaning |',
  '| --- | --- | --- |',
  ...ERROR_CODE_LIST.map((code) => {
    const { status, meaning } = ERROR_CATALOGUE[code];
    return `| \`${code}\` | ${status} | ${meaning} |`;
  }),
].join('\n');

const rateLimitTable = [
  '| Bucket | Applies to | Limit |',
  '| --- | --- | --- |',
  ...Object.entries(RATE_LIMITS).map(
    ([name, { scope, limit }]) => `| \`${name}\` | ${scope} | ${limit} |`,
  ),
].join('\n');

/** The `info.description` of the document (Markdown, rendered at the top of /api/docs). */
export const description = `
PlanPilot is a subscription management dashboard. Customers browse plans, subscribe or switch plans
(prorated, paid through Razorpay in test mode) and work in a small workspace of projects and team
members capped by their plan. Administrators manage plans, subscriptions and users, and follow
revenue and activity.

Every path below is relative to the server URL \`/api\`. The interactive console on this page
(\`/api/docs\`) sends real requests to this server; the raw document is at \`/api/openapi.json\`.

## Quick start

1. Call \`POST /auth/login\`. With the demo data loaded, \`priya@planpilot.demo\` / \`Demo@12345\` is a
   customer and \`admin@planpilot.demo\` / \`Admin@12345\` an administrator. Or register a new account.
2. Copy \`data.accessToken\` from the response, click **Authorize** and paste it into **bearerAuth**.
3. Call any operation. When the access token expires (15 minutes), call \`POST /auth/refresh\`: the
   browser sends the refresh cookie the login set.

"Try it out" sends plaintext JSON, which the server accepts only while \`ENCRYPTION_REQUIRED\` is
off, i.e. in local development (see *Encrypted envelope*).

## Money

All amounts are **integers in paise** (₹1 = 100 paise) and the currency is always INR:
\`79900\` is ₹799.00. Integer paise avoid floating-point rounding; format them only for display.

## Response envelope

- Success: \`{ "success": true, "data": …, "meta"?: { page, pageSize, total, totalPages } }\`.
- Error: \`{ "success": false, "error": { "code", "message", "details"?, "meta"?, "requestId" } }\`.
  - \`code\` is stable and listed below; switch on it, never on \`message\`.
  - \`details\` lists every failing field (\`[{ field, message }]\`) for \`422 VALIDATION_ERROR\`.
  - \`meta\` adds context, e.g. \`{ retryAfterSeconds }\`, \`{ attemptsLeft }\`, \`{ key, limit, used, plan }\`.
  - \`requestId\` equals the \`X-Request-Id\` response header. Send your own \`X-Request-Id\`
    (8–64 letters, digits or hyphens) to correlate a call with the server logs.

## Authentication

- **Access token.** A JWT (HS256, 15 minutes by default) returned as \`data.accessToken\` by
  register, login and refresh, with its expiry in \`data.accessTokenExpiresAt\`. Send it as
  \`Authorization: Bearer <token>\`. The web client keeps it in memory only, never in storage.
- **Refresh token.** An opaque random value in an \`HttpOnly\`, \`SameSite=Strict\` cookie on path
  \`/\`: \`pp_rt\` in development, \`__Host-pp_rt\` (also \`Secure\`) in production. It lasts 7 days by
  default and only its SHA-256 hash is stored.
- **Rotation with reuse detection.** Every \`POST /auth/refresh\` revokes the presented token and
  sets a new one. Presenting a token that was already rotated is treated as theft: the whole
  session (the token family) is revoked and the user must sign in again. A second tab racing the
  rotation within 30 seconds instead gets \`401 SESSION_EXPIRED\` with \`meta.retry: true\` and simply
  retries, because the browser already holds the new cookie.
- **CSRF guard.** The cookie-authenticated routes (\`POST /auth/refresh\`, \`POST /auth/logout\`) also
  require the header \`X-Requested-With: planpilot\`, and an \`Origin\` header, when present, must be
  an allowed client origin. Otherwise they return \`403 FORBIDDEN\`. A cross-site form cannot set a
  custom header, so this plus \`SameSite=Strict\` blocks CSRF. Browser requests from an origin that is
  not allowed are refused by CORS with \`403 FORBIDDEN\` on every route.
- **Live account checks.** Every authenticated request re-reads the user, so role, status and the
  "access until" date always come from the database. Blocking a user, changing their role or
  signing them out applies on their very next request (\`403 ACCOUNT_BLOCKED\`, \`ACCOUNT_INACTIVE\`,
  \`ACCOUNT_ACCESS_EXPIRED\`, or \`401 SESSION_EXPIRED\`).
- **Roles.** \`user\` (customer) and \`admin\`. Each operation states who may call it, also as
  \`x-roles\`; anyone else gets \`403 FORBIDDEN\`. Billing and workspace operations are for customers
  only, so administrators are refused there.
- **Sign-in lockout.** Five wrong passwords in a row lock the email for 15 minutes
  (\`429 ACCOUNT_LOCKED\` with \`Retry-After\`). Unknown emails behave identically, so responses never
  reveal which emails have accounts.

## Encrypted envelope

HTTPS protects the connection. On top of it, request and response bodies are encrypted end to end
between the browser tab and the API, so proxies, extensions and logs in between only see ciphertext
(defence in depth, not a replacement for TLS).

1. **Key agreement.** Each browser tab creates an ephemeral, non-extractable **ECDH P-256** key
   pair and combines it with the server's static public key, which ships in the web build together
   with its key id. Only a public key is in the bundle, so there is no shared secret to lift out of
   DevTools.
2. **Key derivation.** **HKDF-SHA-256** over the ECDH shared secret (salt: SHA-256 of the client
   and server public keys; info: \`planpilot/envelope/v1\`) yields an **AES-256-GCM** key. The
   server derives the same key from its private key and caches it per client key for 30 minutes.
3. **Headers.** Every request of an encrypted session carries:
   - \`${ENC_HEADERS.session}\`: the tab's raw P-256 public key (65 bytes), base64;
   - \`${ENC_HEADERS.kid}\`: id of the server key the client used, e.g. \`k1\` (a stale id returns
     \`400 UNKNOWN_KEY\`);
   - \`${ENC_HEADERS.ts}\`: client time in Unix milliseconds (13 digits);
   - \`${ENC_HEADERS.nonce}\`: 16 random bytes, base64, unique per request.

4. **Sealed body.** A request body, and every JSON response including errors, is replaced by
   \`{ "v": 1, "iv": "<base64 12-byte IV>", "ct": "<base64 ciphertext + 16-byte GCM tag>" }\`
   (schema \`EncryptedEnvelope\`), with a fresh random IV per message. The plaintext inside is
   exactly the JSON this document describes.
5. **AAD binding.** The additional authenticated data ties each ciphertext to its exact call:
   \`req|METHOD|/api/path|ts|nonce\` for a request and \`res|nonce|status\` for its response. A sealed
   body cannot be moved to another route, method or time, and a response only opens for the request
   that asked for it.
6. **Freshness and replay.** \`${ENC_HEADERS.ts}\` must be within ±${skewMinutes} minutes of server time,
   otherwise \`400 STALE_REQUEST\` with \`meta.serverTime\`, so the client can correct its clock and
   retry once. Nonces of mutating requests (POST, PUT, PATCH, DELETE) are kept in a replay cache for
   about 5 minutes; a repeat returns \`409 REPLAYED_REQUEST\`.
7. **Responses** of an encrypted session carry the header \`${ENC_HEADERS.response}: 1\` and
   \`Cache-Control: no-store\`. Any failure to open a request (bad key, wrong AAD, a modified byte)
   returns the same \`400 INVALID_PAYLOAD\`, so nothing leaks about why.
8. Decrypted bodies then go through the same sanitising and validation as plaintext ones.

**Plaintext mode.** With \`ENCRYPTION_REQUIRED\` on (the production default) a request without
\`${ENC_HEADERS.session}\` is refused with \`400 ENCRYPTION_REQUIRED\`. With it off, as in local
development, plaintext JSON is accepted; that is how "Try it out" works. \`GET /health\` and
\`GET /openapi.json\` are always plain.

## Input rules

- Unknown body and query fields are dropped. Field names containing \`$\` or \`.\` (and
  \`__proto__\`, \`constructor\`, \`prototype\`) are rejected with \`400 BAD_REQUEST\`, which blocks
  NoSQL operator injection.
- Free-text fields are trimmed and have HTML tags and control characters removed before their
  length is checked. Emails are trimmed and lower-cased.
- JSON bodies are limited to 16 KB (\`413 PAYLOAD_TOO_LARGE\`).
- Validation reports every failing field at once (\`422 VALIDATION_ERROR\` with \`details\`).

## Errors

${errorTable}

## Rate limits

Counted per client IP in 15-minute windows. Limited responses carry the IETF draft-8 \`RateLimit\`
and \`RateLimit-Policy\` headers. Going over returns \`429 RATE_LIMITED\` with \`Retry-After\` and
\`meta.retryAfterSeconds\`. The specific buckets apply on top of the global \`api\` bucket.

${rateLimitTable}

## Pagination

\`GET /notifications\`, \`GET /admin/subscriptions\` and \`GET /admin/users\` are paginated. They take
\`page\` (1-based) and, for the admin lists, \`pageSize\` (10, 20 or 50; notifications use a fixed
20), and return \`meta: { page, pageSize, total, totalPages }\` next to \`data\`. \`totalPages\` is at
least 1, even for an empty result.
`.trim();

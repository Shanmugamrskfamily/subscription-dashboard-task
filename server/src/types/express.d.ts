import type { Role } from '@planpilot/shared';

export interface AuthContext {
  id: string;
  role: Role;
  /** Refresh-session family the access token was issued for. */
  sid: string;
  name: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by pino-http from X-Request-Id or a fresh UUID. */
      id: string | number | object;
      user?: AuthContext;
      /** Parsed, cast and sanitised input from the validate() middleware. */
      valid: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};

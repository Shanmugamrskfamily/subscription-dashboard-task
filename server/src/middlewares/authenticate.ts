import { ERROR_CODES } from '@planpilot/shared';
import type { Role } from '@planpilot/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config/env';
import { assertAccountUsable } from '../modules/auth/account-guard';
import { isSessionActive } from '../modules/auth/auth.service';
import { UserModel } from '../modules/users/user.model';
import { ApiError } from '../utils/api-error';
import { verifyAccessToken } from '../utils/tokens';

const LAST_SEEN_THROTTLE_MS = 60_000;

/**
 * Verifies the Bearer access token, then re-reads the user on every request: role,
 * status and access date always come from the database, never from the token.
 * A block, a role change or "sign out everywhere" therefore applies at once.
 */
export function authenticate(config: AppConfig): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.get('authorization') ?? '';
    if (!header.startsWith('Bearer ')) throw ApiError.unauthorized();

    const claims = verifyAccessToken(config, header.slice('Bearer '.length).trim());
    const user = await UserModel.findById(claims.sub)
      .select('name email role status statusReason accessExpiresAt lastSeenAt')
      .lean();
    if (!user) throw ApiError.unauthorized('Your session is not valid', ERROR_CODES.INVALID_TOKEN);

    assertAccountUsable(user);
    if (!(await isSessionActive(claims.sid))) {
      throw ApiError.unauthorized(
        'You were signed out. Please sign in again.',
        ERROR_CODES.SESSION_EXPIRED,
      );
    }

    req.user = {
      id: user._id.toString(),
      role: user.role as Role,
      sid: claims.sid,
      name: user.name,
      email: user.email,
    };

    // "Online now" and "active users" come from this timestamp; write it at most once a minute.
    const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;
    if (Date.now() - lastSeen > LAST_SEEN_THROTTLE_MS) {
      void UserModel.updateOne({ _id: user._id }, { lastSeenAt: new Date() }).catch(
        () => undefined,
      );
    }
    next();
  };
}

export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden('You do not have permission to do this', ERROR_CODES.FORBIDDEN);
    }
    next();
  };
}

/** Narrows `req.user` for handlers that run after authenticate(). */
export function currentUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

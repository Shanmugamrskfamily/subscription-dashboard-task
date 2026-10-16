import type { LoginInput, RegisterInput } from '@planpilot/shared';
import type { CookieOptions, Request, Response } from 'express';
import type { AppConfig } from '../../config/env';
import { currentUser } from '../../middlewares/authenticate';
import { input } from '../../middlewares/validate';
import { ApiError } from '../../utils/api-error';
import { ok } from '../../utils/respond';
import { UserModel } from '../users/user.model';
import { toUserDto } from '../users/user.serializer';
import * as auth from './auth.service';
import type { IssuedSession } from './auth.service';

const client = (req: Request) => ({ userAgent: req.get('user-agent') ?? '' });

export function createAuthController(config: AppConfig) {
  const cookieOptions = (maxAge?: number): CookieOptions => ({
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: 'strict',
    path: '/',
    ...(maxAge !== undefined ? { maxAge } : {}),
  });

  const sendSession = (res: Response, session: IssuedSession, status = 200) => {
    res.cookie(
      config.cookie.name,
      session.refreshToken,
      cookieOptions(session.refreshExpiresAt.getTime() - Date.now()),
    );
    res.setHeader('Cache-Control', 'no-store');
    ok(res, session.auth, status);
  };

  const readCookie = (req: Request): string | undefined => {
    const value: unknown = req.cookies?.[config.cookie.name];
    return typeof value === 'string' && value.length <= 128 ? value : undefined;
  };

  return {
    async register(req: Request, res: Response) {
      sendSession(
        res,
        await auth.register(config, input.body<RegisterInput>(req), client(req)),
        201,
      );
    },

    async login(req: Request, res: Response) {
      sendSession(res, await auth.login(config, input.body<LoginInput>(req), client(req)));
    },

    async refresh(req: Request, res: Response) {
      try {
        sendSession(res, await auth.refresh(config, readCookie(req), client(req)));
      } catch (error) {
        // A dead session should also lose its cookie, unless another tab just rotated it.
        if (!(error instanceof ApiError && error.meta?.retry))
          res.clearCookie(config.cookie.name, cookieOptions());
        throw error;
      }
    },

    async logout(req: Request, res: Response) {
      await auth.logout(readCookie(req));
      res.clearCookie(config.cookie.name, cookieOptions());
      ok(res, { loggedOut: true });
    },

    async me(req: Request, res: Response) {
      const user = await UserModel.findById(currentUser(req).id).lean();
      if (!user) throw ApiError.unauthorized();
      ok(res, toUserDto(user));
    },
  };
}

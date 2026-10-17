import {
  changePasswordSchema,
  notificationQuerySchema,
  updateProfileSchema,
} from '@planpilot/shared';
import type { ChangePasswordInput, UpdateProfileInput } from '@planpilot/shared';
import { Router } from 'express';
import type { Request, RequestHandler, Response } from 'express';
import { object, string } from 'yup';
import type { AppConfig } from '../../config/env';
import { currentUser } from '../../middlewares/authenticate';
import { input, validate } from '../../middlewares/validate';
import { ok, pageMeta } from '../../utils/respond';
import { listSessions, revokeUserSessions } from '../auth/auth.service';
import {
  NOTIFICATIONS_PAGE_SIZE,
  listNotifications,
  markAllRead,
  markRead,
} from '../notifications/notification.service';
import { listMyPayments } from '../payments/payment.service';
import { UserModel } from '../users/user.model';
import * as me from './me.service';

const sessionParams = object({
  id: string()
    .required()
    .matches(/^[0-9a-f-]{36}$/i, 'Invalid session id'),
}).noUnknown();

const notificationParams = object({
  id: string()
    .required()
    .matches(/^[a-f\d]{24}$/i, 'Invalid notification id'),
}).noUnknown();

export function createMeRouter(config: AppConfig, auth: RequestHandler) {
  const router = Router();

  router.patch(
    '/me/profile',
    auth,
    validate({ body: updateProfileSchema }),
    async (req: Request, res: Response) => {
      ok(res, await me.updateProfile(currentUser(req).id, input.body<UpdateProfileInput>(req)));
    },
  );

  router.post(
    '/me/password',
    auth,
    validate({ body: changePasswordSchema }),
    async (req: Request, res: Response) => {
      ok(
        res,
        await me.changePassword(config, currentUser(req), input.body<ChangePasswordInput>(req)),
      );
    },
  );

  router.get('/me/sessions', auth, async (req: Request, res: Response) => {
    const user = currentUser(req);
    ok(res, await listSessions(user.id, user.sid));
  });

  router.delete(
    '/me/sessions/:id',
    auth,
    validate({ params: sessionParams }),
    async (req: Request, res: Response) => {
      await me.revokeMySession(currentUser(req).id, input.params<{ id: string }>(req).id);
      ok(res, { revoked: true });
    },
  );

  // "Sign out everywhere", including this device.
  router.delete('/me/sessions', auth, async (req: Request, res: Response) => {
    const revoked = await revokeUserSessions(currentUser(req).id, 'signed_out_everywhere');
    ok(res, { revoked });
  });

  router.get('/me/payments', auth, async (req: Request, res: Response) => {
    ok(res, await listMyPayments(currentUser(req).id));
  });

  router.get('/me/usage', auth, async (req: Request, res: Response) => {
    const user = await UserModel.findById(currentUser(req).id).select('usage').lean();
    ok(res, { projects: user?.usage?.projects ?? 0, teamMembers: user?.usage?.teamMembers ?? 0 });
  });

  router.get(
    '/notifications',
    auth,
    validate({ query: notificationQuerySchema }),
    async (req: Request, res: Response) => {
      const query = input.query<{ unread: boolean; page: number }>(req);
      const { total, ...list } = await listNotifications(currentUser(req).id, query);
      ok(res, list, 200, pageMeta(query.page, NOTIFICATIONS_PAGE_SIZE, total));
    },
  );

  router.patch('/notifications/read-all', auth, async (req: Request, res: Response) => {
    ok(res, { updated: await markAllRead(currentUser(req).id) });
  });

  router.patch(
    '/notifications/:id/read',
    auth,
    validate({ params: notificationParams }),
    async (req: Request, res: Response) => {
      await markRead(currentUser(req).id, input.params<{ id: string }>(req).id);
      ok(res, { read: true });
    },
  );

  return router;
}

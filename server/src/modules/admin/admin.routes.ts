import {
  adminSubscriptionQuerySchema,
  adminUserQuerySchema,
  assignPlanSchema,
  extendSubscriptionSchema,
  idParamsSchema,
  planSchema,
  reasonOnlySchema,
  roleSchema,
  statsQuerySchema,
  userStatusSchema,
} from '@planpilot/shared';
import type {
  AdminRange,
  AdminSubscriptionQuery,
  AdminUserQuery,
  AssignPlanInput,
  ExtendSubscriptionInput,
  PlanInput,
  Role,
  UserStatusInput,
} from '@planpilot/shared';
import { Router } from 'express';
import type { Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../../config/env';
import { authorize, currentUser } from '../../middlewares/authenticate';
import { input, validate } from '../../middlewares/validate';
import { ApiError } from '../../utils/api-error';
import { ok } from '../../utils/respond';
import { recentActivity } from '../activity/activity.service';
import * as plans from '../plans/plan.service';
import { getAdminStats } from './admin-stats.service';
import * as subscriptions from './admin-subscriptions.service';
import * as users from './admin-users.service';

const id = (req: Request) => input.params<{ id: string }>(req).id;
const adminId = (req: Request) => currentUser(req).id;

export function createAdminRouter(
  config: AppConfig,
  auth: RequestHandler,
  resetDemo: () => Promise<unknown>,
) {
  const router = Router();
  router.use(auth, authorize('admin'));

  // ---- analytics ----
  router.get(
    '/stats',
    validate({ query: statsQuerySchema }),
    async (req: Request, res: Response) => {
      const { range } = input.query<{ range: AdminRange }>(req);
      ok(res, await getAdminStats(range));
    },
  );

  router.get('/activity', async (_req: Request, res: Response) => {
    ok(res, await recentActivity({}, 50));
  });

  // ---- subscriptions ----
  // GET /api/admin/subscriptions: every subscription, filterable, paginated, CSV on request.
  router.get(
    '/subscriptions',
    validate({ query: adminSubscriptionQuerySchema }),
    async (req: Request, res: Response) => {
      const query = input.query<AdminSubscriptionQuery>(req);
      if (query.format === 'csv') {
        const csv = await subscriptions.exportSubscriptionsCsv(query);
        const stamp = new Date().toISOString().slice(0, 10);
        // Sent as data inside the normal JSON envelope, so encryption still applies.
        ok(res, { filename: `planpilot-subscriptions-${stamp}.csv`, csv });
        return;
      }
      const { items, meta } = await subscriptions.listSubscriptions(query);
      ok(res, items, 200, meta);
    },
  );

  router.patch(
    '/subscriptions/:id/extend',
    validate({ params: idParamsSchema, body: extendSubscriptionSchema }),
    async (req: Request, res: Response) => {
      ok(
        res,
        await subscriptions.extendSubscription(
          id(req),
          input.body<ExtendSubscriptionInput>(req),
          adminId(req),
        ),
      );
    },
  );

  router.patch(
    '/subscriptions/:id/expire',
    validate({ params: idParamsSchema, body: reasonOnlySchema }),
    async (req: Request, res: Response) => {
      const { reason } = input.body<{ reason: string }>(req);
      ok(res, await subscriptions.endSubscription(id(req), 'expire', reason, adminId(req)));
    },
  );

  router.patch(
    '/subscriptions/:id/cancel',
    validate({ params: idParamsSchema, body: reasonOnlySchema }),
    async (req: Request, res: Response) => {
      const { reason } = input.body<{ reason: string }>(req);
      ok(res, await subscriptions.endSubscription(id(req), 'cancel', reason, adminId(req)));
    },
  );

  // ---- users ----
  router.get(
    '/users',
    validate({ query: adminUserQuerySchema }),
    async (req: Request, res: Response) => {
      const { items, meta } = await users.listUsers(input.query<AdminUserQuery>(req));
      ok(res, items, 200, meta);
    },
  );

  router.get(
    '/users/:id',
    validate({ params: idParamsSchema }),
    async (req: Request, res: Response) => {
      ok(res, await users.getUserDetail(id(req)));
    },
  );

  router.patch(
    '/users/:id/status',
    validate({ params: idParamsSchema, body: userStatusSchema }),
    async (req: Request, res: Response) => {
      ok(res, await users.setUserStatus(adminId(req), id(req), input.body<UserStatusInput>(req)));
    },
  );

  router.patch(
    '/users/:id/role',
    validate({ params: idParamsSchema, body: roleSchema }),
    async (req: Request, res: Response) => {
      ok(res, await users.setUserRole(adminId(req), id(req), input.body<{ role: Role }>(req).role));
    },
  );

  router.post(
    '/users/:id/subscription',
    validate({ params: idParamsSchema, body: assignPlanSchema }),
    async (req: Request, res: Response) => {
      ok(
        res,
        await subscriptions.assignPlan(id(req), input.body<AssignPlanInput>(req), adminId(req)),
        201,
      );
    },
  );

  router.delete(
    '/users/:id/sessions',
    validate({ params: idParamsSchema }),
    async (req: Request, res: Response) => {
      ok(res, await users.forceSignOut(adminId(req), id(req)));
    },
  );

  // ---- plans ----
  router.get('/plans', async (_req: Request, res: Response) => {
    ok(res, await plans.listPlansForAdmin());
  });

  router.post('/plans', validate({ body: planSchema }), async (req: Request, res: Response) => {
    ok(res, await plans.createPlan(input.body<PlanInput>(req), adminId(req)), 201);
  });

  router.patch(
    '/plans/:id',
    validate({ params: idParamsSchema, body: planSchema }),
    async (req: Request, res: Response) => {
      ok(res, await plans.updatePlan(id(req), input.body<PlanInput>(req), adminId(req)));
    },
  );

  router.delete(
    '/plans/:id',
    validate({ params: idParamsSchema }),
    async (req: Request, res: Response) => {
      ok(res, await plans.removePlan(id(req), adminId(req)));
    },
  );

  // ---- demo ----
  router.post('/demo/reset', async (_req: Request, res: Response) => {
    if (!config.demoMode) throw ApiError.notFound('Demo reset is turned off');
    await resetDemo();
    ok(res, { reset: true });
  });

  return router;
}

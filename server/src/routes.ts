import { Router } from 'express';
import type { AppConfig } from './config/env';
import { authenticate } from './middlewares/authenticate';
import type { Limiters } from './middlewares/rate-limit';
import { createAdminRouter } from './modules/admin/admin.routes';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createMeRouter } from './modules/me/me.routes';
import { createPlanRouter } from './modules/plans/plan.routes';
import { createSubscriptionRouter } from './modules/subscriptions/subscription.routes';
import { createWorkspaceRouter } from './modules/workspace/workspace.routes';
import { ensureSeedData } from './seed/seed';

/** Every /api route. Order matters only for readability: paths don't overlap. */
export function createApiRouter(config: AppConfig, limiters: Limiters) {
  const router = Router();
  const auth = authenticate(config);

  router.use('/auth', createAuthRouter(config, limiters, auth));
  router.use('/plans', createPlanRouter());
  router.use(createSubscriptionRouter(config, limiters, auth));
  router.use(createMeRouter(config, auth));
  router.use(createWorkspaceRouter(auth));
  router.use(
    '/admin',
    createAdminRouter(config, auth, () => ensureSeedData({ fresh: true })),
  );

  return router;
}

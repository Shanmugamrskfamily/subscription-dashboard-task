import { loginSchema, registerSchema } from '@planpilot/shared';
import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { AppConfig } from '../../config/env';
import type { Limiters } from '../../middlewares/rate-limit';
import { requireAppRequest } from '../../middlewares/security';
import { validate } from '../../middlewares/validate';
import { createAuthController } from './auth.controller';

export function createAuthRouter(config: AppConfig, limiters: Limiters, auth: RequestHandler) {
  const router = Router();
  const controller = createAuthController(config);
  const appOnly = requireAppRequest(config);

  router.post('/register', limiters.auth, validate({ body: registerSchema }), controller.register);
  router.post('/login', limiters.auth, validate({ body: loginSchema }), controller.login);
  router.post('/refresh', limiters.refresh, appOnly, controller.refresh);
  router.post('/logout', appOnly, controller.logout);
  router.get('/me', auth, controller.me);

  return router;
}

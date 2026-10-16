import { Router } from 'express';
import { ok } from '../../utils/respond';
import { listActivePlans } from './plan.service';

export function createPlanRouter() {
  const router = Router();

  // GET /api/plans: public, so the pricing page works before sign-in.
  router.get('/', async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    ok(res, await listActivePlans());
  });

  return router;
}

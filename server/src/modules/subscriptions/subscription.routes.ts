import { paymentFailedSchema, planIdParamsSchema, verifyPaymentSchema } from '@planpilot/shared';
import type { VerifyPaymentInput } from '@planpilot/shared';
import { Router } from 'express';
import type { Request, RequestHandler, Response } from 'express';
import { object, string } from 'yup';
import type { AppConfig } from '../../config/env';
import { authorize, currentUser } from '../../middlewares/authenticate';
import type { Limiters } from '../../middlewares/rate-limit';
import { input, validate } from '../../middlewares/validate';
import { ok } from '../../utils/respond';
import { markPaymentFailed, verifyPayment } from '../payments/payment.service';
import * as subscriptions from './subscription.service';

const orderParamsSchema = object({
  orderId: string()
    .required()
    .matches(/^order_[A-Za-z0-9]{6,40}$/, 'Invalid order id'),
}).noUnknown();

export function createSubscriptionRouter(
  config: AppConfig,
  limiters: Limiters,
  auth: RequestHandler,
) {
  const router = Router();
  const userOnly = [auth, authorize('user')];

  // GET /api/my-subscription: the signed-in user's active plan (or status "none").
  router.get('/my-subscription', ...userOnly, async (req: Request, res: Response) => {
    ok(res, await subscriptions.getMySubscription(currentUser(req).id));
  });

  router.post('/my-subscription/cancel', ...userOnly, async (req: Request, res: Response) => {
    ok(res, await subscriptions.cancelMySubscription(currentUser(req)));
  });

  // GET /api/subscribe/:planId/preview: what switching would cost, before paying.
  router.get(
    '/subscribe/:planId/preview',
    ...userOnly,
    validate({ params: planIdParamsSchema }),
    async (req: Request, res: Response) => {
      const { planId } = input.params<{ planId: string }>(req);
      ok(res, (await subscriptions.quoteChange(currentUser(req).id, planId)).dto);
    },
  );

  // POST /api/subscribe/:planId: subscribe or change plan. Activates at once when nothing
  // is due, otherwise returns a Razorpay order for the checkout.
  router.post(
    '/subscribe/:planId',
    ...userOnly,
    limiters.payments,
    validate({ params: planIdParamsSchema }),
    async (req: Request, res: Response) => {
      const { planId } = input.params<{ planId: string }>(req);
      const result = await subscriptions.subscribe(config, currentUser(req), planId);
      ok(res, result, result.activated ? 201 : 200);
    },
  );

  router.post(
    '/payments/verify',
    ...userOnly,
    limiters.payments,
    validate({ body: verifyPaymentSchema }),
    async (req: Request, res: Response) => {
      ok(res, await verifyPayment(config, currentUser(req), input.body<VerifyPaymentInput>(req)));
    },
  );

  router.post(
    '/payments/:orderId/fail',
    ...userOnly,
    validate({ params: orderParamsSchema, body: paymentFailedSchema }),
    async (req: Request, res: Response) => {
      const { orderId } = input.params<{ orderId: string }>(req);
      const { reason } = input.body<{ reason: string }>(req);
      await markPaymentFailed(currentUser(req).id, orderId, reason);
      ok(res, { recorded: true });
    },
  );

  return router;
}

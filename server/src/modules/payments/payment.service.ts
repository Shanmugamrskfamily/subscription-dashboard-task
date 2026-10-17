import { DAY_MS, ERROR_CODES } from '@planpilot/shared';
import type {
  ChangeType,
  PaymentDto,
  PaymentStatus,
  SubscriptionDto,
  VerifyPaymentInput,
} from '@planpilot/shared';
import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import type { AppConfig } from '../../config/env';
import { ApiError } from '../../utils/api-error';
import { logActivity } from '../activity/activity.service';
import { notify } from '../notifications/notification.service';
import { PlanModel } from '../plans/plan.model';
import type { Plan } from '../plans/plan.model';
import { toPlanSummary } from '../plans/plan.serializer';
import { SubscriptionModel } from '../subscriptions/subscription.model';
import type { Subscription } from '../subscriptions/subscription.model';
import { toSubscriptionDto } from '../subscriptions/subscription.serializer';
import { activateSubscription, notifyActivation } from '../subscriptions/subscription.service';
import { getGateway } from './gateway';
import { PaymentModel } from './payment.model';

export interface VerifyResult {
  subscription: SubscriptionDto;
  alreadyProcessed: boolean;
}

async function subscriptionFor(subscriptionId: Types.ObjectId | null | undefined) {
  if (!subscriptionId)
    throw ApiError.conflict('This payment is still being processed. Refresh in a moment.');
  const sub = await SubscriptionModel.findById(subscriptionId).lean<Subscription>();
  const plan = sub ? await PlanModel.findById(sub.planId).lean<Plan>() : null;
  if (!sub || !plan) throw ApiError.notFound('Subscription not found');
  return toSubscriptionDto(sub, plan);
}

/**
 * Called with what Razorpay Checkout hands back. The signature proves Razorpay
 * created this payment for our order; the amount was fixed when the order was made.
 * Safe to call twice: the second call returns the plan the first one activated.
 */
export async function verifyPayment(
  config: AppConfig,
  user: { id: string; email: string },
  input: VerifyPaymentInput,
): Promise<VerifyResult> {
  const payment = await PaymentModel.findOne({
    razorpayOrderId: input.razorpay_order_id,
    userId: user.id,
  });
  if (!payment) throw ApiError.notFound('We could not find this payment.');
  const plan = await PlanModel.findById(payment.planId).lean<Plan>();
  if (!plan) throw ApiError.notFound('That plan no longer exists', ERROR_CODES.PLAN_NOT_FOUND);

  if (payment.status === 'paid') {
    return { subscription: await subscriptionFor(payment.subscriptionId), alreadyProcessed: true };
  }
  if (payment.status === 'failed') {
    throw ApiError.badRequest(
      'This checkout was closed. Start a new one from Plans.',
      ERROR_CODES.PAYMENT_FAILED,
    );
  }

  const gateway = getGateway(config);
  if (
    !gateway.verifySignature(
      input.razorpay_order_id,
      input.razorpay_payment_id,
      input.razorpay_signature,
    )
  ) {
    payment.status = 'failed';
    payment.failureReason = 'Signature verification failed';
    await payment.save();
    await logActivity({
      actorId: user.id,
      action: 'security.payment_signature_mismatch',
      target: { type: 'payment', id: payment._id.toString(), label: payment.razorpayOrderId },
    });
    await notify(user.id, 'payment_failed', { plan: plan.name });
    throw ApiError.badRequest(
      'We could not verify this payment.',
      ERROR_CODES.PAYMENT_VERIFICATION_FAILED,
    );
  }

  const quote = payment.quote;
  if (!quote) throw ApiError.conflict('This payment has no price breakdown. Start a new checkout.');
  const now = new Date();
  const created = await mongoose.connection.transaction(async (session) => {
    // Claim the payment first: of two parallel verifications, only one gets here.
    const claimed = await PaymentModel.findOneAndUpdate(
      { _id: payment._id, status: 'created' },
      { status: 'paid', razorpayPaymentId: input.razorpay_payment_id, paidAt: now },
      { session, returnDocument: 'after' },
    );
    if (!claimed) return null;

    const current = await SubscriptionModel.findOne({ userId: user.id, status: 'active' }).session(
      session,
    );
    const sub = await activateSubscription(
      {
        userId: user.id,
        plan,
        changeType: payment.changeType as ChangeType,
        startDate: now,
        endDate: new Date(now.getTime() + (quote.durationDays + quote.bonusDays) * DAY_MS),
        amountPaid: payment.amount,
        creditBasis: quote.creditBasis,
        previousId: current?._id ?? null,
        paymentId: payment._id,
      },
      session,
    );
    claimed.subscriptionId = sub._id;
    await claimed.save({ session });
    return sub;
  });

  if (!created) {
    const fresh = await PaymentModel.findById(payment._id).lean();
    return { subscription: await subscriptionFor(fresh?.subscriptionId), alreadyProcessed: true };
  }

  await notifyActivation(user.id, created, plan);
  await logActivity({
    actorId: user.id,
    action: `subscription.${payment.changeType}`,
    target: { type: 'user', id: user.id, label: user.email },
    meta: { plan: plan.name, amountPaid: payment.amount, orderId: payment.razorpayOrderId },
  });
  return { subscription: toSubscriptionDto(created.toObject(), plan), alreadyProcessed: false };
}

/** The checkout was dismissed or failed: record it so history and analytics stay honest. */
export async function markPaymentFailed(
  userId: string,
  orderId: string,
  reason: string,
): Promise<void> {
  const payment = await PaymentModel.findOneAndUpdate(
    { razorpayOrderId: orderId, userId, status: 'created' },
    { status: 'failed', failureReason: reason },
  );
  if (!payment) return;
  const plan = await PlanModel.findById(payment.planId).select('name').lean();
  await notify(userId, 'payment_failed', { plan: plan?.name ?? 'your plan' });
}

export async function listMyPayments(userId: string): Promise<PaymentDto[]> {
  const payments = await PaymentModel.find({ userId, status: { $in: ['paid', 'failed'] } })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate<{ planId: Pick<Plan, '_id' | 'name' | 'slug'> | null }>('planId', 'name slug')
    .lean();
  return payments.map((p) => ({
    id: p._id.toString(),
    plan: p.planId ? toPlanSummary(p.planId) : { id: '', name: 'Deleted plan', slug: '' },
    amount: p.amount,
    status: p.status as PaymentStatus,
    changeType: p.changeType as ChangeType,
    razorpayOrderId: p.razorpayOrderId,
    razorpayPaymentId: p.razorpayPaymentId ?? null,
    failureReason: p.failureReason ?? null,
    createdAt: new Date(p.createdAt).toISOString(),
  }));
}

import { ERROR_CODES } from '@planpilot/shared';
import type {
  ChangeType,
  MySubscriptionDto,
  ProrationQuote,
  SubscribeResponse,
  SubscriptionDto,
} from '@planpilot/shared';
import mongoose from 'mongoose';
import type { ClientSession, Types } from 'mongoose';
import type { AppConfig } from '../../config/env';
import { ApiError } from '../../utils/api-error';
import { logActivity } from '../activity/activity.service';
import { notify } from '../notifications/notification.service';
import type { NotificationData } from '../notifications/notification.service';
import { getGateway } from '../payments/gateway';
import { PaymentModel } from '../payments/payment.model';
import { PlanModel } from '../plans/plan.model';
import type { Plan } from '../plans/plan.model';
import { findPlanOrThrow } from '../plans/plan.service';
import { planLimits, toPlanDto, toPlanSummary } from '../plans/plan.serializer';
import { UserModel } from '../users/user.model';
import { computeQuote } from './proration';
import type { ComputedQuote } from './proration';
import { SubscriptionModel } from './subscription.model';
import type { Subscription, SubscriptionDocument } from './subscription.model';
import { toSubscriptionDto } from './subscription.serializer';

export interface CurrentPlan {
  sub: Subscription;
  plan: Plan;
}

const ACTIVATION_NOTICE: Record<ChangeType, Parameters<typeof notify>[1]> = {
  new: 'subscription_activated',
  renewal: 'plan_renewed',
  upgrade: 'plan_upgraded',
  downgrade: 'plan_downgraded',
  admin_assign: 'admin_plan_changed',
};

/** Marks one subscription expired (idempotent) and tells the user once. */
export async function expireSubscription(
  sub: Pick<Subscription, '_id' | 'userId' | 'endDate'>,
  planName: string,
) {
  const result = await SubscriptionModel.updateOne(
    { _id: sub._id, status: 'active' },
    {
      status: 'expired',
      endedAt: sub.endDate,
      endReason: 'expired',
      notifiedExpiredAt: new Date(),
    },
  );
  if (result.modifiedCount) await notify(sub.userId, 'expired', { plan: planName });
}

/**
 * The user's active plan, or null. Expiry is also checked here on read, so a plan
 * never looks active past its end date even if the background job hasn't run
 * (Render's free tier sleeps).
 */
export async function getCurrentPlan(userId: string | Types.ObjectId): Promise<CurrentPlan | null> {
  const sub = await SubscriptionModel.findOne({ userId, status: 'active' }).lean<Subscription>();
  if (!sub) return null;
  const plan = await PlanModel.findById(sub.planId).lean<Plan>();
  if (!plan) return null;
  if (new Date(sub.endDate).getTime() <= Date.now()) {
    await expireSubscription(sub, plan.name);
    return null;
  }
  return { sub, plan };
}

export async function getMySubscription(userId: string): Promise<MySubscriptionDto> {
  const [current, user] = await Promise.all([
    getCurrentPlan(userId),
    UserModel.findById(userId).select('usage').lean(),
  ]);
  const usage = {
    projects: user?.usage?.projects ?? 0,
    teamMembers: user?.usage?.teamMembers ?? 0,
  };

  if (current) {
    return {
      status: 'active',
      subscription: toSubscriptionDto(current.sub, current.plan),
      lastSubscription: null,
      usage,
      limits: planLimits(current.plan),
      readOnly: false,
    };
  }

  const last = await SubscriptionModel.findOne({ userId })
    .sort({ createdAt: -1 })
    .lean<Subscription>();
  const lastPlan = last ? await PlanModel.findById(last.planId).lean<Plan>() : null;
  return {
    status: last ? (last.status as MySubscriptionDto['status']) : 'none',
    subscription: null,
    lastSubscription: last && lastPlan ? toSubscriptionDto(last, lastPlan) : null,
    usage,
    limits: planLimits(null),
    readOnly: true,
  };
}

export interface QuoteResult {
  plan: Plan;
  current: CurrentPlan | null;
  computed: ComputedQuote;
  dto: ProrationQuote;
}

export async function quoteChange(userId: string, planId: string): Promise<QuoteResult> {
  const plan = await findPlanOrThrow(planId);
  const current = await getCurrentPlan(userId);
  if (current && current.sub.planId.toString() === plan._id.toString()) {
    throw ApiError.conflict(
      `You are already on the ${plan.name} plan.`,
      ERROR_CODES.ALREADY_SUBSCRIBED,
    );
  }
  const hadPrevious = !current && Boolean(await SubscriptionModel.exists({ userId }));
  const computed = computeQuote(
    {
      id: plan._id.toString(),
      price: plan.price,
      durationDays: plan.durationDays,
      tier: plan.tier,
    },
    current
      ? {
          planId: current.plan._id.toString(),
          tier: current.plan.tier,
          durationDays: current.plan.durationDays,
          startDate: new Date(current.sub.startDate),
          endDate: new Date(current.sub.endDate),
          creditBasis: current.sub.creditBasis ?? 0,
        }
      : null,
    hadPrevious,
  );

  return {
    plan,
    current,
    computed,
    dto: {
      changeType: computed.changeType,
      plan: toPlanDto(plan),
      currentPlan: current ? toPlanSummary(current.plan) : null,
      credit: computed.credit,
      price: plan.price,
      amountDue: computed.amountDue,
      bonusDays: computed.bonusDays,
      startDate: computed.startDate.toISOString(),
      endDate: computed.endDate.toISOString(),
      requiresPayment: computed.amountDue > 0,
    },
  };
}

export interface ActivationInput {
  userId: string | Types.ObjectId;
  plan: Plan;
  changeType: ChangeType;
  startDate: Date;
  endDate: Date;
  amountPaid: number;
  creditBasis: number;
  previousId: Types.ObjectId | null;
  paymentId?: Types.ObjectId | null;
  adjustment?: { type: 'assign'; reason: string; by: string };
}

/**
 * Closes the previous plan and opens the new one inside the caller's transaction.
 * If anything changed in between (another tab, another admin), the transaction
 * aborts with a clear conflict instead of leaving two active plans.
 */
export async function activateSubscription(input: ActivationInput, session: ClientSession) {
  if (input.previousId) {
    const closed = await SubscriptionModel.updateOne(
      { _id: input.previousId, status: 'active' },
      { status: 'cancelled', endedAt: new Date(), endReason: 'replaced' },
      { session },
    );
    if (!closed.modifiedCount) {
      throw ApiError.conflict('Your plan changed in the meantime. Please review and try again.');
    }
  }
  try {
    const [created] = await SubscriptionModel.create(
      [
        {
          userId: input.userId,
          planId: input.plan._id,
          startDate: input.startDate,
          endDate: input.endDate,
          status: 'active',
          amountPaid: input.amountPaid,
          creditBasis: input.creditBasis,
          changeType: input.changeType,
          previousSubscriptionId: input.previousId,
          paymentId: input.paymentId ?? null,
          adjustments: input.adjustment ? [{ ...input.adjustment, at: new Date() }] : [],
        },
      ],
      { session },
    );
    return created as SubscriptionDocument;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw ApiError.conflict('You already have an active plan.', ERROR_CODES.ALREADY_SUBSCRIBED);
    }
    throw error;
  }
}

export async function notifyActivation(
  userId: string | Types.ObjectId,
  sub: Pick<Subscription, 'changeType' | 'endDate' | 'amountPaid'>,
  plan: Plan,
  extra: NotificationData = {},
) {
  await notify(userId, ACTIVATION_NOTICE[sub.changeType as ChangeType], {
    plan: plan.name,
    endDate: sub.endDate,
    ...extra,
  });
  if (sub.amountPaid > 0)
    await notify(userId, 'payment_success', { plan: plan.name, amount: sub.amountPaid });
}

export async function subscribe(
  config: AppConfig,
  user: { id: string; name: string; email: string },
  planId: string,
): Promise<SubscribeResponse> {
  const { plan, current, computed, dto } = await quoteChange(user.id, planId);

  // Nothing to pay (credit covers it): switch right away.
  if (computed.amountDue === 0) {
    const created = await mongoose.connection.transaction((session) =>
      activateSubscription(
        {
          userId: user.id,
          plan,
          changeType: computed.changeType,
          startDate: computed.startDate,
          endDate: computed.endDate,
          amountPaid: 0,
          creditBasis: computed.creditBasis,
          previousId: current?.sub._id ?? null,
        },
        session,
      ),
    );
    await notifyActivation(user.id, created, plan);
    await logActivity({
      actorId: user.id,
      action: `subscription.${computed.changeType}`,
      target: { type: 'user', id: user.id, label: user.email },
      meta: { plan: plan.name, amountPaid: 0, credit: computed.credit },
    });
    return {
      activated: true,
      subscription: toSubscriptionDto(created.toObject(), plan),
      quote: dto,
    };
  }

  const gateway = getGateway(config);
  const order = await gateway.createOrder({
    amount: computed.amountDue,
    receipt: `pp_${Date.now().toString(36)}`,
    notes: { userId: user.id, planId: plan._id.toString(), changeType: computed.changeType },
  });
  const payment = await PaymentModel.create({
    userId: user.id,
    planId: plan._id,
    provider: gateway.mode,
    razorpayOrderId: order.id,
    amount: computed.amountDue,
    changeType: computed.changeType,
    quote: {
      credit: computed.credit,
      price: plan.price,
      bonusDays: computed.bonusDays,
      durationDays: plan.durationDays,
      creditBasis: computed.creditBasis,
      currentSubscriptionId: current?.sub._id ?? null,
    },
  });

  return {
    activated: false,
    quote: dto,
    checkout: {
      paymentId: payment._id.toString(),
      orderId: order.id,
      amount: order.amount,
      currency: 'INR',
      keyId: gateway.keyId,
      planName: plan.name,
      description: `${plan.name} plan · ${plan.durationDays} days`,
      prefill: { name: user.name, email: user.email },
      mode: gateway.mode,
      ...(gateway.simulateSuccess ? { simulation: gateway.simulateSuccess(order.id) } : {}),
    },
  };
}

export async function cancelMySubscription(user: {
  id: string;
  email: string;
}): Promise<MySubscriptionDto> {
  const current = await getCurrentPlan(user.id);
  if (!current) {
    throw ApiError.badRequest(
      'You have no active plan to cancel.',
      ERROR_CODES.NO_ACTIVE_SUBSCRIPTION,
    );
  }
  await SubscriptionModel.updateOne(
    { _id: current.sub._id, status: 'active' },
    {
      status: 'cancelled',
      endedAt: new Date(),
      endReason: 'cancelled',
      $push: {
        adjustments: {
          type: 'cancel',
          reason: 'Cancelled by the user',
          by: user.id,
          at: new Date(),
        },
      },
    },
  );
  await notify(user.id, 'cancelled', { plan: current.plan.name });
  await logActivity({
    actorId: user.id,
    action: 'subscription.cancelled',
    target: { type: 'user', id: user.id, label: user.email },
    meta: { plan: current.plan.name },
  });
  return getMySubscription(user.id);
}

export async function subscriptionDto(sub: Subscription): Promise<SubscriptionDto> {
  const plan = await PlanModel.findById(sub.planId).lean<Plan>();
  if (!plan) throw ApiError.notFound('Plan not found', ERROR_CODES.PLAN_NOT_FOUND);
  return toSubscriptionDto(sub, plan);
}

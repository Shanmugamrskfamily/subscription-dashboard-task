import { DAY_MS, ERROR_CODES, csvSafe } from '@planpilot/shared';
import type {
  AdminSubscriptionQuery,
  AdminSubscriptionRow,
  AssignPlanInput,
  ExtendSubscriptionInput,
  PageMeta,
  SubscriptionDto,
} from '@planpilot/shared';
import mongoose, { Types } from 'mongoose';
import { ApiError } from '../../utils/api-error';
import { formatDate } from '../../utils/format';
import { pageMeta } from '../../utils/respond';
import { logActivity } from '../activity/activity.service';
import { notify } from '../notifications/notification.service';
import { PlanModel } from '../plans/plan.model';
import type { Plan } from '../plans/plan.model';
import { findPlanOrThrow } from '../plans/plan.service';
import { SubscriptionModel } from '../subscriptions/subscription.model';
import type { Subscription } from '../subscriptions/subscription.model';
import type { AdminRowSource } from '../subscriptions/subscription.serializer';
import { toAdminRow, toSubscriptionDto } from '../subscriptions/subscription.serializer';
import { activateSubscription, getCurrentPlan } from '../subscriptions/subscription.service';
import { UserModel } from '../users/user.model';

const CSV_LIMIT = 5000;

export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function sortSpec(sort: string): Record<string, 1 | -1> {
  const field = sort.replace(/^-/, '');
  return { [field]: sort.startsWith('-') ? -1 : 1, _id: -1 };
}

const IST_OFFSET_MS = 330 * 60_000;
/** Date filters cover whole days in India time, the same days the analytics use. */
const startOfIstDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - IST_OFFSET_MS);
const endOfIstDay = (date: Date) => new Date(startOfIstDay(date).getTime() + DAY_MS - 1);

async function buildFilter(query: AdminSubscriptionQuery) {
  const filter: Record<string, unknown> = {};
  if (query.status !== 'all') filter.status = query.status;
  if (query.planId) filter.planId = new Types.ObjectId(query.planId);
  if (query.changeType !== 'all') filter.changeType = query.changeType;
  if (query.from || query.to) {
    filter.startDate = {
      ...(query.from ? { $gte: startOfIstDay(query.from) } : {}),
      ...(query.to ? { $lte: endOfIstDay(query.to) } : {}),
    };
  }
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    const users = await UserModel.find({ $or: [{ name: rx }, { email: rx }] })
      .select('_id')
      .limit(1000)
      .lean();
    filter.userId = { $in: users.map((u) => u._id) };
  }
  return filter;
}

export async function listSubscriptions(
  query: AdminSubscriptionQuery,
): Promise<{ items: AdminSubscriptionRow[]; meta: PageMeta }> {
  const filter = await buildFilter(query);
  const [rows, total] = await Promise.all([
    SubscriptionModel.find(filter)
      .sort(sortSpec(query.sort))
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .populate('userId', 'name email')
      .populate('planId', 'name slug')
      .lean<AdminRowSource[]>(),
    SubscriptionModel.countDocuments(filter),
  ]);
  return { items: rows.map(toAdminRow), meta: pageMeta(query.page, query.pageSize, total) };
}

/** The filtered list as CSV (up to 5,000 rows), safe to open in Excel. */
export async function exportSubscriptionsCsv(query: AdminSubscriptionQuery): Promise<string> {
  const filter = await buildFilter(query);
  const rows = await SubscriptionModel.find(filter)
    .sort(sortSpec(query.sort))
    .limit(CSV_LIMIT)
    .populate('userId', 'name email')
    .populate('planId', 'name slug')
    .lean<AdminRowSource[]>();

  const header = [
    'Subscription ID',
    'Customer',
    'Email',
    'Plan',
    'Status',
    'Change type',
    'Amount (INR)',
    'Start date',
    'End date',
    'Created',
  ];
  const cell = (value: string) => `"${csvSafe(value).replace(/"/g, '""')}"`;
  const lines = rows
    .map(toAdminRow)
    .map((r) =>
      [
        r.id,
        r.user.name,
        r.user.email,
        r.plan.name,
        r.status,
        r.changeType,
        (r.amountPaid / 100).toFixed(2),
        formatDate(r.startDate),
        formatDate(r.endDate),
        formatDate(r.createdAt),
      ]
        .map(cell)
        .join(','),
    );
  return [header.map(cell).join(','), ...lines].join('\r\n');
}

async function loadSubscription(id: string) {
  const sub = await SubscriptionModel.findById(id);
  if (!sub) throw ApiError.notFound('Subscription not found');
  const plan = await PlanModel.findById(sub.planId).lean<Plan>();
  if (!plan) throw ApiError.notFound('Plan not found', ERROR_CODES.PLAN_NOT_FOUND);
  return { sub, plan };
}

const subjectFor = async (userId: Types.ObjectId) =>
  (await UserModel.findById(userId).select('email').lean())?.email ?? userId.toString();

/** Extends by N days (from the later of today and the current end) or to a chosen date. */
export async function extendSubscription(
  id: string,
  input: ExtendSubscriptionInput,
  adminId: string,
): Promise<SubscriptionDto> {
  const { sub, plan } = await loadSubscription(id);
  const now = Date.now();
  const base = sub.status === 'active' ? Math.max(sub.endDate.getTime(), now) : now;
  const newEnd = input.endDate
    ? new Date(input.endDate)
    : new Date(base + (input.days ?? 0) * DAY_MS);
  if (newEnd.getTime() <= now) throw ApiError.badRequest('Pick an end date in the future');

  const reviving = sub.status !== 'active';
  if (reviving && (await SubscriptionModel.exists({ userId: sub.userId, status: 'active' }))) {
    throw ApiError.conflict('This user already has another active plan. Extend that one instead.');
  }

  const addedDays = Math.round((newEnd.getTime() - sub.endDate.getTime()) / DAY_MS);
  sub.set({
    endDate: newEnd,
    status: 'active',
    endedAt: null,
    endReason: null,
    // A new end date deserves fresh reminders.
    remindedExpiringAt: null,
    remindedFinalAt: null,
    notifiedExpiredAt: null,
  });
  sub.adjustments.push({
    type: 'extend',
    days: addedDays,
    newEndDate: newEnd,
    reason: input.reason,
    by: adminId,
    at: new Date(),
  });
  try {
    await sub.save();
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw ApiError.conflict(
        'This user already has another active plan. Extend that one instead.',
      );
    }
    throw error;
  }

  await notify(sub.userId, 'admin_plan_extended', {
    plan: plan.name,
    endDate: newEnd,
    reason: input.reason,
  });
  await logActivity({
    actorId: adminId,
    action: reviving ? 'admin.subscription.revived' : 'admin.subscription.extended',
    target: { type: 'user', id: sub.userId.toString(), label: await subjectFor(sub.userId) },
    meta: {
      plan: plan.name,
      newEndDate: newEnd.toISOString(),
      days: addedDays,
      reason: input.reason,
    },
  });
  return toSubscriptionDto(sub.toObject(), plan);
}

/** Ends an active plan now: "expire" (time's up) or "cancel" (taken away). */
export async function endSubscription(
  id: string,
  kind: 'expire' | 'cancel',
  reason: string,
  adminId: string,
): Promise<SubscriptionDto> {
  const { sub, plan } = await loadSubscription(id);
  if (sub.status !== 'active') {
    throw ApiError.badRequest(
      'Only an active plan can be ended',
      ERROR_CODES.NO_ACTIVE_SUBSCRIPTION,
    );
  }
  const now = new Date();
  sub.set({
    status: kind === 'expire' ? 'expired' : 'cancelled',
    endDate: now,
    endedAt: now,
    endReason: kind === 'expire' ? 'admin_expired' : 'admin_cancelled',
    notifiedExpiredAt: now,
  });
  sub.adjustments.push({ type: kind, days: null, newEndDate: now, reason, by: adminId, at: now });
  await sub.save();

  await notify(sub.userId, 'admin_plan_expired', { plan: plan.name, reason });
  await logActivity({
    actorId: adminId,
    action: `admin.subscription.${kind === 'expire' ? 'expired' : 'cancelled'}`,
    target: { type: 'user', id: sub.userId.toString(), label: await subjectFor(sub.userId) },
    meta: { plan: plan.name, reason },
  });
  return toSubscriptionDto(sub.toObject(), plan);
}

/** Puts a user on any plan without payment, replacing whatever is active. */
export async function assignPlan(
  userId: string,
  input: AssignPlanInput,
  adminId: string,
): Promise<SubscriptionDto> {
  const user = await UserModel.findById(userId).select('email role').lean();
  if (!user) throw ApiError.notFound('User not found');
  if (user.role !== 'user')
    throw ApiError.badRequest('Plans can only be assigned to customer accounts');

  const plan = await findPlanOrThrow(input.planId);
  const current = await getCurrentPlan(userId);
  if (current && current.plan._id.toString() === plan._id.toString()) {
    throw ApiError.conflict(
      `This user is already on ${plan.name}. Extend the plan instead.`,
      ERROR_CODES.ALREADY_SUBSCRIBED,
    );
  }

  const now = new Date();
  const created = await mongoose.connection.transaction((session) =>
    activateSubscription(
      {
        userId,
        plan,
        changeType: 'admin_assign',
        startDate: now,
        endDate: new Date(now.getTime() + plan.durationDays * DAY_MS),
        amountPaid: 0,
        creditBasis: 0,
        previousId: current?.sub._id ?? null,
        adjustment: { type: 'assign', reason: input.reason, by: adminId },
      },
      session,
    ),
  );

  await notify(userId, 'admin_plan_changed', {
    plan: plan.name,
    endDate: created.endDate,
    reason: input.reason,
  });
  await logActivity({
    actorId: adminId,
    action: 'admin.subscription.assigned',
    target: { type: 'user', id: userId, label: user.email },
    meta: { plan: plan.name, previousPlan: current?.plan.name ?? null, reason: input.reason },
  });
  return toSubscriptionDto(created.toObject() as Subscription, plan);
}

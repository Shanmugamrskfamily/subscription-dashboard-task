import type { NotificationDto, NotificationListDto, NotificationType } from '@planpilot/shared';
import type { ClientSession, Types } from 'mongoose';
import { formatDate, formatInr } from '../../utils/format';
import { logger } from '../../utils/logger';
import { NotificationModel } from './notification.model';
import type { Notification } from './notification.model';

export interface NotificationData {
  plan?: string;
  endDate?: Date | string;
  amount?: number;
  days?: number;
  reason?: string;
  status?: string;
  label?: string;
  limit?: number;
  [key: string]: unknown;
}

const date = (d: NotificationData) => (d.endDate ? formatDate(d.endDate) : '');
const why = (d: NotificationData) => (d.reason ? ` Reason: ${d.reason}` : '');

/** Copy for every notification, kept in one place so wording stays consistent. */
const TEMPLATES: Record<
  NotificationType,
  (d: NotificationData) => { title: string; body: string }
> = {
  welcome: () => ({
    title: 'Welcome to PlanPilot',
    body: 'Pick a plan to unlock projects and team seats. You can switch plans at any time.',
  }),
  subscription_activated: (d) => ({
    title: `${d.plan} is active`,
    body: `Your plan is active until ${date(d)}.`,
  }),
  plan_upgraded: (d) => ({
    title: `Upgraded to ${d.plan}`,
    body: `Your new limits are live. The plan runs until ${date(d)}.`,
  }),
  plan_downgraded: (d) => ({
    title: `Switched to ${d.plan}`,
    body: `Unused days became credit. The plan runs until ${date(d)}.`,
  }),
  plan_renewed: (d) => ({
    title: `${d.plan} renewed`,
    body: `Welcome back! Your plan runs until ${date(d)}.`,
  }),
  payment_success: (d) => ({
    title: 'Payment received',
    body: `${formatInr(d.amount ?? 0)} paid for ${d.plan}. A receipt is in your billing history.`,
  }),
  payment_failed: (d) => ({
    title: 'Payment not completed',
    body: `Your ${d.plan} payment didn't go through, and nothing was charged. You can try again from Plans.`,
  }),
  expiring_soon: (d) => ({
    title: `${d.plan} expires in ${d.days} day${d.days === 1 ? '' : 's'}`,
    body: `Renew before ${date(d)} to keep your projects editable.`,
  }),
  expired: (d) => ({
    title: `${d.plan} has expired`,
    body: 'Your projects are read-only until you renew a plan.',
  }),
  cancelled: (d) => ({
    title: `${d.plan} cancelled`,
    body: 'Your projects are read-only now. Pick a plan whenever you are ready.',
  }),
  admin_plan_changed: (d) => ({
    title: `Your plan is now ${d.plan}`,
    body: `An administrator changed your plan. It runs until ${date(d)}.${why(d)}`,
  }),
  admin_plan_extended: (d) => ({
    title: 'Your plan was extended',
    body: `${d.plan} now runs until ${date(d)}.${why(d)}`,
  }),
  admin_plan_expired: (d) => ({
    title: 'Your plan was ended',
    body: `An administrator ended your ${d.plan} plan.${why(d)}`,
  }),
  account_status_changed: (d) => ({
    title:
      d.status === 'active'
        ? 'Your account is active again'
        : `Your account was set to ${d.status}`,
    body: d.status === 'active' ? 'Welcome back! Everything works as before.' : `${why(d).trim()}`,
  }),
  limit_reached: (d) => ({
    title: `${d.label} limit reached`,
    body: `You've used all ${d.limit} ${String(d.label).toLowerCase()} on ${d.plan}. Upgrade for more room.`,
  }),
};

export async function notify(
  userId: Types.ObjectId | string,
  type: NotificationType,
  data: NotificationData = {},
  session?: ClientSession,
): Promise<void> {
  const { title, body } = TEMPLATES[type](data);
  const stored = {
    ...data,
    ...(data.endDate ? { endDate: new Date(data.endDate).toISOString() } : {}),
  };
  try {
    await NotificationModel.create([{ userId, type, title, body, data: stored }], { session });
  } catch (error) {
    logger.error({ err: error, type }, 'Could not store notification');
  }
}

export function toNotificationDto(n: Notification): NotificationDto {
  return {
    id: n._id.toString(),
    type: n.type as NotificationType,
    title: n.title,
    body: n.body,
    data: (n.data as Record<string, unknown> | null) ?? null,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

const PAGE_SIZE = 20;

export async function listNotifications(
  userId: string,
  { unread, page }: { unread: boolean; page: number },
): Promise<NotificationListDto & { total: number }> {
  const filter = { userId, ...(unread ? { readAt: null } : {}) };
  const [items, total, unreadCount] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean<Notification[]>(),
    NotificationModel.countDocuments(filter),
    NotificationModel.countDocuments({ userId, readAt: null }),
  ]);
  return { items: items.map(toNotificationDto), unread: unreadCount, total };
}

export async function markRead(userId: string, id: string): Promise<void> {
  await NotificationModel.updateOne({ _id: id, userId, readAt: null }, { readAt: new Date() });
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await NotificationModel.updateMany(
    { userId, readAt: null },
    { readAt: new Date() },
  );
  return result.modifiedCount;
}

export const NOTIFICATIONS_PAGE_SIZE = PAGE_SIZE;

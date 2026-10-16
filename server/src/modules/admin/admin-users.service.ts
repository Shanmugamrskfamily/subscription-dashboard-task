import { ERROR_CODES, ONLINE_WINDOW_MINUTES } from '@planpilot/shared';
import type {
  AdminUserDetail,
  AdminUserQuery,
  AdminUserRow,
  DisplayStatus,
  PageMeta,
  Role,
  UserStatusInput,
} from '@planpilot/shared';
import type { Types } from 'mongoose';
import { ApiError } from '../../utils/api-error';
import { pageMeta } from '../../utils/respond';
import { logActivity, recentActivity } from '../activity/activity.service';
import { listSessions, revokeUserSessions } from '../auth/auth.service';
import { notify } from '../notifications/notification.service';
import type { Plan } from '../plans/plan.model';
import { toPlanSummary } from '../plans/plan.serializer';
import { SubscriptionModel } from '../subscriptions/subscription.model';
import type { AdminRowSource } from '../subscriptions/subscription.serializer';
import { toAdminRow, toSubscriptionDto } from '../subscriptions/subscription.serializer';
import { getCurrentPlan } from '../subscriptions/subscription.service';
import { UserModel } from '../users/user.model';
import type { User } from '../users/user.model';
import { toUserDto } from '../users/user.serializer';
import { escapeRegex } from './admin-subscriptions.service';

type LeanUser = User & { createdAt: Date };

/** Users whose most recent subscription has the given status. */
async function userIdsByLatestStatus(status: string): Promise<Types.ObjectId[]> {
  const rows = await SubscriptionModel.aggregate<{ _id: Types.ObjectId }>([
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$userId', status: { $first: '$status' } } },
    { $match: { status } },
  ]);
  return rows.map((r) => r._id);
}

async function toRows(users: LeanUser[]): Promise<AdminUserRow[]> {
  const ids = users.map((u) => u._id);
  const [active, latest] = await Promise.all([
    SubscriptionModel.find({ userId: { $in: ids }, status: 'active' })
      .populate<{ planId: Pick<Plan, '_id' | 'name' | 'slug'> }>('planId', 'name slug')
      .lean(),
    SubscriptionModel.aggregate<{ _id: Types.ObjectId; status: string }>([
      { $match: { userId: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$userId', status: { $first: '$status' } } },
    ]),
  ]);
  const activeByUser = new Map(active.map((s) => [s.userId.toString(), s]));
  const latestByUser = new Map(latest.map((s) => [s._id.toString(), s.status]));
  const onlineSince = Date.now() - ONLINE_WINDOW_MINUTES * 60_000;

  return users.map((u) => {
    const sub = activeByUser.get(u._id.toString());
    const status: DisplayStatus = sub
      ? 'active'
      : ((latestByUser.get(u._id.toString()) as DisplayStatus) ?? 'none');
    return {
      ...toUserDto(u),
      currentPlan: sub?.planId ? toPlanSummary(sub.planId) : null,
      subscriptionStatus: status,
      subscriptionEndDate: sub ? sub.endDate.toISOString() : null,
      usage: { projects: u.usage?.projects ?? 0, teamMembers: u.usage?.teamMembers ?? 0 },
      online: Boolean(u.lastSeenAt && u.lastSeenAt.getTime() >= onlineSince),
    };
  });
}

export async function listUsers(
  query: AdminUserQuery,
): Promise<{ items: AdminUserRow[]; meta: PageMeta }> {
  const filter: Record<string, unknown> = {};
  if (query.role !== 'all') filter.role = query.role;
  if (query.status !== 'all') filter.status = query.status;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  if (query.subscription === 'active') {
    filter._id = { $in: await SubscriptionModel.distinct('userId', { status: 'active' }) };
  } else if (query.subscription === 'none') {
    filter._id = { $nin: await SubscriptionModel.distinct('userId') };
  } else if (query.subscription !== 'all') {
    filter._id = { $in: await userIdsByLatestStatus(query.subscription) };
  }

  const sortField = query.sort.replace(/^-/, '');
  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .sort({ [sortField]: query.sort.startsWith('-') ? -1 : 1, _id: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean<LeanUser[]>(),
    UserModel.countDocuments(filter),
  ]);
  return { items: await toRows(users), meta: pageMeta(query.page, query.pageSize, total) };
}

export async function getUserDetail(id: string): Promise<AdminUserDetail> {
  const user = await UserModel.findById(id).lean<LeanUser>();
  if (!user) throw ApiError.notFound('User not found');
  const [[row], current, history, sessions, activity] = await Promise.all([
    toRows([user]),
    getCurrentPlan(id),
    SubscriptionModel.find({ userId: id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('userId', 'name email')
      .populate('planId', 'name slug')
      .lean<AdminRowSource[]>(),
    listSessions(id, ''),
    recentActivity({ $or: [{ 'target.id': id }, { actorId: user._id }] }, 15),
  ]);

  let subscription: AdminUserDetail['subscription'] = null;
  if (current) {
    const withAdmins = await SubscriptionModel.findById(current.sub._id)
      .populate('adjustments.by', 'name')
      .lean();
    subscription = toSubscriptionDto(
      (withAdmins ?? current.sub) as typeof current.sub,
      current.plan,
    );
  }

  return {
    user: row as AdminUserRow,
    subscription,
    history: history.map(toAdminRow),
    sessions,
    activity,
  };
}

async function otherActiveAdminExists(exceptId: string) {
  return Boolean(
    await UserModel.exists({ _id: { $ne: exceptId }, role: 'admin', status: 'active' }),
  );
}

export async function setUserStatus(
  adminId: string,
  id: string,
  input: UserStatusInput,
): Promise<AdminUserRow> {
  if (adminId === id) {
    throw ApiError.forbidden(
      'You cannot change your own account status',
      ERROR_CODES.SELF_ACTION_FORBIDDEN,
    );
  }
  const user = await UserModel.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'admin' && input.status !== 'active' && !(await otherActiveAdminExists(id))) {
    throw ApiError.conflict('At least one active admin must remain', ERROR_CODES.LAST_ADMIN);
  }

  user.set({
    status: input.status,
    statusReason: input.status === 'active' ? null : input.reason,
    statusChangedAt: new Date(),
    statusChangedBy: adminId,
    accessExpiresAt: input.accessExpiresAt ?? null,
  });
  await user.save();

  // Inactive or blocked: sign them out everywhere right now.
  if (input.status !== 'active') await revokeUserSessions(id, `admin_${input.status}`);
  await notify(id, 'account_status_changed', { status: input.status, reason: input.reason });
  await logActivity({
    actorId: adminId,
    action: `admin.user.${input.status === 'active' ? 'activated' : input.status}`,
    target: { type: 'user', id, label: user.email },
    meta: {
      reason: input.reason,
      accessExpiresAt: input.accessExpiresAt ? new Date(input.accessExpiresAt).toISOString() : null,
    },
  });
  const [row] = await toRows([user.toObject() as LeanUser]);
  return row as AdminUserRow;
}

export async function setUserRole(adminId: string, id: string, role: Role): Promise<AdminUserRow> {
  if (adminId === id) {
    throw ApiError.forbidden('You cannot change your own role', ERROR_CODES.SELF_ACTION_FORBIDDEN);
  }
  const user = await UserModel.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'admin' && role !== 'admin' && !(await otherActiveAdminExists(id))) {
    throw ApiError.conflict('At least one active admin must remain', ERROR_CODES.LAST_ADMIN);
  }
  if (role === 'admin' && (await SubscriptionModel.exists({ userId: id, status: 'active' }))) {
    throw ApiError.conflict('End this user’s active plan before making them an admin');
  }
  user.role = role;
  await user.save();
  await revokeUserSessions(id, 'role_changed');
  await logActivity({
    actorId: adminId,
    action: 'admin.user.role_changed',
    target: { type: 'user', id, label: user.email },
    meta: { role },
  });
  const [row] = await toRows([user.toObject() as LeanUser]);
  return row as AdminUserRow;
}

export async function forceSignOut(adminId: string, id: string): Promise<{ revoked: number }> {
  const user = await UserModel.findById(id).select('email').lean();
  if (!user) throw ApiError.notFound('User not found');
  const revoked = await revokeUserSessions(id, 'admin_signed_out');
  await logActivity({
    actorId: adminId,
    action: 'admin.user.signed_out',
    target: { type: 'user', id, label: user.email },
    meta: { revoked },
  });
  return { revoked };
}

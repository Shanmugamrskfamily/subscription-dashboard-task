import { DAY_MS, EXPIRING_SOON_DAYS, ONLINE_WINDOW_MINUTES } from '@planpilot/shared';
import type { AdminRange, AdminStatsDto } from '@planpilot/shared';
import { PaymentModel } from '../payments/payment.model';
import { PlanModel } from '../plans/plan.model';
import { SubscriptionModel } from '../subscriptions/subscription.model';
import type { EndReason } from '../subscriptions/subscription.model';
import type { AdminRowSource } from '../subscriptions/subscription.serializer';
import { toAdminRow } from '../subscriptions/subscription.serializer';
import { UserModel } from '../users/user.model';

const TZ = 'Asia/Kolkata';
const RANGE_DAYS: Record<AdminRange, number> = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };
const CHURN_REASONS: EndReason[] = ['expired', 'cancelled', 'admin_expired', 'admin_cancelled'];
const KEY_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dayKey = (d: Date) => KEY_DAY.format(d); // YYYY-MM-DD in Indian time
const monthKey = (d: Date) => dayKey(d).slice(0, 7);
const round1 = (n: number) => Math.round(n * 10) / 10;

function bucketKeys(range: AdminRange, now: Date): string[] {
  if (range === '12m') {
    const keys: string[] = [];
    const [y = 0, m = 1] = monthKey(now).split('-').map(Number);
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(Date.UTC(y, m - 1 - i, 15));
      keys.push(monthKey(date));
    }
    return keys;
  }
  const days = RANGE_DAYS[range];
  return Array.from({ length: days }, (_, i) =>
    dayKey(new Date(now.getTime() - (days - 1 - i) * DAY_MS)),
  );
}

/** Sum of plan prices normalised to 30 days, over plans active at `at`. */
async function mrrAt(at: Date, current: boolean) {
  const match = current
    ? { status: 'active', endDate: { $gt: at } }
    : {
        startDate: { $lte: at },
        endDate: { $gt: at },
        $or: [{ endedAt: null }, { endedAt: { $gt: at } }],
      };
  const [row] = await SubscriptionModel.aggregate<{ mrr: number; count: number }>([
    { $match: match },
    { $lookup: { from: 'plans', localField: 'planId', foreignField: '_id', as: 'plan' } },
    { $unwind: '$plan' },
    {
      $group: {
        _id: null,
        mrr: { $sum: { $divide: [{ $multiply: ['$plan.price', 30] }, '$plan.durationDays'] } },
        count: { $sum: 1 },
      },
    },
  ]);
  return { mrr: Math.round(row?.mrr ?? 0), count: row?.count ?? 0 };
}

async function revenueBetween(from: Date, to: Date) {
  const [row] = await PaymentModel.aggregate<{ total: number }>([
    { $match: { status: 'paid', paidAt: { $gte: from, $lt: to } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return row?.total ?? 0;
}

const countNewSubscriptions = (from: Date, to: Date) =>
  SubscriptionModel.countDocuments({
    createdAt: { $gte: from, $lt: to },
    changeType: { $in: ['new', 'renewal'] },
  });

const countChurned = (from: Date, to: Date) =>
  SubscriptionModel.countDocuments({
    endedAt: { $gte: from, $lt: to },
    endReason: { $in: CHURN_REASONS },
  });

async function seriesFor(range: AdminRange, start: Date, now: Date) {
  const format = range === '12m' ? '%Y-%m' : '%Y-%m-%d';
  const group = (field: string, sum: unknown = 1) => [
    {
      $group: {
        _id: { $dateToString: { date: `$${field}`, format, timezone: TZ } },
        value: { $sum: sum },
      },
    },
  ];
  const [revenue, subs, signups] = await Promise.all([
    PaymentModel.aggregate<{ _id: string; value: number }>([
      { $match: { status: 'paid', paidAt: { $gte: start, $lte: now } } },
      ...group('paidAt', '$amount'),
    ]),
    SubscriptionModel.aggregate<{ _id: string; value: number }>([
      {
        $match: { createdAt: { $gte: start, $lte: now }, changeType: { $in: ['new', 'renewal'] } },
      },
      ...group('createdAt'),
    ]),
    UserModel.aggregate<{ _id: string; value: number }>([
      { $match: { role: 'user', createdAt: { $gte: start, $lte: now } } },
      ...group('createdAt'),
    ]),
  ]);
  const toMap = (rows: { _id: string; value: number }[]) =>
    new Map(rows.map((r) => [r._id, r.value]));
  const [r, s, u] = [toMap(revenue), toMap(subs), toMap(signups)];
  return bucketKeys(range, now).map((date) => ({
    date,
    revenue: r.get(date) ?? 0,
    newSubscriptions: s.get(date) ?? 0,
    signups: u.get(date) ?? 0,
  }));
}

async function usersAtLimitCount() {
  const [row] = await SubscriptionModel.aggregate<{ count: number }>([
    { $match: { status: 'active' } },
    { $lookup: { from: 'plans', localField: 'planId', foreignField: '_id', as: 'plan' } },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$plan' },
    { $unwind: '$user' },
    {
      $match: {
        $expr: {
          $or: [
            {
              $and: [
                { $ne: ['$plan.limits.projects', null] },
                { $gte: ['$user.usage.projects', '$plan.limits.projects'] },
              ],
            },
            {
              $and: [
                { $ne: ['$plan.limits.teamMembers', null] },
                { $gte: ['$user.usage.teamMembers', '$plan.limits.teamMembers'] },
              ],
            },
          ],
        },
      },
    },
    { $count: 'count' },
  ]);
  return row?.count ?? 0;
}

async function statusBreakdown(totalUsers: number) {
  const rows = await SubscriptionModel.aggregate<{ _id: string; count: number }>([
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$userId', status: { $first: '$status' } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const get = (s: string) => rows.find((r) => r._id === s)?.count ?? 0;
  const withHistory = rows.reduce((n, r) => n + r.count, 0);
  return {
    active: get('active'),
    expired: get('expired'),
    cancelled: get('cancelled'),
    none: Math.max(0, totalUsers - withHistory),
  };
}

export async function getAdminStats(range: AdminRange, now = new Date()): Promise<AdminStatsDto> {
  const days = RANGE_DAYS[range];
  const start = new Date(now.getTime() - days * DAY_MS);
  const prevStart = new Date(start.getTime() - days * DAY_MS);
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MINUTES * 60_000);
  const expiringBy = new Date(now.getTime() + Math.max(7, EXPIRING_SOON_DAYS) * DAY_MS);

  const [
    totalUsers,
    newUsers,
    prevNewUsers,
    mrrNow,
    mrrStart,
    mrrPrevStart,
    revenue,
    prevRevenue,
    newSubs,
    prevNewSubs,
    churned,
    prevChurned,
    onlineUsers,
    onlineNow,
    active24h,
    active7d,
    expiringCount,
    expiringRows,
    recentRows,
    series,
    planCounts,
    planRevenue,
    plans,
    atLimit,
  ] = await Promise.all([
    UserModel.countDocuments({ role: 'user' }),
    UserModel.countDocuments({ role: 'user', createdAt: { $gte: start, $lt: now } }),
    UserModel.countDocuments({ role: 'user', createdAt: { $gte: prevStart, $lt: start } }),
    mrrAt(now, true),
    mrrAt(start, false),
    mrrAt(prevStart, false),
    revenueBetween(start, now),
    revenueBetween(prevStart, start),
    countNewSubscriptions(start, now),
    countNewSubscriptions(prevStart, start),
    countChurned(start, now),
    countChurned(prevStart, start),
    UserModel.find({ lastSeenAt: { $gte: onlineSince } })
      .sort({ lastSeenAt: -1 })
      .limit(8)
      .select('name email lastSeenAt')
      .lean(),
    UserModel.countDocuments({ lastSeenAt: { $gte: onlineSince } }),
    UserModel.countDocuments({ lastSeenAt: { $gte: new Date(now.getTime() - DAY_MS) } }),
    UserModel.countDocuments({ lastSeenAt: { $gte: new Date(now.getTime() - 7 * DAY_MS) } }),
    SubscriptionModel.countDocuments({ status: 'active', endDate: { $gt: now, $lte: expiringBy } }),
    SubscriptionModel.find({ status: 'active', endDate: { $gt: now, $lte: expiringBy } })
      .sort({ endDate: 1 })
      .limit(6)
      .populate('userId', 'name email')
      .populate('planId', 'name slug')
      .lean<AdminRowSource[]>(),
    SubscriptionModel.find()
      .sort({ createdAt: -1 })
      .limit(6)
      .populate('userId', 'name email')
      .populate('planId', 'name slug')
      .lean<AdminRowSource[]>(),
    seriesFor(range, start, now),
    SubscriptionModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { status: 'active' } },
      { $group: { _id: '$planId', count: { $sum: 1 } } },
    ]),
    PaymentModel.aggregate<{ _id: unknown; revenue: number }>([
      { $match: { status: 'paid', paidAt: { $gte: start, $lt: now } } },
      { $group: { _id: '$planId', revenue: { $sum: '$amount' } } },
    ]),
    PlanModel.find().sort({ tier: 1, price: 1 }).select('name slug isActive').lean(),
    usersAtLimitCount(),
  ]);

  const countByPlan = new Map(planCounts.map((p) => [String(p._id), p.count]));
  const revenueByPlan = new Map(planRevenue.map((p) => [String(p._id), p.revenue]));
  const churnRate = (lost: number, base: number) => (base ? round1((lost / base) * 100) : 0);

  return {
    range,
    generatedAt: now.toISOString(),
    kpis: {
      mrr: { value: mrrNow.mrr, previous: mrrStart.mrr },
      revenue: { value: revenue, previous: prevRevenue },
      activeSubscribers: { value: mrrNow.count, previous: mrrStart.count },
      newSubscriptions: { value: newSubs, previous: prevNewSubs },
      newUsers: { value: newUsers, previous: prevNewUsers },
      churnRate: {
        value: churnRate(churned, mrrStart.count),
        previous: churnRate(prevChurned, mrrPrevStart.count),
      },
      totalUsers,
      onlineNow,
      activeUsers24h: active24h,
      activeUsers7d: active7d,
      expiringSoon: expiringCount,
      usersAtLimit: atLimit,
    },
    series,
    planMix: plans
      .filter((p) => p.isActive || countByPlan.has(p._id.toString()))
      .map((p) => ({
        planId: p._id.toString(),
        name: p.name,
        slug: p.slug,
        count: countByPlan.get(p._id.toString()) ?? 0,
        revenue: revenueByPlan.get(p._id.toString()) ?? 0,
      })),
    statusBreakdown: await statusBreakdown(totalUsers),
    onlineUsers: onlineUsers.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      lastSeenAt: (u.lastSeenAt ?? now).toISOString(),
    })),
    expiringSoon: expiringRows.map(toAdminRow),
    recentSubscriptions: recentRows.map(toAdminRow),
  };
}

import { DAY_MS, PROJECT_COLORS } from '@planpilot/shared';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { getConfig } from '../config/env';
import { ActivityModel } from '../modules/activity/activity.model';
import { SessionModel } from '../modules/auth/session.model';
import { NotificationModel } from '../modules/notifications/notification.model';
import { PaymentModel } from '../modules/payments/payment.model';
import { PlanModel } from '../modules/plans/plan.model';
import { SubscriptionModel } from '../modules/subscriptions/subscription.model';
import { UserModel } from '../modules/users/user.model';
import { ProjectModel, TeamMemberModel } from '../modules/workspace/workspace.models';
import { logger } from '../utils/logger';
import { PLAN_SEED } from './plans.data';
import type { PlanSlug } from './plans.data';

/**
 * Demo database: four real plans plus about 60 sample users with six months of
 * plan history, payments, usage and notifications, so every chart and table has
 * something to show. All sample accounts use the planpilot.demo domain, which is
 * how a reset finds them. "Online now" is never faked: it only counts real activity.
 */
export const DEMO_DOMAIN = 'planpilot.demo';
export const DEMO_PASSWORD = 'Demo@12345';
export const ADMIN_PASSWORD = 'Admin@12345';

export const DEMO_ACCOUNTS = {
  admin: `admin@${DEMO_DOMAIN}`,
  active: `priya@${DEMO_DOMAIN}`,
  expiring: `kavya@${DEMO_DOMAIN}`,
  expired: `arjun@${DEMO_DOMAIN}`,
  fresh: `neha@${DEMO_DOMAIN}`,
  atLimit: `dev@${DEMO_DOMAIN}`,
  blocked: `rohan@${DEMO_DOMAIN}`,
  inactive: `sneha@${DEMO_DOMAIN}`,
  accessExpired: `vikram@${DEMO_DOMAIN}`,
} as const;

const FIRST = [
  'Aditya',
  'Ishaan',
  'Kabir',
  'Rahul',
  'Siddharth',
  'Varun',
  'Karthik',
  'Nikhil',
  'Harsh',
  'Manav',
  'Ritika',
  'Ananya',
  'Meera',
  'Pooja',
  'Divya',
  'Shreya',
  'Tanvi',
  'Aisha',
  'Lakshmi',
  'Nandini',
  'Farhan',
  'Gaurav',
  'Yash',
  'Rhea',
  'Simran',
  'Arnav',
];
const LAST = [
  'Sharma',
  'Iyer',
  'Reddy',
  'Nair',
  'Gupta',
  'Menon',
  'Patel',
  'Rao',
  'Das',
  'Kulkarni',
  'Bose',
  'Pillai',
  'Chopra',
  'Khan',
  'Singh',
  'Joshi',
  'Verma',
  'Krishnan',
];
const PROJECTS: [name: string, description: string][] = [
  ['Website redesign', 'New marketing site with faster pages and a clearer pricing story.'],
  ['Mobile app launch', 'Ship the Android and iOS apps to the first 500 beta users.'],
  ['Q4 marketing', 'Diwali campaign, partner webinars and the year-end newsletter.'],
  ['Customer portal', 'Self-serve invoices, plan changes and support tickets.'],
  ['Brand refresh', 'Updated logo, colours and illustration style across channels.'],
  ['Onboarding flow', 'Cut time to first value with a guided setup checklist.'],
  ['Analytics revamp', 'Move dashboards to one event model and retire old reports.'],
  ['Partner program', 'Referral tiers, payouts and a partner resource hub.'],
  ['Help centre', 'Rewrite the top 40 articles and add in-app search.'],
  ['Pricing experiment', 'Test annual-first pricing on the plans page for four weeks.'],
  ['Billing migration', 'Move recurring billing to the new payment provider.'],
  ['Data warehouse', 'Nightly sync of product and billing data for reporting.'],
];
const TEAM_FIRST = [
  'Asha',
  'Bala',
  'Chitra',
  'Deepak',
  'Esha',
  'Faisal',
  'Geeta',
  'Hari',
  'Indu',
  'Jai',
  'Kiran',
  'Leela',
  'Mohan',
  'Nisha',
  'Omkar',
];

/** Small seeded PRNG, so every reset produces the same story. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type PlanRecord = {
  _id: Types.ObjectId;
  slug: string;
  price: number;
  durationDays: number;
  tier: number;
  name: string;
  limits: { projects: number | null; teamMembers: number | null };
};

interface Docs {
  users: Record<string, unknown>[];
  subs: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  team: Record<string, unknown>[];
  activities: Record<string, unknown>[];
}

class SeedBuilder {
  readonly docs: Docs = {
    users: [],
    subs: [],
    payments: [],
    notifications: [],
    projects: [],
    team: [],
    activities: [],
  };
  private readonly rand = mulberry32(2026);

  constructor(
    readonly now: Date,
    readonly plans: Map<string, PlanRecord>,
    private readonly userHash: string,
    private readonly adminHash: string,
  ) {}

  ago = (days: number) => new Date(this.now.getTime() - days * DAY_MS);
  /** Sample activity always ends at least 30 minutes ago, so "online now" only shows real people. */
  seen = (date: Date) => new Date(Math.min(date.getTime(), this.now.getTime() - 30 * 60_000));
  after = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
  int = (min: number, max: number) => Math.floor(this.rand() * (max - min + 1)) + min;
  pick = <T>(items: readonly T[]) => items[Math.floor(this.rand() * items.length)] as T;
  chance = (p: number) => this.rand() < p;
  ref = (prefix: string) =>
    `${prefix}_${Array.from({ length: 14 }, () => this.pick('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'.split(''))).join('')}`;

  plan(slug: PlanSlug) {
    const plan = this.plans.get(slug);
    if (!plan) throw new Error(`Plan ${slug} is missing`);
    return plan;
  }

  user(
    input: {
      name: string;
      email: string;
      createdAt: Date;
      role?: 'user' | 'admin';
      lastSeenAt?: Date | null;
    } & Record<string, unknown>,
  ) {
    const _id = new Types.ObjectId();
    const { role = 'user', ...rest } = input;
    this.docs.users.push({
      _id,
      role,
      passwordHash: role === 'admin' ? this.adminHash : this.userHash,
      status: 'active',
      usage: { projects: 0, teamMembers: 0 },
      updatedAt: input.createdAt,
      ...rest,
    });
    return _id;
  }

  subscription(input: {
    userId: Types.ObjectId;
    slug: PlanSlug;
    start: Date;
    end?: Date;
    status: 'active' | 'expired' | 'cancelled';
    changeType: string;
    amountPaid?: number;
    endReason?: string | null;
    endedAt?: Date | null;
    previousId?: Types.ObjectId | null;
    extra?: Record<string, unknown>;
  }) {
    const plan = this.plan(input.slug);
    const _id = new Types.ObjectId();
    const amountPaid = input.amountPaid ?? plan.price;
    const end = input.end ?? this.after(input.start, plan.durationDays);
    let paymentId: Types.ObjectId | null = null;
    if (amountPaid > 0) {
      paymentId = new Types.ObjectId();
      this.docs.payments.push({
        _id: paymentId,
        userId: input.userId,
        planId: plan._id,
        subscriptionId: _id,
        provider: 'simulated',
        razorpayOrderId: this.ref('order'),
        razorpayPaymentId: this.ref('pay'),
        amount: amountPaid,
        status: 'paid',
        changeType: input.changeType,
        quote: {
          credit: plan.price - amountPaid,
          price: plan.price,
          bonusDays: 0,
          durationDays: plan.durationDays,
          creditBasis: plan.price,
          currentSubscriptionId: input.previousId ?? null,
        },
        paidAt: input.start,
        createdAt: input.start,
        updatedAt: input.start,
      });
    }
    this.docs.subs.push({
      _id,
      userId: input.userId,
      planId: plan._id,
      startDate: input.start,
      endDate: end,
      status: input.status,
      amountPaid,
      creditBasis: input.changeType === 'admin_assign' ? 0 : plan.price,
      changeType: input.changeType,
      previousSubscriptionId: input.previousId ?? null,
      paymentId,
      endedAt: input.endedAt ?? null,
      endReason: input.endReason ?? null,
      adjustments: [],
      createdAt: input.start,
      updatedAt: input.start,
      ...input.extra,
    });
    return { _id, end };
  }

  workspace(userId: Types.ObjectId, projects: number, members: number, createdAt: Date) {
    const user = this.docs.users.find((u) => u._id === userId);
    if (user) user.usage = { projects, teamMembers: members };
    for (let i = 0; i < projects; i += 1) {
      const [name, description] = PROJECTS[i % PROJECTS.length] ?? ['Project', ''];
      this.docs.projects.push({
        ownerId: userId,
        name,
        description,
        color: PROJECT_COLORS[i % PROJECT_COLORS.length],
        createdAt: this.after(createdAt, i),
        updatedAt: this.after(createdAt, i),
      });
    }
    for (let i = 0; i < members; i += 1) {
      const first = TEAM_FIRST[i % TEAM_FIRST.length] as string;
      this.docs.team.push({
        ownerId: userId,
        name: `${first} ${LAST[(i * 7) % LAST.length]}`,
        email: `${first.toLowerCase()}.${i + 1}.${userId.toString().slice(-4)}@example.com`,
        role: i % 3 === 0 ? 'editor' : 'viewer',
        createdAt: this.after(createdAt, i),
        updatedAt: this.after(createdAt, i),
      });
    }
  }

  notification(
    userId: Types.ObjectId,
    type: string,
    title: string,
    body: string,
    createdAt: Date,
    read: boolean,
  ) {
    this.docs.notifications.push({
      userId,
      type,
      title,
      body,
      data: null,
      readAt: read ? createdAt : null,
      createdAt,
    });
  }

  activity(
    actorId: Types.ObjectId | null,
    action: string,
    target: { type: string; id: string; label: string },
    createdAt: Date,
    meta: Record<string, unknown> | null = null,
  ) {
    this.docs.activities.push({ actorId, action, target, meta, createdAt });
  }

  /** A sample customer with a believable plan history from sign-up until today. */
  generatedCustomer(index: number) {
    const first = this.pick(FIRST);
    const last = this.pick(LAST);
    // Skewed towards recent sign-ups, so the growth chart trends upward.
    const createdAt = this.ago(Math.floor(Math.pow(this.rand(), 1.5) * 175) + 1);
    const userId = this.user({
      name: `${first} ${last}`,
      email: `${first}.${last}.${index}@${DEMO_DOMAIN}`.toLowerCase(),
      createdAt,
      lastSeenAt: null,
    });
    const user = this.docs.users.at(-1) as Record<string, unknown>;

    if (this.chance(0.17)) {
      user.lastSeenAt = this.seen(this.after(createdAt, this.int(0, 3)));
      return;
    }

    const weights: [PlanSlug, number][] = [
      ['starter', 0.36],
      ['pro', 0.4],
      ['business', 0.14],
      ['pro-annual', 0.1],
    ];
    let roll = this.rand();
    let slug: PlanSlug = 'starter';
    for (const [s, w] of weights) {
      if ((roll -= w) <= 0) {
        slug = s;
        break;
      }
    }

    let cursor = this.after(createdAt, this.rand() * 3);
    let changeType = 'new';
    let previousId: Types.ObjectId | null = null;
    let active = false;
    const tiers: PlanSlug[] = ['starter', 'pro', 'business'];

    for (let guard = 0; guard < 12; guard += 1) {
      const plan = this.plan(slug);
      const end = this.after(cursor, plan.durationDays);
      if (end > this.now) {
        this.subscription({
          userId,
          slug,
          start: cursor,
          status: 'active',
          changeType,
          previousId,
        });
        active = true;
        break;
      }
      const r = this.rand();
      if (r < 0.14) {
        this.subscription({
          userId,
          slug,
          start: cursor,
          status: 'expired',
          changeType,
          previousId,
          endReason: 'expired',
          endedAt: end,
          extra: { notifiedExpiredAt: end },
        });
        break;
      }
      if (r < 0.19) {
        const endedAt = this.after(cursor, this.rand() * plan.durationDays);
        this.subscription({
          userId,
          slug,
          start: cursor,
          end,
          status: 'cancelled',
          changeType,
          previousId,
          endReason: 'cancelled',
          endedAt,
        });
        break;
      }
      const { _id } = this.subscription({
        userId,
        slug,
        start: cursor,
        status: 'expired',
        changeType,
        previousId,
        endReason: 'replaced',
        endedAt: end,
      });
      previousId = _id;
      cursor = end;
      const tierIndex = tiers.indexOf(slug === 'pro-annual' ? 'pro' : slug);
      const next = this.rand();
      if (next < 0.18 && tierIndex < 2) {
        slug = tiers[tierIndex + 1] as PlanSlug;
        changeType = 'upgrade';
      } else if (next < 0.28 && tierIndex > 0) {
        slug = tiers[tierIndex - 1] as PlanSlug;
        changeType = 'downgrade';
      } else {
        changeType = 'renewal';
      }
    }

    const plan = this.plan(slug);
    if (active) {
      user.lastSeenAt = this.seen(
        this.chance(0.3)
          ? new Date(this.now.getTime() - this.int(30, 20 * 60) * 60_000)
          : this.ago(this.rand() * 6),
      );
      const maxProjects = plan.limits.projects ?? 14;
      const maxMembers = plan.limits.teamMembers ?? 18;
      const atLimit = plan.limits.projects !== null && this.chance(0.25);
      this.workspace(
        userId,
        atLimit ? maxProjects : this.int(0, Math.min(maxProjects, 9)),
        this.int(0, Math.min(maxMembers, 8)),
        cursor,
      );
    } else {
      user.lastSeenAt = this.seen(this.ago(this.int(5, 40)));
      this.workspace(userId, this.int(0, 2), this.int(0, 1), cursor);
    }
  }
}

async function upsertPlans(fresh: boolean) {
  for (const plan of PLAN_SEED) {
    const data = {
      ...plan,
      limits: { ...plan.limits },
      features: [...plan.features],
      isActive: true,
    };
    await PlanModel.updateOne(
      { slug: plan.slug },
      fresh ? { $set: data } : { $setOnInsert: data },
      { upsert: true },
    );
  }
}

async function removeDemoData() {
  const users = await UserModel.find({ email: { $regex: `@${DEMO_DOMAIN.replace('.', '\\.')}$` } })
    .select('_id')
    .lean();
  const ids = users.map((u) => u._id);
  const idStrings = ids.map((id) => id.toString());
  await Promise.all([
    SubscriptionModel.deleteMany({ userId: { $in: ids } }),
    PaymentModel.deleteMany({ userId: { $in: ids } }),
    NotificationModel.deleteMany({ userId: { $in: ids } }),
    ProjectModel.deleteMany({ ownerId: { $in: ids } }),
    TeamMemberModel.deleteMany({ ownerId: { $in: ids } }),
    SessionModel.deleteMany({ userId: { $in: ids } }),
    ActivityModel.deleteMany({
      $or: [{ actorId: { $in: ids } }, { 'target.id': { $in: idStrings } }],
    }),
  ]);
  await UserModel.deleteMany({ _id: { $in: ids } });
}

export async function ensureSeedData({ fresh = false, now = new Date() } = {}): Promise<{
  seeded: boolean;
}> {
  await upsertPlans(fresh);
  if (fresh) await removeDemoData();
  else if (await UserModel.exists({ email: DEMO_ACCOUNTS.admin })) return { seeded: false };

  const config = getConfig();
  const [userHash, adminHash] = await Promise.all([
    bcrypt.hash(DEMO_PASSWORD, config.bcryptRounds),
    bcrypt.hash(ADMIN_PASSWORD, config.bcryptRounds),
  ]);
  const plans = new Map(
    (await PlanModel.find().lean()).map((p) => [p.slug, p as unknown as PlanRecord]),
  );
  const b = new SeedBuilder(now, plans, userHash, adminHash);

  // --- admin ---
  const adminId = b.user({
    name: 'Ananya Iyer',
    email: DEMO_ACCOUNTS.admin,
    role: 'admin',
    createdAt: b.ago(190),
    lastSeenAt: b.ago(0.1),
  });

  // --- Priya: Pro, upgraded mid-cycle from Starter (shows proration in billing) ---
  const priya = b.user({
    name: 'Priya Sharma',
    email: DEMO_ACCOUNTS.active,
    createdAt: b.ago(48),
    lastSeenAt: b.ago(0.6),
  });
  const starter = b.subscription({
    userId: priya,
    slug: 'starter',
    start: b.ago(40),
    status: 'cancelled',
    changeType: 'new',
    endReason: 'replaced',
    endedAt: b.ago(12),
  });
  const credit = Math.floor((29_900 * 2) / 30); // 2 unused Starter days
  b.subscription({
    userId: priya,
    slug: 'pro',
    start: b.ago(12),
    status: 'active',
    changeType: 'upgrade',
    amountPaid: 79_900 - credit,
    previousId: starter._id,
  });
  b.workspace(priya, 3, 8, b.ago(38));
  b.notification(
    priya,
    'welcome',
    'Welcome to PlanPilot',
    'Pick a plan to unlock projects and team seats. You can switch plans at any time.',
    b.ago(48),
    true,
  );
  b.notification(
    priya,
    'plan_upgraded',
    'Upgraded to Pro',
    'Your new limits are live. Unused Starter days were credited.',
    b.ago(12),
    false,
  );
  b.notification(
    priya,
    'payment_success',
    'Payment received',
    `₹${((79_900 - credit) / 100).toFixed(2)} paid for Pro. A receipt is in your billing history.`,
    b.ago(12),
    false,
  );

  // --- Kavya: Pro ending in 2 days (the reminder job notifies her on boot) ---
  const kavya = b.user({
    name: 'Kavya Sundaram',
    email: DEMO_ACCOUNTS.expiring,
    createdAt: b.ago(30),
    lastSeenAt: b.ago(1.2),
  });
  b.subscription({
    userId: kavya,
    slug: 'pro',
    start: b.ago(28),
    status: 'active',
    changeType: 'new',
  });
  b.workspace(kavya, 6, 4, b.ago(27));

  // --- Arjun: Starter expired six days ago ---
  const arjun = b.user({
    name: 'Arjun Nair',
    email: DEMO_ACCOUNTS.expired,
    createdAt: b.ago(40),
    lastSeenAt: b.ago(6),
  });
  b.subscription({
    userId: arjun,
    slug: 'starter',
    start: b.ago(36),
    status: 'expired',
    changeType: 'new',
    endReason: 'expired',
    endedAt: b.ago(6),
    extra: { notifiedExpiredAt: b.ago(6), remindedExpiringAt: b.ago(9) },
  });
  b.workspace(arjun, 2, 1, b.ago(35));
  b.notification(
    arjun,
    'expiring_soon',
    'Starter expires in 3 days',
    'Renew before the end date to keep your projects editable.',
    b.ago(9),
    true,
  );
  b.notification(
    arjun,
    'expired',
    'Starter has expired',
    'Your projects are read-only until you renew a plan.',
    b.ago(6),
    false,
  );

  // --- Neha: brand new, no plan ---
  const neha = b.user({
    name: 'Neha Gupta',
    email: DEMO_ACCOUNTS.fresh,
    createdAt: b.ago(1),
    lastSeenAt: b.ago(1),
  });
  b.notification(
    neha,
    'welcome',
    'Welcome to PlanPilot',
    'Pick a plan to unlock projects and team seats. You can switch plans at any time.',
    b.ago(1),
    false,
  );

  // --- Dev: Starter at the project limit (3 of 3) ---
  const dev = b.user({
    name: 'Dev Malhotra',
    email: DEMO_ACCOUNTS.atLimit,
    createdAt: b.ago(12),
    lastSeenAt: b.ago(2),
  });
  b.subscription({
    userId: dev,
    slug: 'starter',
    start: b.ago(10),
    status: 'active',
    changeType: 'new',
  });
  b.workspace(dev, 3, 1, b.ago(9));

  // --- restricted accounts (each shows its own login error) ---
  const rohan = b.user({
    name: 'Rohan Mehta',
    email: DEMO_ACCOUNTS.blocked,
    createdAt: b.ago(60),
    lastSeenAt: b.ago(4),
    status: 'blocked',
    statusReason: 'Payment dispute under review',
    statusChangedAt: b.ago(3),
    statusChangedBy: adminId,
  });
  b.subscription({
    userId: rohan,
    slug: 'pro',
    start: b.ago(5),
    status: 'active',
    changeType: 'renewal',
  });
  const sneha = b.user({
    name: 'Sneha Reddy',
    email: DEMO_ACCOUNTS.inactive,
    createdAt: b.ago(90),
    lastSeenAt: b.ago(21),
    status: 'inactive',
    statusReason: "Account paused at the customer's request",
    statusChangedAt: b.ago(20),
    statusChangedBy: adminId,
  });
  b.subscription({
    userId: sneha,
    slug: 'starter',
    start: b.ago(50),
    status: 'expired',
    changeType: 'new',
    endReason: 'expired',
    endedAt: b.ago(20),
    extra: { notifiedExpiredAt: b.ago(20) },
  });
  const vikram = b.user({
    name: 'Vikram Joshi',
    email: DEMO_ACCOUNTS.accessExpired,
    createdAt: b.ago(75),
    lastSeenAt: b.ago(4),
    statusReason: 'Contract access window ended',
    accessExpiresAt: b.ago(3),
    statusChangedBy: adminId,
    statusChangedAt: b.ago(30),
  });
  b.subscription({
    userId: vikram,
    slug: 'business',
    start: b.ago(20),
    status: 'active',
    changeType: 'new',
  });

  for (let i = 1; i <= 52; i += 1) b.generatedCustomer(i);

  // --- admin activity feed ---
  b.activity(
    adminId,
    'admin.user.blocked',
    { type: 'user', id: rohan.toString(), label: DEMO_ACCOUNTS.blocked },
    b.ago(3),
    { reason: 'Payment dispute under review' },
  );
  b.activity(
    adminId,
    'admin.user.inactive',
    { type: 'user', id: sneha.toString(), label: DEMO_ACCOUNTS.inactive },
    b.ago(20),
    { reason: "Account paused at the customer's request" },
  );
  b.activity(
    priya,
    'subscription.upgrade',
    { type: 'user', id: priya.toString(), label: DEMO_ACCOUNTS.active },
    b.ago(12),
    { plan: 'Pro' },
  );
  b.activity(
    neha,
    'auth.registered',
    { type: 'user', id: neha.toString(), label: DEMO_ACCOUNTS.fresh },
    b.ago(1),
  );
  b.activity(
    adminId,
    'admin.plan.updated',
    { type: 'plan', id: b.plan('business')._id.toString(), label: 'Business' },
    b.ago(8),
  );

  const { docs } = b;
  await UserModel.insertMany(docs.users);
  await Promise.all([
    SubscriptionModel.insertMany(docs.subs),
    PaymentModel.insertMany(docs.payments),
    NotificationModel.insertMany(docs.notifications),
    ProjectModel.insertMany(docs.projects),
    TeamMemberModel.insertMany(docs.team),
    ActivityModel.insertMany(docs.activities),
  ]);
  logger.info(
    { users: docs.users.length, subscriptions: docs.subs.length, payments: docs.payments.length },
    'Demo data seeded',
  );
  return { seeded: true };
}

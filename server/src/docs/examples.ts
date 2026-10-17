import type {
  ActivityDto,
  AdminStatsDto,
  AdminSubscriptionRow,
  AdminUserDetail,
  AdminUserRow,
  AuthResponse,
  CheckoutOrder,
  MySubscriptionDto,
  NotificationListDto,
  PageMeta,
  PaymentDto,
  PlanDto,
  ProjectDto,
  ProrationQuote,
  SessionDto,
  SubscriptionDto,
  TeamMemberDto,
  UserDto,
} from '@planpilot/shared';

/**
 * Example payloads for the docs, typed against the shared DTOs so they cannot drift
 * from what the API really returns. Amounts are integer paise (₹799 = 79900).
 */

export const IDS = {
  starter: '66f1a2b3c4d5e6f708192a01',
  pro: '66f1a2b3c4d5e6f708192a02',
  business: '66f1a2b3c4d5e6f708192a03',
  proAnnual: '66f1a2b3c4d5e6f708192a04',
  admin: '66f1b7c8d9e0f1a2b3c4d500',
  priya: '66f1b7c8d9e0f1a2b3c4d501',
  kavya: '66f1b7c8d9e0f1a2b3c4d502',
  subscription: '6702c4d5e6f7a8b9c0d1e2f3',
  previousSubscription: '66f8d1e2f3a4b5c6d7e8f901',
  kavyaSubscription: '6702c4d5e6f7a8b9c0d1e2f4',
  payment: '6702c4d5e6f7a8b9c0d1e301',
  failedPayment: '6702c4d5e6f7a8b9c0d1e302',
  project: '6703b1c2d3e4f5a6b7c8d901',
  teamMember: '6703b1c2d3e4f5a6b7c8da01',
  notification: '6703a9b8c7d6e5f4a3b2c101',
  activity: '6710e2f3a4b5c6d7e8f9a001',
  session: '0b7c6f2e-5d1a-4e8b-9c3f-7a2d6e4b1f90',
} as const;

const NOW = '2026-10-17T09:30:00.000Z';

export const plans: Record<'starter' | 'pro' | 'business' | 'proAnnual', PlanDto> = {
  starter: {
    id: IDS.starter,
    name: 'Starter',
    slug: 'starter',
    description: 'For freelancers getting organised.',
    price: 29_900,
    currency: 'INR',
    durationDays: 30,
    features: ['3 projects', '2 team members', '5 GB storage', 'Basic reports', 'Email support'],
    limits: { projects: 3, teamMembers: 2 },
    tier: 1,
    isPopular: false,
    isActive: true,
  },
  pro: {
    id: IDS.pro,
    name: 'Pro',
    slug: 'pro',
    description: 'For growing teams that ship every week.',
    price: 79_900,
    currency: 'INR',
    durationDays: 30,
    features: [
      '25 projects',
      '10 team members',
      '50 GB storage',
      'Analytics dashboard',
      'Priority support',
    ],
    limits: { projects: 25, teamMembers: 10 },
    tier: 2,
    isPopular: true,
    isActive: true,
  },
  business: {
    id: IDS.business,
    name: 'Business',
    slug: 'business',
    description: 'For companies that need control and scale.',
    price: 1_99_900,
    currency: 'INR',
    durationDays: 30,
    features: [
      'Unlimited projects',
      '50 team members',
      '500 GB storage',
      'SSO and audit log',
      'API access',
    ],
    limits: { projects: null, teamMembers: 50 },
    tier: 3,
    isPopular: false,
    isActive: true,
  },
  proAnnual: {
    id: IDS.proAnnual,
    name: 'Pro Annual',
    slug: 'pro-annual',
    description: 'Everything in Pro, billed yearly. Two months free.',
    price: 7_99_900,
    currency: 'INR',
    durationDays: 365,
    features: [
      'Everything in Pro',
      '25 projects',
      '10 team members',
      'Save about 17% vs monthly',
      'Priority support',
    ],
    limits: { projects: 25, teamMembers: 10 },
    tier: 2,
    isPopular: false,
    isActive: true,
  },
};

export const planList: PlanDto[] = [plans.starter, plans.pro, plans.proAnnual, plans.business];

export const user: UserDto = {
  id: IDS.priya,
  name: 'Priya Sharma',
  email: 'priya@planpilot.demo',
  role: 'user',
  status: 'active',
  statusReason: null,
  accessExpiresAt: null,
  lastSeenAt: NOW,
  createdAt: '2026-08-04T10:12:45.000Z',
};

export const adminUser: UserDto = {
  ...user,
  id: IDS.admin,
  name: 'Ananya Iyer',
  email: 'admin@planpilot.demo',
  role: 'admin',
  createdAt: '2026-07-01T04:30:00.000Z',
};

export const authSession: AuthResponse = {
  user,
  accessToken:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoidXNlciIsInNpZCI6IjBiN2M2ZjJlIn0.c2lnbmF0dXJl',
  accessTokenExpiresAt: '2026-10-17T09:45:00.000Z',
};

export const sessions: SessionDto[] = [
  {
    id: IDS.session,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0',
    createdAt: '2026-10-15T08:02:11.000Z',
    lastUsedAt: NOW,
    current: true,
  },
  {
    id: '5e9a1c3b-2f7d-4a6e-8b0c-1d3f5a7c9e2b',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1',
    createdAt: '2026-10-11T14:40:03.000Z',
    lastUsedAt: '2026-10-16T19:21:37.000Z',
    current: false,
  },
];

export const subscription: SubscriptionDto = {
  id: IDS.subscription,
  plan: plans.pro,
  status: 'active',
  startDate: '2026-10-02T06:15:00.000Z',
  endDate: '2026-11-01T06:15:00.000Z',
  amountPaid: 64_950,
  changeType: 'upgrade',
  cancelledAt: null,
  daysLeft: 15,
  totalDays: 30,
  adjustments: [],
  createdAt: '2026-10-02T06:15:00.000Z',
};

export const extendedSubscription: SubscriptionDto = {
  ...subscription,
  endDate: '2026-11-15T06:15:00.000Z',
  daysLeft: 29,
  totalDays: 44,
  adjustments: [
    {
      type: 'extend',
      days: 14,
      newEndDate: '2026-11-15T06:15:00.000Z',
      reason: 'Goodwill credit for the outage on 12 Oct',
      by: { id: IDS.admin, name: 'Ananya Iyer' },
      at: NOW,
    },
  ],
};

export const endedSubscription: SubscriptionDto = {
  ...subscription,
  status: 'expired',
  endDate: NOW,
  cancelledAt: NOW,
  daysLeft: 0,
  totalDays: 15,
  adjustments: [
    {
      type: 'expire',
      days: null,
      newEndDate: NOW,
      reason: 'Refund issued, plan ended early',
      by: { id: IDS.admin, name: 'Ananya Iyer' },
      at: NOW,
    },
  ],
};

export const assignedSubscription: SubscriptionDto = {
  ...subscription,
  plan: plans.business,
  startDate: NOW,
  endDate: '2026-11-16T09:30:00.000Z',
  amountPaid: 0,
  changeType: 'admin_assign',
  daysLeft: 30,
  adjustments: [
    {
      type: 'assign',
      days: null,
      newEndDate: null,
      reason: 'Pilot programme for the enterprise trial',
      by: { id: IDS.admin, name: 'Ananya Iyer' },
      at: NOW,
    },
  ],
  createdAt: NOW,
};

export const usage = { projects: 4, teamMembers: 3 };

export const mySubscription: MySubscriptionDto = {
  status: 'active',
  subscription,
  lastSubscription: null,
  usage,
  limits: plans.pro.limits,
  readOnly: false,
};

export const cancelledSubscription: MySubscriptionDto = {
  status: 'cancelled',
  subscription: null,
  lastSubscription: { ...subscription, status: 'cancelled', cancelledAt: NOW, daysLeft: 0 },
  usage,
  limits: { projects: 0, teamMembers: 0 },
  readOnly: true,
};

/** Starter → Pro half-way through the month: half the Starter price comes back as credit. */
export const upgradeQuote: ProrationQuote = {
  changeType: 'upgrade',
  plan: plans.pro,
  currentPlan: { id: IDS.starter, name: 'Starter', slug: 'starter' },
  credit: 14_950,
  price: 79_900,
  amountDue: 64_950,
  bonusDays: 0,
  startDate: NOW,
  endDate: '2026-11-16T09:30:00.000Z',
  requiresPayment: true,
};

/** Pro Annual → Pro early on: the unused credit covers Pro and becomes bonus days. */
export const downgradeQuote: ProrationQuote = {
  changeType: 'downgrade',
  plan: plans.pro,
  currentPlan: { id: IDS.proAnnual, name: 'Pro Annual', slug: 'pro-annual' },
  credit: 7_88_942,
  price: 79_900,
  amountDue: 0,
  bonusDays: 266,
  startDate: NOW,
  endDate: '2027-08-09T09:30:00.000Z',
  requiresPayment: false,
};

export const checkout: CheckoutOrder = {
  paymentId: IDS.payment,
  orderId: 'order_Q7xK2mP9vB4nL1',
  amount: 64_950,
  currency: 'INR',
  keyId: 'rzp_test_simulated',
  planName: 'Pro',
  description: 'Pro plan · 30 days',
  prefill: { name: 'Priya Sharma', email: 'priya@planpilot.demo' },
  mode: 'simulated',
  simulation: {
    paymentId: 'pay_R3mT8wQ1zX6cV9',
    signature: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  },
};

export const payments: PaymentDto[] = [
  {
    id: IDS.payment,
    plan: { id: IDS.pro, name: 'Pro', slug: 'pro' },
    amount: 64_950,
    status: 'paid',
    changeType: 'upgrade',
    razorpayOrderId: 'order_Q7xK2mP9vB4nL1',
    razorpayPaymentId: 'pay_R3mT8wQ1zX6cV9',
    failureReason: null,
    createdAt: '2026-10-02T06:14:20.000Z',
  },
  {
    id: IDS.failedPayment,
    plan: { id: IDS.pro, name: 'Pro', slug: 'pro' },
    amount: 64_950,
    status: 'failed',
    changeType: 'upgrade',
    razorpayOrderId: 'order_P2nH5kL8sD3fG7',
    razorpayPaymentId: null,
    failureReason: 'Checkout closed by the customer',
    createdAt: '2026-10-02T06:09:02.000Z',
  },
];

export const project: ProjectDto = {
  id: IDS.project,
  name: 'Website relaunch',
  description: 'New marketing site and pricing page for Q4.',
  color: 'violet',
  createdAt: '2026-10-05T11:20:00.000Z',
};

export const teamMember: TeamMemberDto = {
  id: IDS.teamMember,
  name: 'Rahul Verma',
  email: 'rahul.verma@example.com',
  role: 'editor',
  createdAt: '2026-10-06T07:45:00.000Z',
};

export const notifications: NotificationListDto = {
  items: [
    {
      id: IDS.notification,
      type: 'plan_upgraded',
      title: 'Upgraded to Pro',
      body: 'Your new limits are live. The plan runs until 1 Nov 2026.',
      data: { plan: 'Pro', endDate: '2026-11-01T06:15:00.000Z' },
      readAt: null,
      createdAt: '2026-10-02T06:15:01.000Z',
    },
    {
      id: '6703a9b8c7d6e5f4a3b2c102',
      type: 'payment_success',
      title: 'Payment received',
      body: '₹649.5 paid for Pro. A receipt is in your billing history.',
      data: { plan: 'Pro', amount: 64_950 },
      readAt: '2026-10-02T08:00:00.000Z',
      createdAt: '2026-10-02T06:15:01.000Z',
    },
  ],
  unread: 1,
};

export const notificationsMeta: PageMeta = { page: 1, pageSize: 20, total: 2, totalPages: 1 };

export const adminSubscriptionRows: AdminSubscriptionRow[] = [
  {
    id: IDS.subscription,
    user: { id: IDS.priya, name: 'Priya Sharma', email: 'priya@planpilot.demo' },
    plan: { id: IDS.pro, name: 'Pro', slug: 'pro' },
    status: 'active',
    startDate: '2026-10-02T06:15:00.000Z',
    endDate: '2026-11-01T06:15:00.000Z',
    amountPaid: 64_950,
    changeType: 'upgrade',
    createdAt: '2026-10-02T06:15:00.000Z',
  },
  {
    id: IDS.kavyaSubscription,
    user: { id: IDS.kavya, name: 'Kavya Reddy', email: 'kavya@planpilot.demo' },
    plan: { id: IDS.starter, name: 'Starter', slug: 'starter' },
    status: 'active',
    startDate: '2026-09-19T12:00:00.000Z',
    endDate: '2026-10-19T12:00:00.000Z',
    amountPaid: 29_900,
    changeType: 'new',
    createdAt: '2026-09-19T12:00:00.000Z',
  },
];

export const adminListMeta: PageMeta = { page: 1, pageSize: 10, total: 2, totalPages: 1 };

export const subscriptionsCsv = {
  filename: 'planpilot-subscriptions-2026-10-17.csv',
  csv: [
    '"Subscription ID","Customer","Email","Plan","Status","Change type","Amount (INR)","Start date","End date","Created"',
    `"${IDS.subscription}","Priya Sharma","priya@planpilot.demo","Pro","active","upgrade","649.50","2 Oct 2026","1 Nov 2026","2 Oct 2026"`,
  ].join('\r\n'),
};

export const adminUserRow: AdminUserRow = {
  ...user,
  currentPlan: { id: IDS.pro, name: 'Pro', slug: 'pro' },
  subscriptionStatus: 'active',
  subscriptionEndDate: '2026-11-01T06:15:00.000Z',
  usage,
  online: true,
};

export const blockedUserRow: AdminUserRow = {
  ...adminUserRow,
  status: 'blocked',
  statusReason: 'Repeated chargebacks',
  online: false,
};

export const activity: ActivityDto[] = [
  {
    id: IDS.activity,
    actor: { id: IDS.admin, name: 'Ananya Iyer' },
    action: 'admin.subscription.extended',
    target: { type: 'user', id: IDS.priya, label: 'priya@planpilot.demo' },
    meta: {
      plan: 'Pro',
      newEndDate: '2026-11-15T06:15:00.000Z',
      days: 14,
      reason: 'Goodwill credit for the outage on 12 Oct',
    },
    createdAt: NOW,
  },
  {
    id: '6710e2f3a4b5c6d7e8f9a000',
    actor: { id: IDS.priya, name: 'Priya Sharma' },
    action: 'subscription.upgrade',
    target: { type: 'user', id: IDS.priya, label: 'priya@planpilot.demo' },
    meta: { plan: 'Pro', amountPaid: 64_950, orderId: 'order_Q7xK2mP9vB4nL1' },
    createdAt: '2026-10-02T06:15:00.000Z',
  },
];

export const adminUserDetail: AdminUserDetail = {
  user: adminUserRow,
  subscription,
  history: [
    adminSubscriptionRows[0] as AdminSubscriptionRow,
    {
      id: IDS.previousSubscription,
      user: { id: IDS.priya, name: 'Priya Sharma', email: 'priya@planpilot.demo' },
      plan: { id: IDS.starter, name: 'Starter', slug: 'starter' },
      status: 'cancelled',
      startDate: '2026-09-17T06:15:00.000Z',
      endDate: '2026-10-02T06:15:00.000Z',
      amountPaid: 29_900,
      changeType: 'new',
      createdAt: '2026-09-17T06:15:00.000Z',
    },
  ],
  sessions,
  activity,
};

export const adminStats: AdminStatsDto = {
  range: '7d',
  generatedAt: NOW,
  kpis: {
    mrr: { value: 18_42_633, previous: 16_95_400 },
    revenue: { value: 4_31_550, previous: 3_86_300 },
    activeSubscribers: { value: 31, previous: 28 },
    newSubscriptions: { value: 6, previous: 4 },
    newUsers: { value: 9, previous: 7 },
    churnRate: { value: 3.6, previous: 5.1 },
    totalUsers: 58,
    onlineNow: 3,
    activeUsers7d: 41,
    activeUsers24h: 17,
    expiringSoon: 4,
    usersAtLimit: 2,
  },
  series: [
    { date: '2026-10-11', revenue: 29_900, newSubscriptions: 1, signups: 1 },
    { date: '2026-10-12', revenue: 0, newSubscriptions: 0, signups: 2 },
    { date: '2026-10-13', revenue: 1_99_900, newSubscriptions: 1, signups: 1 },
    { date: '2026-10-14', revenue: 79_900, newSubscriptions: 2, signups: 3 },
    { date: '2026-10-15', revenue: 0, newSubscriptions: 0, signups: 0 },
    { date: '2026-10-16', revenue: 64_950, newSubscriptions: 1, signups: 1 },
    { date: '2026-10-17', revenue: 56_900, newSubscriptions: 1, signups: 1 },
  ],
  planMix: [
    { planId: IDS.starter, name: 'Starter', slug: 'starter', count: 12, revenue: 89_700 },
    { planId: IDS.pro, name: 'Pro', slug: 'pro', count: 14, revenue: 2_41_950 },
    { planId: IDS.proAnnual, name: 'Pro Annual', slug: 'pro-annual', count: 2, revenue: 0 },
    { planId: IDS.business, name: 'Business', slug: 'business', count: 3, revenue: 99_900 },
  ],
  statusBreakdown: { active: 31, expired: 9, cancelled: 5, none: 13 },
  onlineUsers: [
    { id: IDS.priya, name: 'Priya Sharma', email: 'priya@planpilot.demo', lastSeenAt: NOW },
  ],
  expiringSoon: [adminSubscriptionRows[1] as AdminSubscriptionRow],
  recentSubscriptions: [adminSubscriptionRows[0] as AdminSubscriptionRow],
};

export const adminPlans = planList.map((plan, index) => ({
  ...plan,
  activeSubscribers: [12, 14, 2, 3][index] ?? 0,
}));

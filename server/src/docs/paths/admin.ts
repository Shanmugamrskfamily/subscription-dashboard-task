import { ERROR_CODES as C } from '@planpilot/shared';
import * as ex from '../examples';
import { ADMIN, defineOperation } from '../operation';
import { countResult, envelope, flagResult, parameterRef, schemaRef } from '../refs';

const SUBSCRIPTION_NOT_FOUND = [C.NOT_FOUND, 'No subscription with this id.'] as const;
const SUBSCRIPTION_PLAN_GONE = [C.PLAN_NOT_FOUND, 'The subscription’s plan was deleted.'] as const;
const USER_NOT_FOUND = [C.NOT_FOUND, 'No user with this id.'] as const;
const LAST_ADMIN = [C.LAST_ADMIN, 'The change would leave no active administrator.'] as const;

const planInputExample = {
  name: 'Team',
  description: 'For small agencies with a handful of clients.',
  price: 1_49_900,
  durationDays: 30,
  features: ['10 projects', '5 team members', '20 GB storage', 'Shared reports'],
  limits: { projects: 10, teamMembers: 5 },
  tier: 2,
  isPopular: false,
  isActive: true,
};

const createdPlan = {
  ...planInputExample,
  id: '6711a0b1c2d3e4f5a6b7c801',
  slug: 'team',
  currency: 'INR',
};

export const adminStatsOperations = [
  defineOperation({
    method: 'get',
    path: '/admin/stats',
    operationId: 'getAdminStats',
    tag: 'Admin – Stats',
    summary: 'Dashboard analytics',
    description:
      'KPIs (MRR, revenue, subscribers, sign-ups, churn) for the range and the range before it, a time series, the plan mix, subscription status breakdown, who is online and plans expiring soon. Days and months are bucketed in Indian time.',
    access: ADMIN,
    parameters: [parameterRef('StatsRange')],
    success: {
      description: 'Analytics for the range.',
      data: schemaRef('AdminStats'),
      example: ex.adminStats,
    },
  }),
];

export const adminActivityOperations = [
  defineOperation({
    method: 'get',
    path: '/admin/activity',
    operationId: 'listActivity',
    tag: 'Admin – Activity',
    summary: 'Recent activity',
    description:
      'The latest 50 audit-log entries across the system, newest first: sign-ins, plan changes, payments, admin actions and security events such as refresh-token reuse or account lockouts.',
    access: ADMIN,
    success: {
      description: 'Activity entries.',
      data: { type: 'array', items: schemaRef('Activity') },
      example: ex.activity,
    },
  }),
];

export const adminSubscriptionOperations = [
  defineOperation({
    method: 'get',
    path: '/admin/subscriptions',
    operationId: 'listAllSubscriptions',
    tag: 'Admin – Subscriptions',
    summary: 'List all subscriptions',
    description:
      'Every subscription with its customer and plan: filterable, sortable and paginated. With `format=csv` the whole filtered list (up to 5,000 rows) comes back as CSV text inside the JSON envelope (`data.filename`, `data.csv`) instead of a page of rows, so the encrypted envelope still covers the export.',
    access: ADMIN,
    parameters: [
      parameterRef('Page'),
      parameterRef('PageSize'),
      parameterRef('Search'),
      parameterRef('SubscriptionStatusFilter'),
      parameterRef('PlanIdFilter'),
      parameterRef('ChangeTypeFilter'),
      parameterRef('FromDate'),
      parameterRef('ToDate'),
      parameterRef('SubscriptionSort'),
      parameterRef('ExportFormat'),
    ],
    success: {
      description: 'A page of subscriptions, or the CSV export when `format=csv`.',
      body: {
        oneOf: [
          envelope({ type: 'array', items: schemaRef('AdminSubscriptionRow') }, true),
          envelope(schemaRef('SubscriptionsCsvExport')),
        ],
      },
      examples: {
        page: {
          summary: 'format=json (default)',
          value: { success: true, data: ex.adminSubscriptionRows, meta: ex.adminListMeta },
        },
        csv: { summary: 'format=csv', value: { success: true, data: ex.subscriptionsCsv } },
      },
    },
  }),

  defineOperation({
    method: 'patch',
    path: '/admin/subscriptions/{id}/extend',
    operationId: 'extendSubscription',
    tag: 'Admin – Subscriptions',
    summary: 'Extend a subscription',
    description:
      'Adds days or sets a new end date, without payment. Extending an expired or cancelled subscription revives it. Expiry reminders are re-armed, the customer is notified and the change is recorded in the subscription’s adjustments and the audit log.',
    access: ADMIN,
    parameters: [parameterRef('SubscriptionId')],
    body: {
      schema: schemaRef('ExtendSubscriptionRequest'),
      examples: {
        byDays: {
          summary: 'Add 14 days',
          value: { days: 14, reason: 'Goodwill credit for the outage on 12 Oct' },
        },
        toDate: {
          summary: 'Set an end date',
          value: {
            endDate: '2026-12-31T18:29:59.000Z',
            reason: 'Aligned with the annual contract',
          },
        },
      },
    },
    success: {
      description: 'The extended subscription.',
      data: schemaRef('Subscription'),
      example: ex.extendedSubscription,
    },
    errors: [
      SUBSCRIPTION_NOT_FOUND,
      SUBSCRIPTION_PLAN_GONE,
      [C.BAD_REQUEST, 'The resulting end date is not in the future.'],
      [C.CONFLICT, 'Reviving an ended plan while the user has another active plan.'],
    ],
  }),

  defineOperation({
    method: 'patch',
    path: '/admin/subscriptions/{id}/expire',
    operationId: 'expireSubscription',
    tag: 'Admin – Subscriptions',
    summary: 'End a subscription now (expired)',
    description:
      'Ends an active plan immediately with status `expired` (time is up). The customer is notified with the reason and their workspace becomes read-only.',
    access: ADMIN,
    parameters: [parameterRef('SubscriptionId')],
    body: {
      schema: schemaRef('ReasonRequest'),
      example: { reason: 'Refund issued, plan ended early' },
    },
    success: {
      description: 'The ended subscription.',
      data: schemaRef('Subscription'),
      example: ex.endedSubscription,
    },
    errors: [
      SUBSCRIPTION_NOT_FOUND,
      SUBSCRIPTION_PLAN_GONE,
      [C.NO_ACTIVE_SUBSCRIPTION, 'Only an active subscription can be ended.'],
    ],
  }),

  defineOperation({
    method: 'patch',
    path: '/admin/subscriptions/{id}/cancel',
    operationId: 'cancelSubscription',
    tag: 'Admin – Subscriptions',
    summary: 'End a subscription now (cancelled)',
    description:
      'Ends an active plan immediately with status `cancelled` (taken away, e.g. after a chargeback). The customer is notified with the reason and their workspace becomes read-only.',
    access: ADMIN,
    parameters: [parameterRef('SubscriptionId')],
    body: {
      schema: schemaRef('ReasonRequest'),
      example: { reason: 'Payment disputed with the bank' },
    },
    success: {
      description: 'The ended subscription.',
      data: schemaRef('Subscription'),
      example: {
        ...ex.endedSubscription,
        status: 'cancelled',
        adjustments: [
          {
            ...ex.endedSubscription.adjustments[0],
            type: 'cancel',
            reason: 'Payment disputed with the bank',
          },
        ],
      },
    },
    errors: [
      SUBSCRIPTION_NOT_FOUND,
      SUBSCRIPTION_PLAN_GONE,
      [C.NO_ACTIVE_SUBSCRIPTION, 'Only an active subscription can be ended.'],
    ],
  }),
];

export const adminUserOperations = [
  defineOperation({
    method: 'get',
    path: '/admin/users',
    operationId: 'listUsers',
    tag: 'Admin – Users',
    summary: 'List users',
    description:
      'Customers and administrators with their current plan, usage and online state; filterable, sortable and paginated.',
    access: ADMIN,
    parameters: [
      parameterRef('Page'),
      parameterRef('PageSize'),
      parameterRef('Search'),
      parameterRef('RoleFilter'),
      parameterRef('UserStatusFilter'),
      parameterRef('SubscriptionFilter'),
      parameterRef('UserSort'),
    ],
    success: {
      description: 'A page of users.',
      data: { type: 'array', items: schemaRef('AdminUserRow') },
      paged: true,
      example: [ex.adminUserRow],
      metaExample: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    },
  }),

  defineOperation({
    method: 'get',
    path: '/admin/users/{id}',
    operationId: 'getUser',
    tag: 'Admin – Users',
    summary: 'User details',
    description:
      'One user with the active plan (including who adjusted it), the latest 20 subscriptions, signed-in devices and the latest 15 activity entries.',
    access: ADMIN,
    parameters: [parameterRef('UserId')],
    success: {
      description: 'The user.',
      data: schemaRef('AdminUserDetail'),
      example: ex.adminUserDetail,
    },
    errors: [USER_NOT_FOUND],
  }),

  defineOperation({
    method: 'patch',
    path: '/admin/users/{id}/status',
    operationId: 'setUserStatus',
    tag: 'Admin – Users',
    summary: 'Activate, deactivate or block a user',
    description:
      'Sets the account status and an optional “access until” date. Setting `inactive` or `blocked` signs the user out everywhere at once; they see the reason and the support email when they try to sign in. The user is notified and the change is audited.',
    access: ADMIN,
    parameters: [parameterRef('UserId')],
    body: {
      schema: schemaRef('UserStatusRequest'),
      examples: {
        block: {
          summary: 'Block',
          value: { status: 'blocked', reason: 'Repeated chargebacks' },
        },
        limitAccess: {
          summary: 'Active until a date',
          value: {
            status: 'active',
            reason: 'Contract ends this year',
            accessExpiresAt: '2026-12-31T18:29:59.000Z',
          },
        },
        reactivate: {
          summary: 'Reactivate',
          value: { status: 'active', reason: 'Dispute resolved', accessExpiresAt: null },
        },
      },
    },
    success: {
      description: 'The updated user.',
      data: schemaRef('AdminUserRow'),
      example: ex.blockedUserRow,
    },
    errors: [C.SELF_ACTION_FORBIDDEN, USER_NOT_FOUND, LAST_ADMIN],
  }),

  defineOperation({
    method: 'patch',
    path: '/admin/users/{id}/role',
    operationId: 'setUserRole',
    tag: 'Admin – Users',
    summary: 'Change a user’s role',
    description:
      'Promotes a customer to administrator or the reverse, and signs the user out everywhere so the new role applies cleanly.',
    access: ADMIN,
    parameters: [parameterRef('UserId')],
    body: { schema: schemaRef('RoleRequest'), example: { role: 'admin' } },
    success: {
      description: 'The updated user.',
      data: schemaRef('AdminUserRow'),
      example: {
        ...ex.adminUserRow,
        role: 'admin',
        currentPlan: null,
        subscriptionStatus: 'cancelled',
        subscriptionEndDate: null,
      },
    },
    errors: [
      [C.SELF_ACTION_FORBIDDEN, 'Administrators cannot change their own role.'],
      USER_NOT_FOUND,
      LAST_ADMIN,
      [C.CONFLICT, 'The user has an active plan; end it before making them an administrator.'],
    ],
  }),

  defineOperation({
    method: 'post',
    path: '/admin/users/{id}/subscription',
    operationId: 'assignPlan',
    tag: 'Admin – Users',
    summary: 'Assign a plan',
    description:
      'Puts a customer on any active plan for one full period without payment, replacing their current plan (no credit is carried over). The customer is notified with the reason.',
    access: ADMIN,
    parameters: [parameterRef('UserId')],
    body: {
      schema: schemaRef('AssignPlanRequest'),
      example: { planId: ex.IDS.business, reason: 'Pilot programme for the enterprise trial' },
    },
    success: {
      status: 201,
      description: 'The new subscription.',
      data: schemaRef('Subscription'),
      example: ex.assignedSubscription,
    },
    errors: [
      USER_NOT_FOUND,
      [C.BAD_REQUEST, 'The user is an administrator; plans can only be assigned to customers.'],
      C.PLAN_NOT_FOUND,
      C.PLAN_INACTIVE,
      [C.ALREADY_SUBSCRIBED, 'The user is already on this plan; extend it instead.'],
      [C.CONFLICT, 'The user’s plan changed in the meantime.'],
    ],
  }),

  defineOperation({
    method: 'delete',
    path: '/admin/users/{id}/sessions',
    operationId: 'signOutUser',
    tag: 'Admin – Users',
    summary: 'Sign a user out everywhere',
    description:
      'Revokes every session of the user; their tokens stop working on the next request.',
    access: ADMIN,
    parameters: [parameterRef('UserId')],
    success: {
      description: 'Sessions revoked.',
      data: countResult('revoked', 'Sessions that were ended.'),
      example: { revoked: 2 },
    },
    errors: [USER_NOT_FOUND],
  }),
];

export const adminPlanOperations = [
  defineOperation({
    method: 'get',
    path: '/admin/plans',
    operationId: 'listAllPlans',
    tag: 'Admin – Plans',
    summary: 'List all plans',
    description:
      'Every plan, archived ones included (active first, then by tier and price), with the number of active subscribers.',
    access: ADMIN,
    success: {
      description: 'Plans.',
      data: { type: 'array', items: schemaRef('AdminPlan') },
      example: ex.adminPlans,
    },
  }),

  defineOperation({
    method: 'post',
    path: '/admin/plans',
    operationId: 'createPlan',
    tag: 'Admin – Plans',
    summary: 'Create a plan',
    description:
      'Creates a plan. The slug is derived from the name and made unique. Marking it popular removes the badge from every other plan.',
    access: ADMIN,
    body: { schema: schemaRef('PlanInput'), example: planInputExample },
    success: {
      status: 201,
      description: 'Created.',
      data: schemaRef('Plan'),
      example: createdPlan,
    },
    errors: [[C.CONFLICT, 'No unique slug could be derived from the name.']],
  }),

  defineOperation({
    method: 'patch',
    path: '/admin/plans/{id}',
    operationId: 'updatePlan',
    tag: 'Admin – Plans',
    summary: 'Update a plan',
    description:
      'Replaces every field: send the full plan. Price changes apply to new purchases; existing subscriptions keep what they paid. Renaming re-derives the slug.',
    access: ADMIN,
    parameters: [parameterRef('AdminPlanId')],
    body: {
      schema: schemaRef('PlanInput'),
      example: { ...planInputExample, price: 1_29_900 },
    },
    success: {
      description: 'Updated.',
      data: schemaRef('Plan'),
      example: { ...createdPlan, price: 1_29_900 },
    },
    errors: [C.PLAN_NOT_FOUND, [C.CONFLICT, 'No unique slug could be derived from the name.']],
  }),

  defineOperation({
    method: 'delete',
    path: '/admin/plans/{id}',
    operationId: 'deletePlan',
    tag: 'Admin – Plans',
    summary: 'Delete or archive a plan',
    description:
      'Deletes a plan nobody ever subscribed to. A plan with subscription history is archived instead (inactive, not popular), so past subscriptions and reports stay intact.',
    access: ADMIN,
    parameters: [parameterRef('AdminPlanId')],
    success: {
      description: 'What happened to the plan.',
      data: schemaRef('PlanRemovalResult'),
      example: { deleted: false, archived: true },
    },
    errors: [C.PLAN_NOT_FOUND],
  }),
];

export const demoOperations = [
  defineOperation({
    method: 'post',
    path: '/admin/demo/reset',
    operationId: 'resetDemoData',
    tag: 'Demo',
    summary: 'Reset the demo data',
    description:
      'Restores the four seed plans and rebuilds the demo accounts (`@planpilot.demo`) with their subscriptions, payments, workspace, notifications and activity. Accounts outside the demo domain are left alone. Demo users, including the caller when it is the demo admin, are signed out. Only available when the server runs with `DEMO_MODE` on.',
    access: ADMIN,
    success: {
      description: 'Demo data restored.',
      data: flagResult('reset', 'Always true.'),
      example: { reset: true },
    },
    errors: [[C.NOT_FOUND, 'Demo mode is off on this server.']],
  }),
];

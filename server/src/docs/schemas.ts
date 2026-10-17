import {
  ADMIN_RANGES,
  CHANGE_TYPES,
  NAME_MAX,
  NAME_MIN,
  NOTIFICATION_TYPES,
  PASSWORD_MAX,
  PASSWORD_MIN,
  PAYMENT_STATUSES,
  PROJECT_COLORS,
  REASON_MAX,
  REASON_MIN,
  ROLES,
  SUBSCRIPTION_STATUSES,
  TEAM_ROLES,
  USER_STATUSES,
} from '@planpilot/shared';
import { OBJECT_ID_PATTERN } from './components';
import { ERROR_CODE_LIST } from './errors';
import { nullable, schemaRef as ref } from './refs';
import type { SchemaObject } from './refs';

// ---------- building blocks ----------

const string = (description: string, extra: SchemaObject = {}): SchemaObject => ({
  type: 'string',
  description,
  ...extra,
});
const integer = (description: string, extra: SchemaObject = {}): SchemaObject => ({
  type: 'integer',
  description,
  ...extra,
});
const boolean = (description: string): SchemaObject => ({ type: 'boolean', description });
const dateTime = (description: string): SchemaObject => ({
  type: 'string',
  format: 'date-time',
  description,
});
const nullableDateTime = (description: string): SchemaObject => ({
  type: ['string', 'null'],
  format: 'date-time',
  description,
});
const id = (description: string): SchemaObject => ({
  type: 'string',
  pattern: OBJECT_ID_PATTERN,
  description,
});
const paise = (description: string): SchemaObject => ({
  type: 'integer',
  minimum: 0,
  description: `${description} Integer paise (₹1 = 100).`,
});
const object = (
  properties: Record<string, SchemaObject | ReturnType<typeof ref>>,
  required: string[] = Object.keys(properties),
  description?: string,
): SchemaObject => ({
  type: 'object',
  ...(description ? { description } : {}),
  required,
  properties,
});
const freeMap = (description: string): SchemaObject => ({
  type: ['object', 'null'],
  additionalProperties: true,
  description,
});

const SANITISED =
  'Trimmed; HTML tags, control characters and `javascript:`-style URLs are removed before the length check.';

const nameField = (description: string): SchemaObject =>
  string(`${description} ${SANITISED}`, {
    minLength: NAME_MIN,
    maxLength: NAME_MAX,
    pattern: "^[\\p{L}\\p{M}' .-]+$",
    examples: ['Priya Sharma'],
  });

const emailField = (): SchemaObject =>
  string('Email address. Trimmed and lower-cased before use.', {
    format: 'email',
    maxLength: 254,
    examples: ['priya@planpilot.demo'],
  });

const passwordField = (description: string): SchemaObject =>
  string(
    `${description} ${PASSWORD_MIN}–${PASSWORD_MAX} characters with at least one lowercase letter, one uppercase letter and one digit.`,
    {
      format: 'password',
      minLength: PASSWORD_MIN,
      maxLength: PASSWORD_MAX,
      pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$',
    },
  );

const reasonField = (description: string): SchemaObject =>
  string(`${description} ${SANITISED}`, { minLength: REASON_MIN, maxLength: REASON_MAX });

const enumOf = (values: readonly string[], description: string): SchemaObject => ({
  type: 'string',
  enum: [...values],
  description,
});

// ---------- schemas ----------

export const schemas: Record<string, SchemaObject> = {
  // ---- envelope ----
  PageMeta: object(
    {
      page: integer('Current page, 1-based.', { minimum: 1 }),
      pageSize: integer('Rows per page.', { minimum: 1 }),
      total: integer('Rows matching the filters.', { minimum: 0 }),
      totalPages: integer('Pages available; at least 1, even when `total` is 0.', {
        minimum: 1,
      }),
    },
    undefined,
    'Pagination details, returned as `meta` next to `data` on paginated lists.',
  ),
  FieldError: object({
    field: string('Path of the failing field, e.g. `email` or `limits.projects`.'),
    message: string('What is wrong, ready to show next to the field.'),
  }),
  ErrorResponse: object(
    {
      success: { const: false },
      error: object(
        {
          code: { type: 'string', enum: ERROR_CODE_LIST, description: 'Stable error code.' },
          message: string('Human-readable message, safe to display.'),
          details: {
            type: 'array',
            items: ref('FieldError'),
            description: 'Every failing field, for `VALIDATION_ERROR` (and `WRONG_PASSWORD`).',
          },
          meta: {
            type: 'object',
            additionalProperties: true,
            description:
              'Extra context, e.g. `retryAfterSeconds`, `attemptsLeft`, `{ key, limit, used, plan }`, `serverTime`, `retry`.',
          },
          requestId: string('Same value as the `X-Request-Id` response header.'),
        },
        ['code', 'message', 'requestId'],
      ),
    },
    ['success', 'error'],
    'Shape of every error response.',
  ),
  EncryptedEnvelope: object(
    {
      v: { const: 1, description: 'Envelope version.' },
      iv: string('12-byte AES-GCM IV, base64. Fresh for every message.'),
      ct: string('Ciphertext followed by the 16-byte GCM tag, base64.'),
    },
    undefined,
    'Replaces the JSON body of requests and responses in an encrypted session. The plaintext inside is exactly the JSON documented for each operation.',
  ),

  // ---- enums ----
  Role: enumOf(ROLES, '`user` is a customer, `admin` an administrator.'),
  UserStatus: enumOf(
    USER_STATUSES,
    'Set by an administrator. `inactive` and `blocked` accounts cannot sign in.',
  ),
  SubscriptionStatus: enumOf(SUBSCRIPTION_STATUSES, 'Status of one subscription record.'),
  DisplayStatus: enumOf(
    [...SUBSCRIPTION_STATUSES, 'none'],
    'Subscription status as shown to people: `none` means the user never subscribed.',
  ),
  ChangeType: enumOf(
    CHANGE_TYPES,
    'How a subscription started: first plan (`new`), renewing the current plan early or buying again after a lapse (`renewal`, which adds the new period after the current end date), a switch to a higher tier or a longer cycle of the same tier (`upgrade`), the opposite (`downgrade`), or set by an administrator (`admin_assign`).',
  ),
  PaymentStatus: enumOf(PAYMENT_STATUSES, 'Lifecycle of a Razorpay order.'),
  TeamRole: enumOf(TEAM_ROLES, 'What a team member may do in the workspace.'),
  NotificationType: enumOf(NOTIFICATION_TYPES, 'Kind of in-app notification.'),
  ProjectColor: enumOf(PROJECT_COLORS, 'Accent colour of a project card.'),

  // ---- system ----
  Health: object({
    status: enumOf(['ok', 'degraded'], '`degraded` when the database is unreachable.'),
    database: enumOf(['up', 'down'], 'MongoDB connection state.'),
    uptimeSeconds: integer('Seconds since the process started.', { minimum: 0 }),
    time: dateTime('Server time.'),
  }),

  // ---- users and auth ----
  User: object(
    {
      id: id('User id.'),
      name: string('Display name.'),
      email: string('Email address (lower case).', { format: 'email' }),
      role: ref('Role'),
      status: ref('UserStatus'),
      statusReason: { type: ['string', 'null'], description: 'Why an admin changed the status.' },
      accessExpiresAt: nullableDateTime('Sign-in is refused after this time, if set.'),
      lastSeenAt: nullableDateTime('Last authenticated request (updated at most once a minute).'),
      createdAt: dateTime('Sign-up time.'),
    },
    undefined,
    'A user as the API exposes it: never the password hash, counters or lock state.',
  ),
  AuthSession: object({
    user: ref('User'),
    accessToken: string('JWT access token. Send as `Authorization: Bearer <token>`.'),
    accessTokenExpiresAt: dateTime('When the access token expires; refresh shortly before.'),
  }),
  Session: object(
    {
      id: string('Session (refresh-token family) id.', { format: 'uuid' }),
      userAgent: string('Browser the session signed in from.'),
      createdAt: dateTime('Sign-in time.'),
      lastUsedAt: dateTime('Last token refresh.'),
      current: boolean('True for the session making this request.'),
    },
    undefined,
    'A signed-in device.',
  ),

  // ---- plans ----
  PlanLimits: object(
    {
      projects: {
        type: ['integer', 'null'],
        minimum: 0,
        description: 'Maximum projects; `null` = unlimited.',
      },
      teamMembers: {
        type: ['integer', 'null'],
        minimum: 0,
        description: 'Maximum team members; `null` = unlimited.',
      },
    },
    undefined,
    'Usage caps. Without an active plan both are 0 and the workspace is read-only.',
  ),
  Plan: object({
    id: id('Plan id.'),
    name: string('Plan name.'),
    slug: string('URL-friendly unique name, derived from the name.'),
    description: string('One-line pitch (may be empty).'),
    price: paise('Price for one period.'),
    currency: { const: 'INR' },
    durationDays: integer('Length of one period in days.', { minimum: 1 }),
    features: { type: 'array', items: { type: 'string' }, description: 'Bullet points.' },
    limits: ref('PlanLimits'),
    tier: integer('Rank used to tell upgrades from downgrades (higher is bigger).', {
      minimum: 1,
    }),
    isPopular: boolean('Shows the “Most popular” badge (one plan at a time).'),
    isActive: boolean('False for archived plans, which cannot be bought.'),
  }),
  PlanSummary: object({
    id: id('Plan id (empty string if the plan was deleted).'),
    name: string('Plan name.'),
    slug: string('Plan slug.'),
  }),
  AdminPlan: {
    allOf: [
      ref('Plan'),
      object({
        activeSubscribers: integer('Users currently on this plan.', { minimum: 0 }),
      }),
    ],
  },

  // ---- subscriptions ----
  SubscriptionAdjustment: object(
    {
      type: enumOf(['extend', 'expire', 'assign', 'cancel'], 'What was done.'),
      days: { type: ['integer', 'null'], description: 'Days added (extensions only).' },
      newEndDate: nullableDateTime('End date after the change.'),
      reason: string('Reason given.'),
      by: nullable(
        object({ id: id('Admin user id.'), name: string('Admin name.') }),
        'Who did it; `null` for the customer’s own actions or when not loaded.',
      ),
      at: dateTime('When.'),
    },
    undefined,
    'An audit entry on a subscription: admin extensions, early endings and assignments, or a customer cancellation.',
  ),
  Subscription: object({
    id: id('Subscription id.'),
    plan: ref('Plan'),
    status: ref('SubscriptionStatus'),
    startDate: dateTime('Start of the current period.'),
    endDate: dateTime('End of the current period (or when it ended early).'),
    amountPaid: paise('Charged for this subscription after credit; 0 when credit covered it.'),
    changeType: ref('ChangeType'),
    cancelledAt: nullableDateTime('When it ended, for expired or cancelled subscriptions.'),
    daysLeft: integer('Whole days remaining (0 unless active).', { minimum: 0 }),
    totalDays: integer('Length of the period in days.', { minimum: 1 }),
    adjustments: { type: 'array', items: ref('SubscriptionAdjustment') },
    createdAt: dateTime('Created at.'),
  }),
  Usage: object(
    {
      projects: integer('Projects in use.', { minimum: 0 }),
      teamMembers: integer('Team members in use.', { minimum: 0 }),
    },
    undefined,
    'Current usage of the plan-limited resources.',
  ),
  MySubscription: object(
    {
      status: ref('DisplayStatus'),
      subscription: nullable(ref('Subscription'), 'The active plan, or `null`.'),
      lastSubscription: nullable(
        ref('Subscription'),
        'The most recent ended plan when nothing is active (for a Renew button).',
      ),
      usage: ref('Usage'),
      limits: ref('PlanLimits'),
      readOnly: boolean('True without an active plan: items can be viewed and deleted only.'),
    },
    undefined,
    'The signed-in customer’s plan, usage and limits.',
  ),
  ProrationQuote: object(
    {
      changeType: ref('ChangeType'),
      plan: ref('Plan'),
      currentPlan: nullable(ref('PlanSummary'), 'The plan being replaced, if any.'),
      credit: paise('Unused value of the current plan, credited to the new one.'),
      price: paise('Full price of the new plan.'),
      amountDue: paise(
        'Price minus credit, never negative. Under ₹1 counts as 0 (Razorpay’s minimum charge).',
      ),
      bonusDays: integer(
        'Extra days on the new plan bought with credit left over after a downgrade (max 365).',
        { minimum: 0, maximum: 365 },
      ),
      startDate: dateTime('The new plan starts immediately.'),
      endDate: dateTime('End of the new plan including bonus days.'),
      requiresPayment: boolean('True when `amountDue > 0` and a checkout is needed.'),
    },
    undefined,
    'What a plan change costs. Credit = unused share of what the current period was worth.',
  ),
  CheckoutOrder: object(
    {
      paymentId: id('Our payment record id.'),
      orderId: string('Razorpay order id; pass to Razorpay Checkout.', {
        pattern: '^order_[A-Za-z0-9]{6,40}$',
      }),
      amount: paise('Amount to charge, equal to the quote’s `amountDue`.'),
      currency: { const: 'INR' },
      keyId: string('Razorpay key id (test mode) for Checkout.'),
      planName: string('Plan name for the checkout dialog.'),
      description: string('Line shown in the checkout dialog.'),
      prefill: object({
        name: string('Customer name.'),
        email: string('Customer email.', { format: 'email' }),
      }),
      mode: enumOf(
        ['razorpay', 'simulated'],
        '`razorpay` opens Razorpay Checkout in test mode; `simulated` (no Razorpay keys configured) uses the built-in test checkout.',
      ),
      simulation: object(
        {
          paymentId: string('Payment id a successful simulated checkout returns.'),
          signature: string('Matching signature (hex HMAC-SHA256).'),
        },
        undefined,
        'Simulated mode only: the values to send to `POST /payments/verify`.',
      ),
    },
    [
      'paymentId',
      'orderId',
      'amount',
      'currency',
      'keyId',
      'planName',
      'description',
      'prefill',
      'mode',
    ],
    'A Razorpay order to complete with Checkout, then confirm with `POST /payments/verify`.',
  ),
  SubscribeActivated: object(
    {
      activated: { const: true },
      subscription: ref('Subscription'),
      quote: ref('ProrationQuote'),
    },
    undefined,
    'Nothing was due (credit covered the price): the new plan is already active.',
  ),
  SubscribeCheckout: object(
    {
      activated: { const: false },
      checkout: ref('CheckoutOrder'),
      quote: ref('ProrationQuote'),
    },
    undefined,
    'Payment is due: complete the checkout, then call `POST /payments/verify`.',
  ),
  VerifyPaymentResult: object({
    subscription: ref('Subscription'),
    alreadyProcessed: boolean(
      'True when this payment had already been verified (the call is idempotent).',
    ),
  }),
  Payment: object(
    {
      id: id('Payment id.'),
      plan: ref('PlanSummary'),
      amount: paise('Amount of the order.'),
      status: ref('PaymentStatus'),
      changeType: ref('ChangeType'),
      razorpayOrderId: string('Razorpay order id.'),
      razorpayPaymentId: { type: ['string', 'null'], description: 'Set once paid.' },
      failureReason: { type: ['string', 'null'], description: 'Set when the payment failed.' },
      createdAt: dateTime('Order created at.'),
    },
    undefined,
    'A paid or failed checkout in the billing history.',
  ),

  // ---- workspace ----
  Project: object({
    id: id('Project id.'),
    name: string('Project name.'),
    description: string('Description (may be empty).'),
    color: ref('ProjectColor'),
    createdAt: dateTime('Created at.'),
  }),
  TeamMember: object({
    id: id('Team member id.'),
    name: string('Name.'),
    email: string('Email.', { format: 'email' }),
    role: ref('TeamRole'),
    createdAt: dateTime('Added at.'),
  }),

  // ---- notifications ----
  Notification: object({
    id: id('Notification id.'),
    type: ref('NotificationType'),
    title: string('Headline.'),
    body: string('Text.'),
    data: freeMap('Values the text was built from, e.g. `{ plan, endDate, amount }`.'),
    readAt: nullableDateTime('When it was marked read.'),
    createdAt: dateTime('Created at.'),
  }),
  NotificationList: object({
    items: { type: 'array', items: ref('Notification'), description: 'Newest first.' },
    unread: integer('Unread notifications in total (not just on this page).', { minimum: 0 }),
  }),

  // ---- admin ----
  AdminSubscriptionRow: object(
    {
      id: id('Subscription id.'),
      user: object(
        {
          id: string('User id (empty if the user was deleted).'),
          name: string('Name.'),
          email: string('Email.'),
        },
        undefined,
        'The subscriber.',
      ),
      plan: ref('PlanSummary'),
      status: ref('SubscriptionStatus'),
      startDate: dateTime('Start.'),
      endDate: dateTime('End.'),
      amountPaid: paise('Charged.'),
      changeType: ref('ChangeType'),
      createdAt: dateTime('Created at.'),
    },
    undefined,
    'One row of the admin subscriptions table.',
  ),
  SubscriptionsCsvExport: object(
    {
      filename: string('Suggested file name.', {
        examples: ['planpilot-subscriptions-2026-10-17.csv'],
      }),
      csv: string(
        "RFC 4180 CSV (CRLF line endings, every cell quoted; cells starting with `= + - @` are prefixed with `'` against CSV injection). Amounts are in rupees with two decimals.",
        { contentMediaType: 'text/csv' },
      ),
    },
    undefined,
    'The filtered subscriptions as a CSV file. Sent inside the JSON envelope so the encrypted envelope still applies.',
  ),
  AdminUserRow: {
    allOf: [
      ref('User'),
      object({
        currentPlan: nullable(ref('PlanSummary'), 'Active plan, if any.'),
        subscriptionStatus: ref('DisplayStatus'),
        subscriptionEndDate: nullableDateTime('End of the active plan.'),
        usage: ref('Usage'),
        online: boolean('Seen in the last 5 minutes.'),
      }),
    ],
    description: 'A user with their plan and usage, as listed to administrators.',
  },
  Activity: object(
    {
      id: id('Activity id.'),
      actor: nullable(
        object({ id: id('User id.'), name: string('Name.') }),
        'Who acted; `null` for system jobs.',
      ),
      action: string('Dotted action name.', {
        examples: ['admin.subscription.extended', 'auth.login', 'security.refresh_token_reuse'],
      }),
      target: nullable(
        object({
          type: string('Target type, e.g. `user`, `plan`, `payment`.'),
          id: string('Target id.'),
          label: string('Readable label, e.g. an email.'),
        }),
        'What the action was done to.',
      ),
      meta: freeMap('Action details.'),
      createdAt: dateTime('When.'),
    },
    undefined,
    'An audit-log entry.',
  ),
  AdminUserDetail: object({
    user: ref('AdminUserRow'),
    subscription: nullable(
      ref('Subscription'),
      'Active plan with its adjustment history, or `null`.',
    ),
    history: {
      type: 'array',
      items: ref('AdminSubscriptionRow'),
      description: 'Latest 20 subscriptions.',
    },
    sessions: { type: 'array', items: ref('Session'), description: 'Signed-in devices.' },
    activity: {
      type: 'array',
      items: ref('Activity'),
      description: 'Latest 15 events by or about the user.',
    },
  }),
  KpiValue: object(
    {
      value: { type: 'number', description: 'Value for the selected range.' },
      previous: { type: 'number', description: 'Value for the range before it.' },
    },
    undefined,
    'A KPI and its comparison value. Money KPIs are integer paise; `churnRate` is a percentage with one decimal.',
  ),
  AdminStats: object(
    {
      range: enumOf(ADMIN_RANGES, 'Range the numbers cover.'),
      generatedAt: dateTime('When the numbers were computed.'),
      kpis: object({
        mrr: {
          ...ref('KpiValue'),
          description:
            'Monthly recurring revenue: active plan prices normalised to 30 days, in paise.',
        },
        revenue: { ...ref('KpiValue'), description: 'Payments received in the range, in paise.' },
        activeSubscribers: ref('KpiValue'),
        newSubscriptions: {
          ...ref('KpiValue'),
          description: 'New and renewed subscriptions started in the range.',
        },
        newUsers: { ...ref('KpiValue'), description: 'Customer sign-ups in the range.' },
        churnRate: {
          ...ref('KpiValue'),
          description:
            'Plans that ended (expired or cancelled) in the range, as a % of active plans at its start.',
        },
        totalUsers: integer('Customer accounts.', { minimum: 0 }),
        onlineNow: integer('Users seen in the last 5 minutes.', { minimum: 0 }),
        activeUsers7d: integer('Users seen in the last 7 days.', { minimum: 0 }),
        activeUsers24h: integer('Users seen in the last 24 hours.', { minimum: 0 }),
        expiringSoon: integer('Active plans ending within 7 days.', { minimum: 0 }),
        usersAtLimit: integer('Subscribers at a project or team-member limit.', { minimum: 0 }),
      }),
      series: {
        type: 'array',
        description:
          'One bucket per day (`YYYY-MM-DD`) or, for `12m`, per month (`YYYY-MM`), in Indian time.',
        items: object({
          date: string('Bucket key.'),
          revenue: paise('Revenue in the bucket.'),
          newSubscriptions: integer('New and renewed subscriptions.', { minimum: 0 }),
          signups: integer('Customer sign-ups.', { minimum: 0 }),
        }),
      },
      planMix: {
        type: 'array',
        description: 'Active subscribers and revenue in the range, per plan.',
        items: object({
          planId: id('Plan id.'),
          name: string('Plan name.'),
          slug: string('Plan slug.'),
          count: integer('Active subscribers.', { minimum: 0 }),
          revenue: paise('Revenue in the range.'),
        }),
      },
      statusBreakdown: object(
        {
          active: integer('Users whose latest subscription is active.', { minimum: 0 }),
          expired: integer('… expired.', { minimum: 0 }),
          cancelled: integer('… cancelled.', { minimum: 0 }),
          none: integer('Customers who never subscribed.', { minimum: 0 }),
        },
        undefined,
        'Users by the status of their latest subscription.',
      ),
      onlineUsers: {
        type: 'array',
        description: 'Up to 8 users seen in the last 5 minutes.',
        items: object({
          id: id('User id.'),
          name: string('Name.'),
          email: string('Email.'),
          lastSeenAt: dateTime('Last seen.'),
        }),
      },
      expiringSoon: {
        type: 'array',
        items: ref('AdminSubscriptionRow'),
        description: 'Up to 6 active plans ending soonest (within 7 days).',
      },
      recentSubscriptions: {
        type: 'array',
        items: ref('AdminSubscriptionRow'),
        description: 'The 6 newest subscriptions.',
      },
    },
    undefined,
    'Dashboard analytics for one range, with the previous range for comparison.',
  ),
  PlanRemovalResult: object(
    {
      deleted: boolean('True when the plan had no subscriptions and was deleted.'),
      archived: boolean(
        'True when the plan has subscription history and was archived (inactive) instead.',
      ),
    },
    undefined,
    'Plans with history are archived, never deleted, so past subscriptions stay intact.',
  ),

  // ---- request bodies ----
  RegisterRequest: object({
    name: nameField('Full name: letters, spaces, apostrophes, dots or hyphens.'),
    email: emailField(),
    password: passwordField('Password.'),
  }),
  LoginRequest: object({
    email: emailField(),
    password: string('Password. No strength rules at sign-in.', {
      format: 'password',
      minLength: 1,
      maxLength: PASSWORD_MAX,
    }),
  }),
  UpdateProfileRequest: object({
    name: nameField('New display name.'),
  }),
  ChangePasswordRequest: object({
    currentPassword: string('The current password.', {
      format: 'password',
      minLength: 1,
      maxLength: PASSWORD_MAX,
    }),
    newPassword: passwordField('New password; must differ from the current one.'),
  }),
  VerifyPaymentRequest: object(
    {
      razorpay_order_id: string('From Razorpay Checkout.', {
        pattern: '^order_[A-Za-z0-9]{6,40}$',
      }),
      razorpay_payment_id: string('From Razorpay Checkout.', {
        pattern: '^pay_[A-Za-z0-9]{6,40}$',
      }),
      razorpay_signature: string('HMAC-SHA256 of `order_id|payment_id`, lowercase hex.', {
        pattern: '^[a-f0-9]{64}$',
      }),
    },
    undefined,
    'The three values Razorpay Checkout returns on success.',
  ),
  PaymentFailedRequest: object(
    {
      reason: string(`Why the checkout ended. ${SANITISED}`, {
        maxLength: 200,
        default: 'Payment was not completed',
      }),
    },
    [],
  ),
  ProjectInput: object(
    {
      name: string(`Project name. ${SANITISED}`, { minLength: 2, maxLength: 60 }),
      description: string(`Description. ${SANITISED}`, { maxLength: 200, default: '' }),
      color: { ...ref('ProjectColor'), default: 'indigo' },
    },
    ['name'],
  ),
  TeamMemberInput: object(
    {
      name: nameField('Name.'),
      email: emailField(),
      role: { ...ref('TeamRole'), default: 'viewer' },
    },
    ['name', 'email'],
  ),
  PlanInput: object(
    {
      name: string(`Plan name; the slug is derived from it. ${SANITISED}`, {
        minLength: 2,
        maxLength: 40,
      }),
      description: string(`One-line pitch. ${SANITISED}`, { maxLength: 160, default: '' }),
      price: integer('Price for one period in integer paise (₹1 = 100), at most ₹10,00,000.', {
        minimum: 0,
        maximum: 100_000_000,
      }),
      durationDays: integer('Length of one period in days (up to 10 years).', {
        minimum: 1,
        maximum: 3650,
      }),
      features: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        description: 'Bullet points shown on the pricing card.',
        items: string(`One feature. ${SANITISED}`, { minLength: 2, maxLength: 80 }),
      },
      limits: object(
        {
          projects: {
            type: ['integer', 'null'],
            minimum: 0,
            maximum: 100_000,
            description: 'Project limit; `null` = unlimited.',
          },
          teamMembers: {
            type: ['integer', 'null'],
            minimum: 0,
            maximum: 100_000,
            description: 'Team member limit; `null` = unlimited.',
          },
        },
        undefined,
        'Both keys are required; use `null` for unlimited.',
      ),
      tier: integer('Rank, 1–10. Higher tiers are upgrades.', { minimum: 1, maximum: 10 }),
      isPopular: {
        type: 'boolean',
        default: false,
        description: 'Show the “Most popular” badge; clears it from every other plan.',
      },
      isActive: {
        type: 'boolean',
        default: true,
        description: 'Inactive plans are hidden from the catalogue and cannot be bought.',
      },
    },
    ['name', 'price', 'durationDays', 'features', 'limits', 'tier'],
    'A plan as created or fully replaced by an administrator.',
  ),
  UserStatusRequest: object(
    {
      status: ref('UserStatus'),
      reason: reasonField('Why. Shown to the user on the sign-in page.'),
      accessExpiresAt: {
        type: ['string', 'null'],
        format: 'date-time',
        default: null,
        description:
          'Optional “access until” time, which must be in the future. Sign-in is refused after it. `null` clears it.',
      },
    },
    ['status', 'reason'],
  ),
  RoleRequest: object({ role: ref('Role') }),
  ExtendSubscriptionRequest: {
    ...object(
      {
        days: integer(
          'Days to add, counted from the later of now and the current end date (for an ended plan: from now).',
          { minimum: 1, maximum: 3650 },
        ),
        endDate: dateTime('New end date instead of `days`; must be in the future.'),
        reason: reasonField('Why. Shown to the customer in their notification.'),
      },
      ['reason'],
    ),
    oneOf: [{ required: ['days'] }, { required: ['endDate'] }],
    description:
      'Give exactly one of `days` or `endDate`. Extending an expired or cancelled subscription revives it, unless the user already has another active plan.',
  },
  ReasonRequest: object({
    reason: reasonField('Why. Recorded in the audit log and shown to the customer.'),
  }),
  AssignPlanRequest: object({
    planId: id('Plan to put the user on. Must be active.'),
    reason: reasonField('Why. Shown to the customer in their notification.'),
  }),
};

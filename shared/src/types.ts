import type {
  AdminRange,
  ChangeType,
  DisplayStatus,
  NotificationType,
  PaymentStatus,
  Role,
  SubscriptionStatus,
  TeamRole,
  UserStatus,
} from './constants';
import type { ErrorCode } from './errors';

// ---------- envelope ----------

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PageMeta;
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: ApiFieldError[];
    requestId?: string;
    /** Extra context for the UI, e.g. { retryAfterSeconds } or { limit, used }. */
    meta?: Record<string, unknown>;
  };
}

// ---------- users and auth ----------

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  statusReason: string | null;
  accessExpiresAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: UserDto;
  accessToken: string;
  /** ISO time the access token expires, so the client can refresh just before. */
  accessTokenExpiresAt: string;
}

export interface SessionDto {
  id: string;
  userAgent: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

// ---------- plans and subscriptions ----------

/** `null` means unlimited. */
export interface PlanLimits {
  projects: number | null;
  teamMembers: number | null;
}

export interface PlanDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  /** Integer paise. ₹799 is 79900. */
  price: number;
  currency: 'INR';
  durationDays: number;
  features: string[];
  limits: PlanLimits;
  tier: number;
  isPopular: boolean;
  isActive: boolean;
}

export interface PlanSummary {
  id: string;
  name: string;
  slug: string;
}

export interface SubscriptionAdjustment {
  type: 'extend' | 'expire' | 'assign' | 'cancel';
  days: number | null;
  newEndDate: string | null;
  reason: string;
  by: { id: string; name: string } | null;
  at: string;
}

export interface SubscriptionDto {
  id: string;
  plan: PlanDto;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  amountPaid: number;
  changeType: ChangeType;
  cancelledAt: string | null;
  daysLeft: number;
  totalDays: number;
  adjustments: SubscriptionAdjustment[];
  createdAt: string;
}

export interface UsageDto {
  projects: number;
  teamMembers: number;
}

export interface MySubscriptionDto {
  status: DisplayStatus;
  subscription: SubscriptionDto | null;
  /** The most recent ended plan, shown with a Renew button when nothing is active. */
  lastSubscription: SubscriptionDto | null;
  usage: UsageDto;
  limits: PlanLimits;
  /** True when there is no active plan: existing items can be viewed, not changed. */
  readOnly: boolean;
}

export interface ProrationQuote {
  changeType: ChangeType;
  plan: PlanDto;
  currentPlan: PlanSummary | null;
  /** Unused value of the current plan, in paise. */
  credit: number;
  price: number;
  amountDue: number;
  bonusDays: number;
  startDate: string;
  endDate: string;
  requiresPayment: boolean;
}

export interface CheckoutOrder {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: 'INR';
  keyId: string;
  planName: string;
  description: string;
  prefill: { name: string; email: string };
  /** "razorpay" opens Razorpay Checkout (test mode); "simulated" shows the built-in test checkout. */
  mode: 'razorpay' | 'simulated';
  /** Simulated mode only: what a successful checkout would hand back. */
  simulation?: { paymentId: string; signature: string };
}

export type SubscribeResponse =
  | { activated: true; subscription: SubscriptionDto; quote: ProrationQuote }
  | { activated: false; checkout: CheckoutOrder; quote: ProrationQuote };

export interface PaymentDto {
  id: string;
  plan: PlanSummary;
  amount: number;
  status: PaymentStatus;
  changeType: ChangeType;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  failureReason: string | null;
  createdAt: string;
}

// ---------- workspace (usage-limited resources) ----------

export interface ProjectDto {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
}

export interface TeamMemberDto {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  createdAt: string;
}

// ---------- notifications ----------

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListDto {
  items: NotificationDto[];
  unread: number;
}

// ---------- admin ----------

export interface AdminSubscriptionRow {
  id: string;
  user: { id: string; name: string; email: string };
  plan: PlanSummary;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  amountPaid: number;
  changeType: ChangeType;
  createdAt: string;
}

export interface AdminUserRow extends UserDto {
  currentPlan: PlanSummary | null;
  subscriptionStatus: DisplayStatus;
  subscriptionEndDate: string | null;
  usage: UsageDto;
  online: boolean;
}

export interface AdminUserDetail {
  user: AdminUserRow;
  subscription: SubscriptionDto | null;
  history: AdminSubscriptionRow[];
  sessions: SessionDto[];
  activity: ActivityDto[];
}

export interface KpiValue {
  value: number;
  previous: number;
}

export interface AdminStatsDto {
  range: AdminRange;
  generatedAt: string;
  kpis: {
    mrr: KpiValue;
    revenue: KpiValue;
    activeSubscribers: KpiValue;
    newSubscriptions: KpiValue;
    newUsers: KpiValue;
    churnRate: KpiValue;
    totalUsers: number;
    onlineNow: number;
    activeUsers7d: number;
    activeUsers24h: number;
    expiringSoon: number;
    usersAtLimit: number;
  };
  series: { date: string; revenue: number; newSubscriptions: number; signups: number }[];
  planMix: { planId: string; name: string; slug: string; count: number; revenue: number }[];
  statusBreakdown: { active: number; expired: number; cancelled: number; none: number };
  onlineUsers: { id: string; name: string; email: string; lastSeenAt: string }[];
  expiringSoon: AdminSubscriptionRow[];
  recentSubscriptions: AdminSubscriptionRow[];
}

export interface ActivityDto {
  id: string;
  actor: { id: string; name: string } | null;
  action: string;
  target: { type: string; id: string; label: string } | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

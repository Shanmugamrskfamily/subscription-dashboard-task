export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Account status set by an admin. "Access until" is a separate date on the user. */
export const USER_STATUSES = ['active', 'inactive', 'blocked'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ['active', 'expired', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** What the dashboard shows when a user has no subscription record at all. */
export type DisplayStatus = SubscriptionStatus | 'none';

export const CHANGE_TYPES = ['new', 'upgrade', 'downgrade', 'renewal', 'admin_assign'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const PAYMENT_STATUSES = ['created', 'paid', 'failed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const TEAM_ROLES = ['viewer', 'editor'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const LIMIT_KEYS = ['projects', 'teamMembers'] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export const NOTIFICATION_TYPES = [
  'welcome',
  'subscription_activated',
  'plan_upgraded',
  'plan_downgraded',
  'plan_renewed',
  'payment_success',
  'payment_failed',
  'expiring_soon',
  'expired',
  'cancelled',
  'admin_plan_changed',
  'admin_plan_extended',
  'admin_plan_expired',
  'account_status_changed',
  'limit_reached',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const CURRENCY = 'INR';
export const PAISE_PER_RUPEE = 100;
/** Razorpay rejects orders under ₹1, so anything smaller is treated as nothing due. */
export const MIN_CHARGE_PAISE = 100;

export const PASSWORD_MIN = 8;
/** bcrypt only reads the first 72 bytes of a password. */
export const PASSWORD_MAX = 72;
export const NAME_MIN = 2;
export const NAME_MAX = 60;
export const REASON_MIN = 5;
export const REASON_MAX = 200;

export const EXPIRING_SOON_DAYS = 3;
export const ONLINE_WINDOW_MINUTES = 5;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const ADMIN_RANGES = ['7d', '30d', '90d', '12m'] as const;
export type AdminRange = (typeof ADMIN_RANGES)[number];

export const PAGE_SIZES = [10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;

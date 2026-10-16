import type { ChangeType, DisplayStatus, PaymentStatus, UserStatus } from '@planpilot/shared';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const TONES = {
  success: 'bg-success-soft text-success-ink',
  danger: 'bg-danger-soft text-danger-ink',
  warning: 'bg-warning-soft text-warning-ink',
  info: 'bg-info-soft text-info-ink',
  brand: 'bg-brand-soft text-brand-ink',
  neutral: 'bg-surface-2 text-muted',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold whitespace-nowrap',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const STATUS: Record<DisplayStatus, { tone: Tone; label: string }> = {
  active: { tone: 'success', label: 'Active' },
  expired: { tone: 'danger', label: 'Expired' },
  cancelled: { tone: 'warning', label: 'Cancelled' },
  none: { tone: 'neutral', label: 'No plan' },
};

/** Subscription state everywhere in the app: active, expired, cancelled or none. */
export function StatusBadge({ status, className }: { status: DisplayStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} dot className={className}>
      {s.label}
    </Badge>
  );
}

const ACCOUNT: Record<UserStatus, { tone: Tone; label: string }> = {
  active: { tone: 'success', label: 'Active' },
  inactive: { tone: 'neutral', label: 'Inactive' },
  blocked: { tone: 'danger', label: 'Blocked' },
};

export function AccountBadge({ status }: { status: UserStatus }) {
  return (
    <Badge tone={ACCOUNT[status].tone} dot>
      {ACCOUNT[status].label}
    </Badge>
  );
}

const PAYMENT: Record<PaymentStatus, { tone: Tone; label: string }> = {
  paid: { tone: 'success', label: 'Paid' },
  failed: { tone: 'danger', label: 'Failed' },
  created: { tone: 'warning', label: 'Pending' },
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge tone={PAYMENT[status].tone} dot>
      {PAYMENT[status].label}
    </Badge>
  );
}

export const CHANGE_LABEL: Record<ChangeType, string> = {
  new: 'New',
  renewal: 'Renewal',
  upgrade: 'Upgrade',
  downgrade: 'Downgrade',
  admin_assign: 'Set by admin',
};

const PLAN_TONE: Record<string, string> = {
  starter: 'bg-info-soft text-info-ink',
  pro: 'bg-brand-soft text-brand-ink',
  business: 'bg-[color-mix(in_srgb,var(--violet)_14%,transparent)] text-violet',
  'pro-annual': 'bg-warning-soft text-warning-ink',
};

export function PlanPill({
  slug,
  name,
  className,
}: {
  slug: string;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-lg px-2.5 py-0.5 text-[13px] font-extrabold whitespace-nowrap',
        PLAN_TONE[slug] ?? TONES.neutral,
        className,
      )}
    >
      {name}
    </span>
  );
}

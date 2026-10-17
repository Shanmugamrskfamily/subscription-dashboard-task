import type { ActivityDto } from '@planpilot/shared';
import {
  Ban,
  CalendarPlus,
  CalendarX,
  CircleCheck,
  CreditCard,
  KeyRound,
  Layers,
  LogIn,
  LogOut,
  RefreshCw,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  UserCog,
  UserPlus,
  UserRoundX,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Skeleton } from '../../../components/ui/feedback';
import { cn } from '../../../lib/cn';
import { formatDate, formatInr, formatRelative, plural } from '../../../lib/format';
import { formatFullDateTime } from './utils';

export type ActivityCategory = 'customers' | 'admin' | 'security';

const TONE = {
  info: 'bg-info-soft text-info-ink',
  success: 'bg-success-soft text-success-ink',
  brand: 'bg-brand-soft text-brand-ink',
  warning: 'bg-warning-soft text-warning-ink',
  violet: 'bg-[color-mix(in_srgb,var(--violet)_14%,transparent)] text-violet',
  danger: 'bg-danger-soft text-danger-ink',
  neutral: 'bg-surface-2 text-muted',
} as const;

interface Described {
  icon: LucideIcon;
  tone: keyof typeof TONE;
  category: ActivityCategory;
  sentence: ReactNode;
  reason: string | null;
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

function Strong({ children }: { children: ReactNode }) {
  return <b className="font-extrabold text-ink">{children}</b>;
}

/** The target, linked to their user drawer when it's a person. */
function Target({ activity }: { activity: ActivityDto }) {
  const target = activity.target;
  if (!target) return <Strong>someone</Strong>;
  if (target.type !== 'user') return <Strong>{target.label}</Strong>;
  return (
    <Link
      to={`/admin/users?user=${target.id}`}
      className="font-extrabold break-all text-ink underline decoration-line-strong underline-offset-2 hover:text-brand-ink hover:decoration-current"
    >
      {target.label}
    </Link>
  );
}

/** Turns a raw audit entry into a sentence: "Ananya Iyer blocked rohan@… — reason". */
export function describeActivity(a: ActivityDto): Described {
  const actor = <Strong>{a.actor?.name ?? 'The system'}</Strong>;
  const target = <Target activity={a} />;
  const meta = a.meta ?? {};
  const plan = text(meta.plan);
  const planName = plan ? <Strong>{plan}</Strong> : 'a plan';
  const reason = text(meta.reason);
  const base = { reason };

  switch (a.action) {
    case 'auth.registered':
      return {
        ...base,
        icon: UserPlus,
        tone: 'info',
        category: 'customers',
        sentence: <>{actor} created an account</>,
      };
    case 'auth.login':
      return {
        ...base,
        icon: LogIn,
        tone: 'info',
        category: 'customers',
        sentence: <>{actor} signed in</>,
      };
    case 'auth.password_changed':
      return {
        ...base,
        icon: KeyRound,
        tone: 'info',
        category: 'customers',
        sentence: <>{actor} changed their password</>,
      };
    case 'subscription.new':
    case 'subscription.renewal':
    case 'subscription.upgrade':
    case 'subscription.downgrade': {
      const verb = {
        'subscription.new': 'subscribed to',
        'subscription.renewal': 'renewed',
        'subscription.upgrade': 'upgraded to',
        'subscription.downgrade': 'downgraded to',
      }[a.action];
      const paid = typeof meta.amountPaid === 'number' && meta.amountPaid > 0;
      return {
        ...base,
        icon: a.action === 'subscription.downgrade' ? TrendingDown : Rocket,
        tone: a.action === 'subscription.downgrade' ? 'info' : 'success',
        category: 'customers',
        sentence: (
          <>
            {actor} {verb} {planName}
            {paid && <> · paid {formatInr(meta.amountPaid as number)}</>}
          </>
        ),
      };
    }
    case 'subscription.cancelled':
      return {
        ...base,
        icon: XCircle,
        tone: 'warning',
        category: 'customers',
        sentence: (
          <>
            {actor} cancelled their {planName} plan
          </>
        ),
      };
    case 'admin.user.blocked':
      return {
        ...base,
        icon: Ban,
        tone: 'danger',
        category: 'admin',
        sentence: (
          <>
            {actor} blocked {target}
          </>
        ),
      };
    case 'admin.user.inactive':
      return {
        ...base,
        icon: UserRoundX,
        tone: 'warning',
        category: 'admin',
        sentence: (
          <>
            {actor} made {target} inactive
          </>
        ),
      };
    case 'admin.user.activated':
      return {
        ...base,
        icon: ShieldCheck,
        tone: 'success',
        category: 'admin',
        sentence: (
          <>
            {actor} reactivated {target}
          </>
        ),
      };
    case 'admin.user.role_changed':
      return {
        ...base,
        icon: UserCog,
        tone: 'warning',
        category: 'admin',
        sentence:
          meta.role === 'admin' ? (
            <>
              {actor} made {target} an admin
            </>
          ) : (
            <>
              {actor} changed {target} to a customer account
            </>
          ),
      };
    case 'admin.user.signed_out':
      return {
        ...base,
        icon: LogOut,
        tone: 'warning',
        category: 'admin',
        sentence: (
          <>
            {actor} signed {target} out everywhere
            {typeof meta.revoked === 'number' && <> ({plural(meta.revoked, 'session')})</>}
          </>
        ),
      };
    case 'admin.subscription.extended':
    case 'admin.subscription.revived': {
      const until = text(meta.newEndDate);
      return {
        ...base,
        icon: CalendarPlus,
        tone: 'brand',
        category: 'admin',
        sentence: (
          <>
            {actor} {a.action === 'admin.subscription.revived' ? 'revived' : 'extended'} {target}
            's {planName} plan
            {until && <> until {formatDate(until)}</>}
          </>
        ),
      };
    }
    case 'admin.subscription.expired':
    case 'admin.subscription.cancelled':
      return {
        ...base,
        icon: CalendarX,
        tone: 'danger',
        category: 'admin',
        sentence: (
          <>
            {actor} {a.action === 'admin.subscription.expired' ? 'expired' : 'cancelled'} {target}'s{' '}
            {planName} plan
          </>
        ),
      };
    case 'admin.subscription.assigned': {
      const previous = text(meta.previousPlan);
      return {
        ...base,
        icon: RefreshCw,
        tone: 'brand',
        category: 'admin',
        sentence: (
          <>
            {actor} moved {target} {previous && <>from {previous} </>}to {planName}
          </>
        ),
      };
    }
    case 'admin.plan.created':
    case 'admin.plan.updated':
    case 'admin.plan.archived':
    case 'admin.plan.deleted': {
      const verb = a.action.split('.')[2];
      return {
        ...base,
        icon: Layers,
        tone: 'violet',
        category: 'admin',
        sentence: (
          <>
            {actor} {verb} the {target} plan
          </>
        ),
      };
    }
    case 'security.account_locked':
      return {
        ...base,
        icon: ShieldAlert,
        tone: 'danger',
        category: 'security',
        sentence: <>{target} was locked after too many failed sign-in attempts</>,
      };
    case 'security.refresh_token_reuse':
      return {
        ...base,
        icon: ShieldAlert,
        tone: 'danger',
        category: 'security',
        sentence: (
          <>A reused sign-in token was blocked for {actor}. All their sessions were signed out.</>
        ),
      };
    case 'security.payment_signature_mismatch':
      return {
        ...base,
        icon: CreditCard,
        tone: 'danger',
        category: 'security',
        sentence: <>A payment by {actor} failed the signature check and was rejected</>,
      };
    default: {
      const security = a.action.startsWith('security.');
      const words = a.action.split('.').slice(1).join(' ').replace(/_/g, ' ');
      return {
        ...base,
        icon: security ? ShieldAlert : CircleCheck,
        tone: security ? 'danger' : 'neutral',
        category: security ? 'security' : a.action.startsWith('admin.') ? 'admin' : 'customers',
        sentence: (
          <>
            {actor} · {words || a.action}
            {a.target && <> · {target}</>}
          </>
        ),
      };
    }
  }
}

export function ActivityIcon({
  activity,
  className,
}: {
  activity: ActivityDto;
  className?: string;
}) {
  const { icon: Icon, tone } = describeActivity(activity);
  return (
    <span
      className={cn('grid size-9 shrink-0 place-items-center rounded-xl', TONE[tone], className)}
    >
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}

export function ActivityItem({
  activity,
  compact = false,
}: {
  activity: ActivityDto;
  compact?: boolean;
}) {
  const { sentence, reason } = describeActivity(activity);
  return (
    <div className="flex min-w-0 gap-3">
      <ActivityIcon activity={activity} />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={cn('text-sm text-muted', compact && 'line-clamp-2')}>
          {sentence}
          {reason && compact && <> — {reason}</>}
        </p>
        {reason && !compact && (
          <p className="mt-1 border-l-2 border-line-strong pl-2.5 text-[13px] text-muted italic">
            {reason}
          </p>
        )}
        <time
          dateTime={activity.createdAt}
          title={formatFullDateTime(activity.createdAt)}
          className="mt-0.5 block text-xs text-subtle"
        >
          {formatRelative(activity.createdAt)}
        </time>
      </div>
    </div>
  );
}

export function ActivitySkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-9 rounded-xl" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

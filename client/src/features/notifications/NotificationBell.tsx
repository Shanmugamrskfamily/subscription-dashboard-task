import type { NotificationDto, NotificationType } from '@planpilot/shared';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  CircleCheck,
  CreditCard,
  Gauge,
  PartyPopper,
  Rocket,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { DropdownMenu as M } from 'radix-ui';
import { Link } from 'react-router';
import { useAppSelector } from '../../app/store';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';
import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsQuery,
} from './notificationsApi';

export const NOTIFICATION_ICON: Record<NotificationType, { icon: typeof Bell; tone: string }> = {
  welcome: { icon: PartyPopper, tone: 'bg-brand-soft text-brand-ink' },
  subscription_activated: { icon: CircleCheck, tone: 'bg-success-soft text-success-ink' },
  plan_upgraded: { icon: Rocket, tone: 'bg-brand-soft text-brand-ink' },
  plan_downgraded: { icon: Rocket, tone: 'bg-info-soft text-info-ink' },
  plan_renewed: { icon: CircleCheck, tone: 'bg-success-soft text-success-ink' },
  payment_success: { icon: CreditCard, tone: 'bg-success-soft text-success-ink' },
  payment_failed: { icon: XCircle, tone: 'bg-danger-soft text-danger-ink' },
  expiring_soon: { icon: CalendarClock, tone: 'bg-warning-soft text-warning-ink' },
  expired: { icon: AlertTriangle, tone: 'bg-danger-soft text-danger-ink' },
  cancelled: { icon: XCircle, tone: 'bg-warning-soft text-warning-ink' },
  admin_plan_changed: { icon: ShieldAlert, tone: 'bg-brand-soft text-brand-ink' },
  admin_plan_extended: { icon: CalendarClock, tone: 'bg-success-soft text-success-ink' },
  admin_plan_expired: { icon: ShieldAlert, tone: 'bg-danger-soft text-danger-ink' },
  account_status_changed: { icon: ShieldAlert, tone: 'bg-warning-soft text-warning-ink' },
  limit_reached: { icon: Gauge, tone: 'bg-warning-soft text-warning-ink' },
};

export function NotificationRow({
  n,
  onRead,
  compact = false,
}: {
  n: NotificationDto;
  onRead?: (id: string) => void;
  compact?: boolean;
}) {
  const { icon: Icon, tone } = NOTIFICATION_ICON[n.type];
  return (
    <div className={cn('flex gap-3 rounded-xl p-2.5', !n.readAt && 'bg-brand-soft/50')}>
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', tone)}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm font-extrabold', compact && 'truncate')}>{n.title}</p>
          {!n.readAt && (
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-brand"
              role="img"
              aria-label="Unread"
            />
          )}
        </div>
        <p className={cn('mt-0.5 text-[13px] text-muted', compact && 'line-clamp-2')}>{n.body}</p>
        <div className="mt-1 flex items-center gap-3">
          <time className="text-xs text-subtle" dateTime={n.createdAt}>
            {formatRelative(n.createdAt)}
          </time>
          {!n.readAt && onRead && (
            <button
              type="button"
              className="cursor-pointer text-xs font-extrabold text-brand-ink hover:underline"
              onClick={() => onRead(n.id)}
            >
              Mark read
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Bell with unread badge; polls every 30 s while the tab is visible. */
export function NotificationBell() {
  const signedIn = useAppSelector((s) => s.auth.status === 'authenticated');
  const { data } = useNotificationsQuery(undefined, {
    skip: !signedIn,
    pollingInterval: 30_000,
    skipPollingIfUnfocused: true,
  });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, { isLoading }] = useMarkAllNotificationsReadMutation();
  const unread = data?.unread ?? 0;

  return (
    <M.Root>
      <M.Trigger
        className="relative grid size-10 cursor-pointer place-items-center rounded-xl border border-line bg-surface text-ink shadow-card hover:bg-surface-2"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-surface bg-danger px-1 text-[10px] font-black text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-surface p-2 shadow-pop data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="font-extrabold">Notifications</p>
            <button
              type="button"
              disabled={!unread || isLoading}
              onClick={() => void markAll()}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-extrabold text-brand-ink hover:bg-brand-soft disabled:cursor-default disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          </div>
          <div className="max-h-[60dvh] space-y-1 overflow-y-auto">
            {data?.items.length ? (
              data.items
                .slice(0, 6)
                .map((n) => (
                  <NotificationRow key={n.id} n={n} compact onRead={(id) => void markRead(id)} />
                ))
            ) : (
              <p className="px-3 py-8 text-center text-sm text-muted">You're all caught up.</p>
            )}
          </div>
          <M.Item asChild>
            <Link
              to="/notifications"
              className="mt-1 block rounded-xl px-3 py-2.5 text-center text-sm font-extrabold text-brand-ink outline-none hover:bg-surface-2 data-[highlighted]:bg-surface-2"
            >
              View all notifications
            </Link>
          </M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

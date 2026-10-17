import type { AdminUserDetail } from '@planpilot/shared';
import {
  CalendarClock,
  CalendarPlus,
  CalendarX,
  LogOut,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserCog,
} from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAppSelector } from '../../../app/store';
import {
  AccountBadge,
  Badge,
  CHANGE_LABEL,
  PlanPill,
  StatusBadge,
} from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Drawer } from '../../../components/ui/dialog';
import { Avatar, Illustration, ProgressBar, Skeleton } from '../../../components/ui/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/menu';
import { cn } from '../../../lib/cn';
import { formatDate, formatInr, formatRelative } from '../../../lib/format';
import { useAdminUserQuery } from '../adminApi';
import { ActivityItem } from './activity';
import { DetailList, DetailRow, DisabledReason, DrawerSection, ErrorState } from './common';
import { EndPlanDialog, ExtendPlanDialog } from './dialogs';
import type { PlanTarget } from './dialogs';
import { AccountStatusDialog, ChangePlanDialog, RoleDialog, SignOutDialog } from './userDialogs';
import { describeAgent, durationLabel, endsLabel, firstName } from './utils';

type Action = 'plan' | 'extend' | 'expire' | 'status' | 'role' | 'signout';

/** Everything about one person, and every admin control over their account and plan. */
export function UserDrawer({
  userId,
  open,
  onOpenChange,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // currentData (not data) so switching people never flashes the previous person.
  const { currentData, isFetching, isError, error, refetch } = useAdminUserQuery(userId, {
    skip: !userId,
  });
  const [action, setAction] = useState<Action | null>(null);
  const user = currentData?.user;

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title={user?.name ?? 'Customer details'}
        description={user?.email ?? (isFetching ? 'Loading…' : undefined)}
      >
        {currentData ? (
          <UserDetails detail={currentData} onAction={setAction} />
        ) : isError ? (
          <ErrorState
            error={error}
            onRetry={() => void refetch()}
            retrying={isFetching}
            title="We couldn't load this person"
          />
        ) : (
          <UserDrawerSkeleton />
        )}
      </Drawer>
      {currentData && (
        <UserActions detail={currentData} action={action} onClose={() => setAction(null)} />
      )}
    </>
  );
}

function UserActions({
  detail,
  action,
  onClose,
}: {
  detail: AdminUserDetail;
  action: Action | null;
  onClose: () => void;
}) {
  const { user, subscription, history } = detail;
  const last = history[0];
  const target: PlanTarget | null = subscription
    ? {
        id: subscription.id,
        customer: user.name,
        plan: subscription.plan.name,
        endDate: subscription.endDate,
        active: true,
      }
    : last
      ? {
          id: last.id,
          customer: user.name,
          plan: last.plan.name,
          endDate: last.endDate,
          active: false,
        }
      : null;
  const props = (name: Action) => ({
    detail,
    open: action === name,
    onOpenChange: (next: boolean) => !next && onClose(),
  });
  const close = (next: boolean) => !next && onClose();
  return (
    <>
      <ChangePlanDialog {...props('plan')} />
      <AccountStatusDialog {...props('status')} />
      <RoleDialog {...props('role')} />
      <SignOutDialog {...props('signout')} />
      <ExtendPlanDialog target={target} open={action === 'extend'} onOpenChange={close} />
      <EndPlanDialog
        target={target}
        kind="expire"
        open={action === 'expire'}
        onOpenChange={close}
      />
    </>
  );
}

function UserDetails({
  detail,
  onAction,
}: {
  detail: AdminUserDetail;
  onAction: (action: Action) => void;
}) {
  const { user, history, sessions, activity } = detail;
  const myId = useAppSelector((s) => s.auth.user?.id);
  const self = user.id === myId;
  const name = firstName(user.name);
  const restricted = user.status !== 'active';

  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar name={user.name} online={user.online} className="size-14 text-lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={user.role === 'admin' ? 'brand' : 'neutral'}>
              {user.role === 'admin' ? 'Admin' : 'Customer'}
            </Badge>
            <AccountBadge status={user.status} />
            {self && <Badge tone="info">You</Badge>}
          </div>
          <p className="mt-1.5 text-[13px] text-muted">
            {user.online ? (
              <span className="font-extrabold text-success-ink">Online now</span>
            ) : user.lastSeenAt ? (
              `Last seen ${formatRelative(user.lastSeenAt)}`
            ) : (
              'Never signed in'
            )}{' '}
            · Joined {formatDate(user.createdAt)}
          </p>
        </div>
      </div>

      {(restricted || user.accessExpiresAt) && (
        <div
          className={cn(
            'mt-4 flex items-center gap-3 rounded-xl p-3.5 text-sm',
            user.status === 'blocked'
              ? 'bg-danger-soft text-danger-ink'
              : restricted
                ? 'bg-warning-soft text-warning-ink'
                : 'bg-info-soft text-info-ink',
          )}
        >
          <Illustration
            name={
              user.status === 'blocked'
                ? 'accountBlocked'
                : restricted
                  ? 'accountInactive'
                  : 'accessExpired'
            }
            size={44}
            className="shrink-0"
          />
          <div className="min-w-0">
            {restricted && (
              <p className="font-extrabold">
                {user.status === 'blocked' ? 'Blocked' : 'Inactive'}
                {user.statusReason && <span className="font-bold">: {user.statusReason}</span>}
              </p>
            )}
            {user.accessExpiresAt && (
              <p className={cn(restricted ? 'mt-0.5' : 'font-extrabold')}>
                Access until {formatDate(user.accessExpiresAt)}
              </p>
            )}
          </div>
        </div>
      )}

      {user.role === 'user' ? (
        <PlanSection detail={detail} onAction={onAction} />
      ) : (
        <DrawerSection title="Plan">
          <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-sm text-muted">
            Admins don't have plans. Change the role to customer to assign one.
          </p>
        </DrawerSection>
      )}

      <DrawerSection title="Account">
        <DetailList>
          <DetailRow label="Status">
            <AccountBadge status={user.status} />
          </DetailRow>
          <DetailRow label="Access until">
            {user.accessExpiresAt ? formatDate(user.accessExpiresAt) : 'No end date'}
          </DetailRow>
          <DetailRow label="Role">{user.role === 'admin' ? 'Admin' : 'Customer'}</DetailRow>
          <DetailRow label="Email">
            <span className="block truncate" title={user.email}>
              {user.email}
            </span>
          </DetailRow>
        </DetailList>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <DisabledReason reason={self ? "You can't change your own account status." : undefined}>
            <Button
              variant="outline"
              className="w-full"
              disabled={self}
              onClick={() => onAction('status')}
            >
              <ShieldCheck aria-hidden /> Set status
            </Button>
          </DisabledReason>
          <DisabledReason reason={self ? "You can't change your own role." : undefined}>
            <Button
              variant="outline"
              className="w-full"
              disabled={self}
              onClick={() => onAction('role')}
            >
              <UserCog aria-hidden /> Change role
            </Button>
          </DisabledReason>
          <DisabledReason
            reason={
              self
                ? 'This would sign you out too. Use your profile page to manage your own sessions.'
                : !sessions.length
                  ? `${name} isn't signed in anywhere.`
                  : undefined
            }
          >
            <Button
              variant="danger-ghost"
              className="w-full"
              disabled={self || !sessions.length}
              onClick={() => onAction('signout')}
            >
              <LogOut aria-hidden /> Sign out everywhere
            </Button>
          </DisabledReason>
        </div>
        {self && (
          <p className="mt-2 text-xs text-muted">
            This is your own account, so status, role and sign-out controls are turned off here.
          </p>
        )}
      </DrawerSection>

      <Tabs defaultValue="history" className="mt-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="history" className="justify-center">
            Plans <Count n={history.length} />
          </TabsTrigger>
          <TabsTrigger value="sessions" className="justify-center">
            Sessions <Count n={sessions.length} />
          </TabsTrigger>
          <TabsTrigger value="activity" className="justify-center">
            Activity <Count n={activity.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-3 outline-none">
          {history.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {history.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PlanPill slug={h.plan.slug} name={h.plan.name} />
                      <StatusBadge status={h.status} />
                    </div>
                    <p className="num mt-1.5 text-xs text-muted">
                      {formatDate(h.startDate)} to {formatDate(h.endDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num text-sm font-extrabold">{formatInr(h.amountPaid)}</p>
                    <p className="text-xs text-muted">{CHANGE_LABEL[h.changeType]}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <TabEmpty>{name} hasn't had a plan yet.</TabEmpty>
          )}
        </TabsContent>

        <TabsContent value="sessions" className="mt-3 outline-none">
          {sessions.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {sessions.map((s) => {
                const device = describeAgent(s.userAgent);
                const Icon = device.mobile ? Smartphone : Monitor;
                return (
                  <li key={s.id} className="flex items-center gap-3 px-3.5 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold">{device.label}</p>
                      <p className="text-xs text-muted">
                        Signed in {formatRelative(s.createdAt)} · active{' '}
                        {formatRelative(s.lastUsedAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <TabEmpty>{name} isn't signed in on any device.</TabEmpty>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-3 outline-none">
          {activity.length ? (
            <ul className="space-y-4">
              {activity.map((a) => (
                <li key={a.id}>
                  <ActivityItem activity={a} />
                </li>
              ))}
            </ul>
          ) : (
            <TabEmpty>Nothing recorded for {name} yet.</TabEmpty>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function PlanSection({
  detail,
  onAction,
}: {
  detail: AdminUserDetail;
  onAction: (action: Action) => void;
}) {
  const { user, subscription: sub, history } = detail;
  const last = history[0];
  const name = firstName(user.name);

  if (!sub) {
    return (
      <DrawerSection title="Current plan">
        <div className="flex items-center gap-4 rounded-2xl border border-dashed border-line-strong p-4">
          <Illustration name="emptyBox" size={64} className="shrink-0" />
          <div className="min-w-0">
            <p className="font-extrabold">No active plan</p>
            <p className="text-[13px] text-muted">
              {last
                ? `${name}'s ${last.plan.name} plan ${last.status === 'cancelled' ? 'was cancelled' : 'ended'} on ${formatDate(last.endDate)}.`
                : `${name} hasn't subscribed yet.`}
            </p>
          </div>
        </div>
        <div className={cn('mt-3 grid gap-2', last && 'sm:grid-cols-2')}>
          <Button onClick={() => onAction('plan')}>
            <RefreshCw aria-hidden /> Assign a plan
          </Button>
          {last && (
            <Button variant="outline" onClick={() => onAction('extend')}>
              <CalendarPlus aria-hidden /> Revive {last.plan.name}
            </Button>
          )}
        </div>
      </DrawerSection>
    );
  }

  const { limits } = sub.plan;
  return (
    <DrawerSection title="Current plan">
      <div className="rounded-2xl border border-line bg-surface-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PlanPill slug={sub.plan.slug} name={sub.plan.name} />
          <StatusBadge status={sub.status} />
        </div>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
          <span className="num text-[28px] leading-none font-black tracking-tight">
            {sub.daysLeft}
          </span>
          <span className="text-sm font-bold text-muted">
            {sub.daysLeft === 1 ? 'day left' : 'days left'} · {endsLabel(sub.endDate)}
          </span>
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
          <CalendarClock className="size-3.5" aria-hidden />
          {formatDate(sub.startDate)} to {formatDate(sub.endDate)} · {formatInr(sub.plan.price)} /{' '}
          {durationLabel(sub.plan.durationDays)}
        </p>
        <div className="mt-4 space-y-3">
          <Usage label="Projects" used={user.usage.projects} limit={limits.projects} />
          <Usage label="Team members" used={user.usage.teamMembers} limit={limits.teamMembers} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Button className="col-span-2 sm:col-span-1" onClick={() => onAction('plan')}>
          <RefreshCw aria-hidden /> Change plan
        </Button>
        <Button variant="outline" onClick={() => onAction('extend')}>
          <CalendarPlus aria-hidden /> Extend
        </Button>
        <Button variant="danger-ghost" onClick={() => onAction('expire')}>
          <CalendarX aria-hidden /> Expire now
        </Button>
      </div>
    </DrawerSection>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const full = limit !== null && used >= limit;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
        <span className="font-extrabold">{label}</span>
        <span className={cn('num font-bold text-muted', full && 'text-danger-ink')}>
          {limit === null ? `${used} · Unlimited` : `${used} of ${limit}`}
          {full && ' · at limit'}
        </span>
      </div>
      <ProgressBar value={used} max={limit} label={`${label} used`} />
    </div>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="num rounded-full bg-surface-3 px-1.5 text-[11px] leading-5 font-black text-muted">
      {n}
    </span>
  );
}

function TabEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">{children}</p>
  );
}

function UserDrawerSkeleton() {
  return (
    <div aria-busy aria-label="Loading details">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-56 max-w-full" />
        </div>
      </div>
      <Skeleton className="mt-7 h-3 w-24" />
      <Skeleton className="mt-3 h-44 w-full rounded-2xl" />
      <Skeleton className="mt-3 h-11 w-full rounded-xl" />
      <Skeleton className="mt-7 h-3 w-20" />
      <Skeleton className="mt-3 h-40 w-full rounded-xl" />
    </div>
  );
}

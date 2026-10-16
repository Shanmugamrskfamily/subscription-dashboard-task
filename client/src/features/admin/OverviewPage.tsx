import { ADMIN_RANGES } from '@planpilot/shared';
import type {
  AdminRange,
  AdminStatsDto,
  AdminSubscriptionRow,
  DisplayStatus,
} from '@planpilot/shared';
import {
  ArrowRight,
  BadgeCheck,
  CalendarPlus,
  Gauge,
  Hourglass,
  IndianRupee,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { Variants } from 'motion/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '../../components/layout/AdminShell';
import { Badge, CHANGE_LABEL, PlanPill, StatusBadge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Card, CardHeader } from '../../components/ui/card';
import { CountUp, Delta, KpiCard, KpiSkeleton, ResponsiveTable } from '../../components/ui/data';
import type { Column } from '../../components/ui/data';
import { Avatar, EmptyState, Illustration, Skeleton } from '../../components/ui/feedback';
import { Segmented } from '../../components/ui/menu';
import { cn } from '../../lib/cn';
import {
  formatDate,
  formatInr,
  formatNumber,
  formatRelative,
  percentChange,
  plural,
} from '../../lib/format';
import { useActivityQuery, useAdminStatsQuery, useExtendSubscriptionMutation } from './adminApi';
import { ActivityItem, ActivitySkeleton } from './components/activity';
import { PlanMixChart, RevenueChart, Sparkline, StatusBreakdown } from './components/charts';
import { ErrorCard, ErrorState, ExportCsvButton, LiveDot, PersonCell } from './components/common';
import { ReasonDialog } from './components/dialogs';
import { useUrlParams } from './components/hooks';
import {
  calendarDaysUntil,
  endsLabel,
  firstName,
  formatKpiInr,
  formatRupees,
  previewEndDate,
  todayLabel,
} from './components/utils';

const RANGE_LABEL: Record<AdminRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '12m': 'Last 12 months',
};
const RANGE_OPTIONS = ADMIN_RANGES.map((value) => ({ value, label: value }));
const isRange = (value: string): value is AdminRange =>
  (ADMIN_RANGES as readonly string[]).includes(value);

const count = (n: number) => formatNumber(Math.round(n));
/** Tile figures shrink a little in narrow tiles (phones, 4-column laptops) instead of overflowing. */
const tileValue = 'text-[22px] @[12rem]:text-[28px]';

export default function OverviewPage() {
  const { get, update } = useUrlParams();
  const param = get('range');
  const range: AdminRange = isRange(param) ? param : '30d';
  // Polling keeps "Online now" live; paused while the tab is in the background.
  const stats = useAdminStatsQuery(range, {
    pollingInterval: 20_000,
    skipPollingIfUnfocused: true,
  });
  const switching = Boolean(stats.data && stats.data.range !== range);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${todayLabel()} · Live business health`}
        actions={
          <Segmented
            label="Date range"
            value={range}
            onChange={(next) => update({ range: next === '30d' ? null : next })}
            options={RANGE_OPTIONS}
            className="w-full sm:w-auto"
          />
        }
      />
      {stats.data ? (
        <div
          className={cn('transition-opacity duration-200', switching && 'opacity-60')}
          aria-busy={switching}
        >
          <Dashboard data={stats.data} range={stats.data.range} />
        </div>
      ) : stats.isError ? (
        <ErrorCard
          error={stats.error}
          onRetry={() => void stats.refetch()}
          retrying={stats.isFetching}
          title="We couldn't load the overview"
        />
      ) : (
        <OverviewSkeleton />
      )}
    </>
  );
}

// ---------- layout ----------

function useEntrance() {
  const reduce = useReducedMotion();
  const container: Variants = { show: { transition: { staggerChildren: 0.05 } } };
  const item: Variants = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
  };
  return { container, item, initial: reduce ? (false as const) : 'hidden' };
}

function Dashboard({ data, range }: { data: AdminStatsDto; range: AdminRange }) {
  const navigate = useNavigate();
  const { container, item, initial } = useEntrance();
  const { kpis } = data;

  const openStatus = (status: DisplayStatus) =>
    navigate(
      status === 'none'
        ? '/admin/users?subscription=none'
        : `/admin/subscriptions?status=${status}`,
    );

  return (
    <>
      <motion.div
        variants={container}
        initial={initial}
        animate="show"
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        <motion.div variants={item} className="col-span-2 lg:row-span-2">
          <MrrHero kpi={kpis.mrr} series={data.series} range={range} />
        </motion.div>
        <Tile variants={item}>
          <KpiCard
            label="Active subscribers"
            icon={<BadgeCheck />}
            className="h-full @container"
            onClick={() => navigate('/admin/subscriptions?status=active')}
            footer={
              <Delta
                value={kpis.activeSubscribers.value}
                previous={kpis.activeSubscribers.previous}
              />
            }
          >
            <CountUp value={kpis.activeSubscribers.value} format={count} className={tileValue} />
          </KpiCard>
        </Tile>
        <Tile variants={item}>
          <KpiCard
            label="Online now"
            icon={<LiveDot />}
            tone="success"
            className="h-full @container"
            onClick={() => navigate('/admin/users?sort=-lastSeenAt')}
            footer={<AvatarStack users={data.onlineUsers} total={kpis.onlineNow} />}
          >
            <CountUp value={kpis.onlineNow} format={count} className={tileValue} />
          </KpiCard>
        </Tile>
        <Tile variants={item}>
          <KpiCard
            label="Active users (7d)"
            icon={<Users />}
            tone="sky"
            className="h-full @container"
            footer={
              <span className="text-xs font-extrabold text-muted">
                <b className="num text-ink">{formatNumber(kpis.activeUsers24h)}</b> today (DAU)
              </span>
            }
          >
            <CountUp value={kpis.activeUsers7d} format={count} className={tileValue} />
          </KpiCard>
        </Tile>
        <Tile variants={item}>
          <KpiCard
            label="Expiring in 7 days"
            icon={<Hourglass />}
            tone="warning"
            className="h-full @container"
            onClick={() => navigate('/admin/subscriptions?status=active&sort=endDate')}
            footer={
              <span className="inline-flex items-center gap-1 text-xs font-extrabold text-brand-ink">
                Review and extend <ArrowRight className="size-3.5" aria-hidden />
              </span>
            }
          >
            <CountUp value={kpis.expiringSoon} format={count} className={tileValue} />
          </KpiCard>
        </Tile>
        <Tile variants={item}>
          <KpiCard
            label={`Revenue (${range})`}
            icon={<IndianRupee />}
            tone="success"
            className="h-full @container"
            footer={<Delta value={kpis.revenue.value} previous={kpis.revenue.previous} />}
          >
            <span title={formatInr(kpis.revenue.value)}>
              <CountUp value={kpis.revenue.value} format={formatKpiInr} className={tileValue} />
            </span>
          </KpiCard>
        </Tile>
        <Tile variants={item}>
          <KpiCard
            label="New subscriptions"
            icon={<Sparkles />}
            tone="violet"
            className="h-full @container"
            footer={
              <Delta
                value={kpis.newSubscriptions.value}
                previous={kpis.newSubscriptions.previous}
              />
            }
          >
            <CountUp value={kpis.newSubscriptions.value} format={count} className={tileValue} />
          </KpiCard>
        </Tile>
        <Tile variants={item}>
          <KpiCard
            label="Churn rate"
            icon={<TrendingDown />}
            tone="danger"
            className="h-full @container"
            footer={
              <Delta value={kpis.churnRate.value} previous={kpis.churnRate.previous} invert />
            }
          >
            <CountUp
              value={kpis.churnRate.value}
              format={(n) => `${n.toFixed(1)}%`}
              className={tileValue}
            />
          </KpiCard>
        </Tile>
        <Tile variants={item}>
          <KpiCard
            label="Users at plan limit"
            icon={<Gauge />}
            tone="warning"
            className="h-full @container"
            footer={<span className="text-xs font-extrabold text-muted">Upsell opportunity</span>}
          >
            <CountUp value={kpis.usersAtLimit} format={count} className={tileValue} />
          </KpiCard>
        </Tile>
      </motion.div>

      <motion.div
        variants={container}
        initial={initial}
        animate="show"
        className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      >
        <motion.div variants={item} className="min-w-0">
          <RevenueCard data={data} range={range} />
        </motion.div>
        <motion.div variants={item} className="min-w-0">
          <Card className="h-full @container">
            <CardHeader title="Plan mix" description="Click a plan to see its subscriptions" />
            <PlanMixChart
              planMix={data.planMix}
              onSelect={(planId) => navigate(`/admin/subscriptions?status=active&planId=${planId}`)}
            />
            <div className="mt-4 border-t border-line pt-4">
              <StatusBreakdown breakdown={data.statusBreakdown} onSelect={openStatus} />
            </div>
          </Card>
        </motion.div>
      </motion.div>

      <motion.div
        variants={container}
        initial={initial}
        animate="show"
        className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      >
        <motion.div variants={item} className="min-w-0">
          <RecentSubscriptions rows={data.recentSubscriptions} />
        </motion.div>
        <motion.div variants={item} className="min-w-0">
          <ExpiringSoon rows={data.expiringSoon} total={kpis.expiringSoon} />
        </motion.div>
      </motion.div>

      <motion.div
        variants={container}
        initial={initial}
        animate="show"
        className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      >
        <motion.div variants={item} className="min-w-0">
          <RecentActivity />
        </motion.div>
        <motion.div variants={item} className="min-w-0">
          <OnlineNow users={data.onlineUsers} total={kpis.onlineNow} />
        </motion.div>
      </motion.div>
    </>
  );
}

function Tile({ variants, children }: { variants: Variants; children: ReactNode }) {
  return (
    <motion.div variants={variants} className="min-w-0">
      {children}
    </motion.div>
  );
}

// ---------- KPI pieces ----------

function MrrHero({
  kpi,
  series,
  range,
}: {
  kpi: AdminStatsDto['kpis']['mrr'];
  series: AdminStatsDto['series'];
  range: AdminRange;
}) {
  const change = percentChange(kpi.value, kpi.previous);
  const Trend = change !== null && change < 0 ? TrendingDown : TrendingUp;
  // A running total reads as a growth line; daily revenue alone is too spiky for a tile.
  const running = series.reduce<number[]>(
    (acc, point) => [...acc, (acc.at(-1) ?? 0) + point.revenue],
    [],
  );
  const collected = running.at(-1) ?? 0;
  const period = RANGE_LABEL[range].toLowerCase();

  return (
    <section
      aria-label="Monthly recurring revenue"
      className="relative isolate flex h-full min-h-[240px] flex-col overflow-hidden rounded-card bg-brand-gradient p-5 text-white shadow-brand sm:p-6"
    >
      <span
        className="absolute -top-20 -right-16 -z-10 size-64 rounded-full bg-white/10"
        aria-hidden
      />
      <Illustration
        name="coinsGrowth"
        size={104}
        eager
        float
        className="absolute top-14 right-2 -z-10 sm:right-5"
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-extrabold text-white/90">Monthly recurring revenue</p>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-extrabold">
          {change === null ? (
            'New'
          ) : (
            <>
              <Trend className="size-3.5" aria-hidden />
              {change > 0 ? '+' : ''}
              {change}%
            </>
          )}
        </span>
      </div>
      <div className="pr-24 sm:pr-32">
        <p className="mt-2 text-[30px] leading-none font-black tracking-tight sm:text-[44px]">
          <CountUp value={kpi.value} format={formatRupees} />
        </p>
        <p className="mt-2 text-sm font-bold text-white/90">
          vs {formatRupees(kpi.previous)} at the start of the period
        </p>
      </div>
      <div className="-mx-1 mt-auto h-24 pt-4 sm:h-28 lg:h-auto lg:min-h-24 lg:flex-1">
        <Sparkline
          values={running}
          label={`Revenue collected over the ${period}: ${formatInr(collected)}`}
        />
      </div>
      <p className="mt-1 text-xs font-bold text-white/85">
        {formatRupees(collected)} collected · {period}
      </p>
    </section>
  );
}

function AvatarStack({ users, total }: { users: AdminStatsDto['onlineUsers']; total: number }) {
  if (!total) return <span className="text-xs font-extrabold text-muted">No one right now</span>;
  const shown = users.slice(0, 4);
  const extra = total - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((u) => (
          <Avatar key={u.id} name={u.name} className="size-7 text-[10px] ring-2 ring-surface" />
        ))}
        {extra > 0 && (
          <span
            className="grid size-7 place-items-center rounded-full bg-surface-3 text-[10px] font-black text-muted ring-2 ring-surface"
            aria-hidden
          >
            +{extra}
          </span>
        )}
      </div>
      <span className="sr-only">
        {shown.map((u) => u.name).join(', ')}
        {extra > 0 ? ` and ${extra} more` : ''}
      </span>
    </div>
  );
}

// ---------- charts ----------

function RevenueCard({ data, range }: { data: AdminStatsDto; range: AdminRange }) {
  const empty = data.series.every((p) => !p.revenue && !p.newSubscriptions);
  return (
    <Card className="h-full">
      <CardHeader
        title="Revenue & new subscriptions"
        description={`${RANGE_LABEL[range]} · hover or tap the chart for details`}
      />
      {empty ? (
        <EmptyState
          illustration="coinsGrowth"
          size={110}
          title="No revenue in this period yet"
          description="Payments and new subscriptions show up here as soon as they happen."
        />
      ) : (
        <>
          <ul className="-mt-1 mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-extrabold text-muted">
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-[var(--chart-1)]" aria-hidden />
              Revenue
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-[var(--chart-2)]" aria-hidden />
              New subscriptions
            </li>
          </ul>
          <RevenueChart series={data.series} range={range} />
        </>
      )}
    </Card>
  );
}

// ---------- lists ----------

const recentColumns: Column<AdminSubscriptionRow>[] = [
  {
    key: 'customer',
    header: 'Customer',
    cell: (r) => <PersonCell name={r.user.name} email={r.user.email} />,
  },
  { key: 'plan', header: 'Plan', cell: (r) => <PlanPill slug={r.plan.slug} name={r.plan.name} /> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  {
    key: 'amount',
    header: 'Amount',
    cell: (r) => (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <b className="num">{formatInr(r.amountPaid)}</b>
        {r.changeType !== 'new' && <Badge>{CHANGE_LABEL[r.changeType]}</Badge>}
      </span>
    ),
  },
  {
    key: 'ends',
    header: 'Ends',
    hideBelow: 'md',
    cell: (r) => <span className="num whitespace-nowrap">{formatDate(r.endDate)}</span>,
  },
];

function RecentSubscriptions({ rows }: { rows: AdminSubscriptionRow[] }) {
  const navigate = useNavigate();
  return (
    <Card className="h-full">
      <CardHeader
        title="Recent subscriptions"
        description="The latest sign-ups, renewals and plan changes"
        action={<ExportCsvButton filters={{}} className="h-11 sm:h-9 sm:text-[13px]" />}
      />
      <ResponsiveTable
        rows={rows}
        columns={recentColumns}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/admin/users?user=${r.user.id}`)}
        cardTitle={(r) => <PersonCell name={r.user.name} email={r.user.email} />}
        empty={
          <EmptyState
            illustration="emptyBox"
            size={110}
            title="No subscriptions yet"
            description="New subscriptions appear here the moment a customer picks a plan."
          />
        }
      />
      {rows.length > 0 && (
        <Link
          to="/admin/subscriptions"
          className={cn(buttonVariants({ variant: 'ghost', size: 'md' }), 'mt-3 w-full')}
        >
          View all subscriptions <ArrowRight aria-hidden />
        </Link>
      )}
    </Card>
  );
}

function ExpiringSoon({ rows, total }: { rows: AdminSubscriptionRow[]; total: number }) {
  const [target, setTarget] = useState<AdminSubscriptionRow | null>(null);
  const [open, setOpen] = useState(false);
  const [extend] = useExtendSubscriptionMutation();
  const name = target ? firstName(target.user.name) : '';

  return (
    <Card className="h-full">
      <CardHeader
        title="Expiring soon"
        description="Plans ending in the next 7 days"
        action={
          total > 0 ? (
            <Badge tone="warning" className="num">
              {total}
            </Badge>
          ) : undefined
        }
      />
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((row) => {
            const days = calendarDaysUntil(row.endDate);
            return (
              <li key={row.id} className="flex items-center gap-3">
                <Avatar name={row.user.name} />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/admin/users?user=${row.user.id}`}
                    className="block truncate text-sm font-extrabold hover:text-brand-ink"
                  >
                    {row.user.name}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {row.plan.name} ·{' '}
                    <span className={cn(days <= 1 && 'font-extrabold text-danger-ink')}>
                      {endsLabel(row.endDate)}
                    </span>
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-11 shrink-0 sm:h-9"
                  aria-label={`Extend ${row.user.name}'s plan by 7 days`}
                  onClick={() => {
                    setTarget(row);
                    setOpen(true);
                  }}
                >
                  <CalendarPlus aria-hidden />
                  <span>
                    <span className="hidden sm:inline">Extend </span>+7 days
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          illustration="renewalCalendar"
          size={110}
          className="py-6"
          title="Nothing expires this week"
          description="Plans ending in the next 7 days will show up here, ready to extend."
        />
      )}
      {total > rows.length && (
        <Link
          to="/admin/subscriptions?status=active&sort=endDate"
          className={cn(buttonVariants({ variant: 'ghost', size: 'md' }), 'mt-3 w-full')}
        >
          View all {total} <ArrowRight aria-hidden />
        </Link>
      )}

      {target && (
        <ReasonDialog
          open={open}
          onOpenChange={setOpen}
          title={`Extend ${name}'s ${target.plan.name} plan by 7 days?`}
          description={`It will end on ${formatDate(previewEndDate(target.endDate, true, 7))} instead of ${formatDate(target.endDate)}. ${name} gets a notification with your reason.`}
          submitLabel="Extend by 7 days"
          placeholder="e.g. Goodwill extension while their renewal payment clears"
          onSubmit={async (reason) => {
            const result = await extend({ id: target.id, days: 7, reason }).unwrap();
            toast.success(`${name}'s plan now ends on ${formatDate(result.endDate)}.`);
          }}
        />
      )}
    </Card>
  );
}

function OnlineNow({ users, total }: { users: AdminStatsDto['onlineUsers']; total: number }) {
  return (
    <Card className="h-full">
      <CardHeader
        title="Online now"
        description="Active in the last 5 minutes · updates every 20 seconds"
        action={
          <Badge tone="success" className="gap-2">
            <LiveDot className="size-2" /> Live
          </Badge>
        }
      />
      {users.length ? (
        <ul className="-mx-2 space-y-0.5">
          {users.map((u) => (
            <li key={u.id}>
              <Link
                to={`/admin/users?user=${u.id}`}
                className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-2"
              >
                <PersonCell name={u.name} email={u.email} online className="flex-1" />
                <span className="shrink-0 text-xs text-subtle">{formatRelative(u.lastSeenAt)}</span>
              </Link>
            </li>
          ))}
          {total > users.length && (
            <li className="px-2 pt-2 text-xs font-bold text-muted">
              and {plural(total - users.length, 'more person', 'more people')}
            </li>
          )}
        </ul>
      ) : (
        <EmptyState
          illustration="quietBell"
          size={100}
          className="py-6"
          title="No one's online right now"
          description="People appear here within seconds of using PlanPilot."
        />
      )}
    </Card>
  );
}

function RecentActivity() {
  const { data, isLoading, isError, error, refetch, isFetching } = useActivityQuery();
  return (
    <Card className="h-full">
      <CardHeader
        title="Recent activity"
        description="Sign-ups, plan changes and admin actions"
        action={
          <Link
            to="/admin/activity"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-11 sm:h-9')}
          >
            View all <ArrowRight aria-hidden />
          </Link>
        }
      />
      {isLoading ? (
        <ActivitySkeleton rows={4} />
      ) : isError && !data ? (
        <ErrorState
          error={error}
          onRetry={() => void refetch()}
          retrying={isFetching}
          className="py-6"
        />
      ) : data?.length ? (
        <ul className="space-y-4">
          {data.slice(0, 6).map((a) => (
            <li key={a.id}>
              <ActivityItem activity={a} compact />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          illustration="quietBell"
          size={100}
          className="py-6"
          title="No activity yet"
          description="Sign-ups, payments and admin actions will be listed here."
        />
      )}
    </Card>
  );
}

// ---------- loading ----------

function OverviewSkeleton() {
  return (
    <div aria-busy aria-label="Loading the overview">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Skeleton className="col-span-2 h-[240px] rounded-card lg:row-span-2 lg:h-auto" />
        {Array.from({ length: 8 }, (_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="mt-2 h-3.5 w-40" />
          <Skeleton className="mt-6 h-[240px] w-full sm:h-[290px]" />
        </Card>
        <Card>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-2 h-3.5 w-48 max-w-full" />
          <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
            <Skeleton className="size-[168px] shrink-0 rounded-full" />
            <div className="w-full space-y-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
          <Skeleton className="mt-6 h-3 w-full rounded-full" />
        </Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <Skeleton className="mb-5 h-5 w-48" />
          <div className="space-y-2.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        </Card>
        <Card>
          <Skeleton className="mb-5 h-5 w-36" />
          <ActivitySkeleton rows={3} />
        </Card>
      </div>
    </div>
  );
}

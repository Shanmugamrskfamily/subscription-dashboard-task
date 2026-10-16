import type { MySubscriptionDto, PaymentDto, PlanDto } from '@planpilot/shared';
import { ArrowRight, CalendarDays, Check, FolderPlus, Rocket, XCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorOf } from '../../api/errors';
import { useAppSelector } from '../../app/store';
import { Page } from '../../components/layout/Page';
import { CHANGE_LABEL, PaymentBadge, PlanPill, StatusBadge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Card, CardHeader } from '../../components/ui/card';
import { ResponsiveTable } from '../../components/ui/data';
import type { Column } from '../../components/ui/data';
import { Modal } from '../../components/ui/dialog';
import { EmptyState, Illustration, ProgressBar, Skeleton } from '../../components/ui/feedback';
import { cn } from '../../lib/cn';
import { formatDate, formatInr, plural } from '../../lib/format';
import { useCheckout } from '../billing/CheckoutFlow';
import {
  useCancelSubscriptionMutation,
  useMyPaymentsQuery,
  useMySubscriptionQuery,
  usePlansQuery,
} from './subscriptionApi';

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
};

/** Days left as an animated ring (drawn instantly for reduced-motion users). */
function DaysRing({ daysLeft, totalDays }: { daysLeft: number; totalDays: number }) {
  const reduce = useReducedMotion();
  const r = 17;
  const circumference = 2 * Math.PI * r;
  const fraction = Math.max(0, Math.min(1, daysLeft / Math.max(1, totalDays)));
  const tone = daysLeft <= 3 ? 'stroke-[var(--warning)]' : '';
  return (
    <div
      className="relative size-32 shrink-0"
      role="img"
      aria-label={`${daysLeft} of ${totalDays} days left`}
    >
      <svg viewBox="0 0 42 42" className="size-32 -rotate-90">
        <defs>
          <linearGradient id="ring-gradient" x1="0" x2="1">
            <stop offset="0" stopColor="#4F46E5" />
            <stop offset="1" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
        <circle cx="21" cy="21" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="5" />
        <motion.circle
          cx="21"
          cy="21"
          r={r}
          fill="none"
          stroke="url(#ring-gradient)"
          className={tone}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduce ? circumference * (1 - fraction) : circumference }}
          animate={{ strokeDashoffset: circumference * (1 - fraction) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="num text-3xl leading-none font-black">{daysLeft}</p>
          <p className="mt-1 text-xs font-extrabold text-muted">
            {daysLeft === 1 ? 'day left' : 'days left'}
          </p>
        </div>
      </div>
    </div>
  );
}

function Welcome({ mine, nextPlan }: { mine: MySubscriptionDto; nextPlan: PlanDto | undefined }) {
  const user = useAppSelector((s) => s.auth.user);
  const { start } = useCheckout();
  const sub = mine.subscription;
  return (
    <Card className="relative grid overflow-hidden p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
      <div className="relative z-10">
        <p className="font-extrabold text-muted">{greeting()},</p>
        <h1 className="text-[28px] leading-tight font-black tracking-tight sm:text-[34px]">
          {user?.name} 👋
        </h1>
        <p className="mt-2 max-w-xl text-muted">
          {sub ? (
            <>
              Your <b className="text-ink">{sub.plan.name}</b> plan{' '}
              {sub.daysLeft <= 3 ? 'ends' : 'renews'} in {plural(sub.daysLeft, 'day')}. You've used{' '}
              {mine.usage.projects} of {mine.limits.projects ?? 'unlimited'} projects.
            </>
          ) : mine.status === 'none' ? (
            'Welcome to PlanPilot! Pick a plan to unlock projects and team seats.'
          ) : (
            'Your plan has ended, so your workspace is read-only. Renew to pick up where you left off.'
          )}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {sub && nextPlan ? (
            <Button onClick={() => start(nextPlan)}>
              <Rocket /> Upgrade to {nextPlan.name}
            </Button>
          ) : !sub ? (
            <Link to="/plans" className={buttonVariants()}>
              {mine.status === 'none' ? 'Choose a plan' : 'Renew a plan'} <ArrowRight />
            </Link>
          ) : null}
          <Link to="/workspace" className={buttonVariants({ variant: 'secondary' })}>
            <FolderPlus /> {sub ? 'New project' : 'Open workspace'}
          </Link>
        </div>
      </div>
      <div
        className="relative order-first -mb-2 flex h-36 justify-end gap-2 lg:order-none lg:h-44"
        aria-hidden
      >
        <div className="motion-safe:animate-float">
          <Illustration name="renewalCalendar" size={140} eager />
        </div>
        <div className="mt-8 motion-safe:animate-float" style={{ animationDelay: '-2s' }}>
          <Illustration name="coinsGrowth" size={128} eager />
        </div>
      </div>
    </Card>
  );
}

function PlanCard({ mine }: { mine: MySubscriptionDto }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [cancel, { isLoading }] = useCancelSubscriptionMutation();
  const sub = mine.subscription;
  const last = mine.lastSubscription;

  if (!sub) {
    return (
      <Card className="flex flex-col">
        <CardHeader title="Current plan" action={<StatusBadge status={mine.status} />} />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Illustration name={mine.status === 'none' ? 'emptyBox' : 'accessExpired'} size={110} />
          <p className="mt-3 font-extrabold">
            {mine.status === 'none'
              ? 'No plan yet'
              : `${last?.plan.name} ${mine.status === 'cancelled' ? 'was cancelled' : 'has expired'}`}
          </p>
          <p className="mt-1 text-sm text-muted">
            {last
              ? `Ended on ${formatDate(last.cancelledAt ?? last.endDate)}`
              : 'Plans start at ₹299 for 30 days.'}
          </p>
          <Button className="mt-4" onClick={() => navigate('/plans')}>
            {mine.status === 'none' ? 'See plans' : 'Renew'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Current plan" action={<StatusBadge status="active" />} />
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <DaysRing daysLeft={sub.daysLeft} totalDays={sub.totalDays} />
        <dl className="w-full space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <PlanPill slug={sub.plan.slug} name={sub.plan.name} />
            <span className="num font-black">{formatInr(sub.plan.price)}</span>
            <span className="text-muted">/ {sub.plan.durationDays} days</span>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Started</dt>
            <dd className="font-extrabold">{formatDate(sub.startDate)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Ends</dt>
            <dd className="font-extrabold">{formatDate(sub.endDate)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">How it started</dt>
            <dd className="font-extrabold">{CHANGE_LABEL[sub.changeType]}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-5 flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate('/plans')}>
          Change plan
        </Button>
        <Button variant="danger-ghost" size="sm" onClick={() => setConfirm(true)}>
          <XCircle /> Cancel
        </Button>
      </div>
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title={`Cancel your ${sub.plan.name} plan?`}
        description="Your plan ends right away and your workspace becomes read-only. Nothing is deleted, and you can renew at any time."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Keep my plan
            </Button>
            <Button
              variant="danger"
              loading={isLoading}
              onClick={async () => {
                try {
                  await cancel().unwrap();
                  toast.success('Your plan was cancelled.');
                  setConfirm(false);
                } catch (e) {
                  toast.error(errorOf(e)?.message ?? 'Could not cancel the plan.');
                }
              }}
            >
              Cancel plan
            </Button>
          </>
        }
      >
        <div className="flex justify-center">
          <Illustration name="accessExpired" size={110} eager />
        </div>
      </Modal>
    </Card>
  );
}

function UsageCard({ mine }: { mine: MySubscriptionDto }) {
  const rows = [
    { label: 'Projects', used: mine.usage.projects, limit: mine.limits.projects },
    { label: 'Team members', used: mine.usage.teamMembers, limit: mine.limits.teamMembers },
  ];
  return (
    <Card>
      <CardHeader
        title="Usage"
        description={
          mine.subscription
            ? `Limits from your ${mine.subscription.plan.name} plan`
            : 'No active plan: read-only'
        }
      />
      <div className="space-y-5">
        {rows.map((row) => {
          const pct = row.limit ? row.used / row.limit : 0;
          return (
            <div key={row.label}>
              <div className="flex justify-between text-sm font-extrabold">
                <span>{row.label}</span>
                <span className="num">
                  {row.used} / {row.limit === null ? '∞' : row.limit}
                </span>
              </div>
              <ProgressBar
                value={row.used}
                max={row.limit}
                className="mt-2"
                label={`${row.label} used`}
              />
              {row.limit !== null && row.limit > 0 && pct >= 0.8 && (
                <p
                  className={cn(
                    'mt-1.5 text-xs font-extrabold',
                    pct >= 1 ? 'text-danger-ink' : 'text-warning-ink',
                  )}
                >
                  {pct >= 1
                    ? 'Limit reached: upgrade for more room'
                    : `${row.limit - row.used} left: consider upgrading`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function UpsellCard({ nextPlan }: { nextPlan: PlanDto }) {
  const { start } = useCheckout();
  return (
    <Card className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left lg:flex-col lg:text-center xl:flex-row xl:text-left">
      <Illustration name="limitReached" size={110} />
      <div>
        <h2 className="text-lg font-extrabold">Need more room?</h2>
        <p className="mt-1 text-sm text-muted">
          {nextPlan.name} gives{' '}
          {nextPlan.limits.projects === null ? 'unlimited' : nextPlan.limits.projects} projects and{' '}
          {nextPlan.limits.teamMembers ?? 'unlimited'} team members. Your unused days count as
          credit.
        </p>
        <Button size="sm" className="mt-3" onClick={() => start(nextPlan)}>
          See the price
        </Button>
      </div>
    </Card>
  );
}

const paymentColumns: Column<PaymentDto>[] = [
  {
    key: 'date',
    header: 'Date',
    cell: (p) => <span className="num">{formatDate(p.createdAt)}</span>,
  },
  { key: 'plan', header: 'Plan', cell: (p) => <PlanPill slug={p.plan.slug} name={p.plan.name} /> },
  { key: 'type', header: 'Type', cell: (p) => CHANGE_LABEL[p.changeType], hideBelow: 'md' },
  {
    key: 'amount',
    header: 'Amount',
    cell: (p) => <b className="num">{formatInr(p.amount)}</b>,
    align: 'right',
  },
  {
    key: 'id',
    header: 'Payment ID',
    cell: (p) => <span className="num text-xs text-muted">{p.razorpayPaymentId ?? '—'}</span>,
    hideBelow: 'lg',
  },
  { key: 'status', header: 'Status', cell: (p) => <PaymentBadge status={p.status} /> },
];

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <Skeleton className="h-52 w-full rounded-card" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
      <Skeleton className="h-56 w-full rounded-card" />
    </div>
  );
}

export default function DashboardPage() {
  const { data: mine, isLoading, isError, error, refetch } = useMySubscriptionQuery();
  const payments = useMyPaymentsQuery();
  const { data: plans } = usePlansQuery();

  const current = mine?.subscription?.plan;
  const nextPlan = current
    ? plans
        ?.filter((p) => p.tier > current.tier && p.durationDays === current.durationDays)
        .sort((a, b) => a.tier - b.tier)[0]
    : undefined;

  return (
    <Page title="Dashboard">
      {isLoading ? (
        <DashboardSkeleton />
      ) : isError || !mine ? (
        <Card>
          <EmptyState
            illustration="brokenGear"
            title="We couldn't load your dashboard"
            description={errorOf(error)?.message}
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        </Card>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.07 } } }}
          className="space-y-5"
        >
          {[
            <Welcome key="welcome" mine={mine} nextPlan={nextPlan} />,
            <div key="grid" className="grid gap-5 lg:grid-cols-3">
              <PlanCard mine={mine} />
              <UsageCard mine={mine} />
              {nextPlan ? (
                <UpsellCard nextPlan={nextPlan} />
              ) : (
                <Card>
                  <CardHeader title="Included in your plan" />
                  {current ? (
                    <ul className="space-y-2.5 text-sm">
                      {current.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5">
                          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {f}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">
                      Pick a plan to unlock projects, team seats and analytics.
                    </p>
                  )}
                </Card>
              )}
            </div>,
            <Card key="billing">
              <CardHeader
                title="Billing history"
                description="Payments run through Razorpay in test mode"
                action={
                  <span className="hidden items-center gap-1.5 text-xs font-extrabold text-muted sm:inline-flex">
                    <CalendarDays className="size-4" aria-hidden /> Last 50
                  </span>
                }
              />
              <ResponsiveTable
                rows={payments.data ?? []}
                columns={paymentColumns}
                rowKey={(p) => p.id}
                loading={payments.isLoading}
                empty={
                  <EmptyState
                    illustration="emptyBox"
                    size={110}
                    title="No payments yet"
                    description="Your receipts will appear here after your first plan."
                  />
                }
              />
            </Card>,
          ].map((child, i) => (
            <motion.div
              key={i}
              variants={{
                hidden: { opacity: 0, y: 14 },
                show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
              }}
            >
              {child}
            </motion.div>
          ))}
        </motion.div>
      )}
    </Page>
  );
}

import type { MySubscriptionDto, PlanDto } from '@planpilot/shared';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Crown,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { errorOf } from '../../api/errors';
import { useAppSelector } from '../../app/store';
import { Page } from '../../components/layout/Page';
import { Badge, PlanPill } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { EmptyState, Illustration, Skeleton } from '../../components/ui/feedback';
import { cn } from '../../lib/cn';
import { formatDate, formatInr, plural } from '../../lib/format';
import { useCheckout } from '../billing/CheckoutFlow';
import {
  useMySubscriptionQuery,
  usePlansQuery,
  usePreviewQuery,
} from '../subscription/subscriptionApi';

const limitText = (value: number | null, word: string) =>
  value === null ? `Unlimited ${word}s` : plural(value, word);
const period = (days: number) => (days >= 365 ? '/ year' : `/ ${days} days`);

function PlanCta({ plan, mine }: { plan: PlanDto; mine: MySubscriptionDto | undefined }) {
  const { status, user } = useAppSelector((s) => s.auth);
  const { start, busyPlanId } = useCheckout();
  const isCurrent = mine?.subscription?.plan.id === plan.id;
  const canPreview =
    status === 'authenticated' && user?.role === 'user' && !isCurrent && Boolean(mine);
  const { data: quote } = usePreviewQuery(plan.id, { skip: !canPreview });

  if (status !== 'authenticated') {
    return (
      <Link
        to="/register"
        className={cn(
          buttonVariants({ variant: plan.isPopular ? 'primary' : 'outline' }),
          'w-full',
        )}
      >
        Get started
      </Link>
    );
  }
  if (user?.role === 'admin') {
    return (
      <Link to="/admin/plans" className={cn(buttonVariants({ variant: 'secondary' }), 'w-full')}>
        Manage in admin
      </Link>
    );
  }
  if (isCurrent) {
    return (
      <Button variant="secondary" className="w-full" disabled>
        Current plan · {plural(mine?.subscription?.daysLeft ?? 0, 'day')} left
      </Button>
    );
  }
  const type = quote?.changeType;
  const amount = quote
    ? quote.amountDue > 0
      ? `pay ${formatInr(quote.amountDue)}`
      : '₹0 today'
    : formatInr(plan.price);
  const label =
    type === 'upgrade' ? (
      <>
        <ArrowUpRight /> Upgrade · {amount}
      </>
    ) : type === 'downgrade' ? (
      <>
        <ArrowDownRight /> Switch · {amount}
      </>
    ) : type === 'renewal' ? (
      <>
        <RefreshCw /> Renew · {amount}
      </>
    ) : (
      <>Subscribe · {amount}</>
    );
  return (
    <Button
      variant={plan.isPopular || type === 'upgrade' ? 'primary' : 'outline'}
      className="w-full"
      loading={busyPlanId === plan.id}
      onClick={() => start(plan)}
    >
      {label}
    </Button>
  );
}

function PlanCard({
  plan,
  mine,
  index,
}: {
  plan: PlanDto;
  mine: MySubscriptionDto | undefined;
  index: number;
}) {
  const isCurrent = mine?.subscription?.plan.id === plan.id;
  return (
    <motion.li
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.07, ease: 'easeOut' }}
      className="relative flex"
    >
      {plan.isPopular && (
        <span className="absolute -top-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-brand-gradient px-3 py-1 text-xs font-black whitespace-nowrap text-white shadow-brand">
          <Crown className="size-3.5" aria-hidden /> Most popular
        </span>
      )}
      <Card
        interactive
        className={cn(
          'flex w-full flex-col gap-4 p-6',
          plan.isPopular && 'border-transparent ring-2 ring-brand',
          isCurrent && 'ring-2 ring-success',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <PlanPill slug={plan.slug} name={plan.name} />
          {isCurrent ? (
            <Badge tone="success" dot>
              Your plan
            </Badge>
          ) : plan.durationDays >= 365 ? (
            <Badge tone="warning">Save about 17%</Badge>
          ) : null}
        </div>
        <div>
          <span className="num text-4xl font-black tracking-tight">{formatInr(plan.price)}</span>
          <span className="ml-1 text-sm text-muted">{period(plan.durationDays)}</span>
        </div>
        <p className="text-sm text-muted">{plan.description}</p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-extrabold text-muted">
            {limitText(plan.limits.projects, 'project')}
          </span>
          <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-extrabold text-muted">
            {limitText(plan.limits.teamMembers, 'team member')}
          </span>
        </div>
        <ul className="space-y-2.5 text-sm">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-2">
          <PlanCta plan={plan} mine={mine} />
        </div>
      </Card>
    </motion.li>
  );
}

const FAQ = [
  {
    q: 'What happens to my unused days when I change plans?',
    a: 'They become credit. Upgrading charges only the difference; downgrading turns leftover credit into bonus days on the new plan. You always see the exact amount before paying.',
  },
  {
    q: 'Is my payment safe?',
    a: 'Payments go through Razorpay (test mode in this demo). PlanPilot never sees card details, and every payment is verified on the server with Razorpay’s signature before your plan changes.',
  },
  {
    q: 'What if my plan expires?',
    a: 'You can still sign in and see everything. Your workspace becomes read-only until you renew, and nothing is deleted.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, from your dashboard. Cancelling ends the plan straight away and your workspace becomes read-only.',
  },
];

export default function PlansPage() {
  const { status, user } = useAppSelector((s) => s.auth);
  const isCustomer = status === 'authenticated' && user?.role === 'user';
  const plans = usePlansQuery();
  const { data: mine } = useMySubscriptionQuery(undefined, { skip: !isCustomer });

  return (
    <Page title="Plans and pricing">
      <meta
        name="description"
        content="Compare PlanPilot plans in INR: Starter, Pro, Business and Pro Annual. Upgrade or downgrade anytime with fair proration."
      />
      <section className="grid items-center gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-black text-brand-ink">
            <Sparkles className="size-3.5" aria-hidden /> Prices in INR · change plans anytime
          </span>
          <h1 className="mt-3 text-[34px] leading-[1.08] font-black tracking-tight text-balance sm:text-5xl">
            Pick the plan that fits your team
          </h1>
          <p className="mt-3 max-w-xl text-[17px] text-muted">
            Upgrade or downgrade whenever you like: unused days become credit on your new plan, so
            you never pay twice.
          </p>
          {isCustomer && mine && (
            <div className="mt-5 inline-flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm shadow-card">
              {mine.subscription ? (
                <>
                  You're on{' '}
                  <PlanPill slug={mine.subscription.plan.slug} name={mine.subscription.plan.name} />{' '}
                  until <b>{formatDate(mine.subscription.endDate)}</b>
                </>
              ) : (
                <>You don't have an active plan yet. Pick one below to unlock your workspace.</>
              )}
            </div>
          )}
        </div>
        <div className="relative mx-auto hidden h-60 w-full max-w-md sm:block" aria-hidden>
          <div className="absolute top-0 left-[34%] motion-safe:animate-float">
            <Illustration name="rocket" size={190} eager />
          </div>
          <div
            className="absolute top-[45%] left-[2%] motion-safe:animate-float"
            style={{ animationDelay: '-2s' }}
          >
            <Illustration name="coinsGrowth" size={140} eager />
          </div>
          <div
            className="absolute top-[48%] right-[2%] motion-safe:animate-float"
            style={{ animationDelay: '-4s' }}
          >
            <Illustration name="crownBadge" size={118} eager />
          </div>
        </div>
      </section>

      <section aria-label="Plans" className="mt-10">
        {plans.isLoading ? (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i}>
                <Card className="space-y-4 p-6">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-11 w-full" />
                </Card>
              </li>
            ))}
          </ul>
        ) : plans.isError ? (
          <Card>
            <EmptyState
              illustration="brokenGear"
              title="We couldn't load the plans"
              description={errorOf(plans.error)?.message}
              action={<Button onClick={() => void plans.refetch()}>Try again</Button>}
            />
          </Card>
        ) : plans.data?.length ? (
          <ul className="grid gap-5 pt-3 sm:grid-cols-2 xl:grid-cols-4">
            {plans.data.map((plan, i) => (
              <PlanCard key={plan.id} plan={plan} mine={mine} index={i} />
            ))}
          </ul>
        ) : (
          <Card>
            <EmptyState
              illustration="emptyBox"
              title="No plans are available right now"
              description="Please check back soon."
            />
          </Card>
        )}
      </section>

      <section className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className="flex items-center gap-4">
          <Illustration name="paymentSuccess" size={96} />
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <ShieldCheck className="size-5 text-success" aria-hidden /> Secure test payments
            </h2>
            <p className="mt-1 text-sm text-muted">
              Checkout runs in Razorpay test mode. Try UPI ID{' '}
              <b className="text-ink">success@razorpay</b> or a test card from Razorpay's checkout.
              No real money moves.
            </p>
          </div>
        </Card>
        <div>
          <h2 className="text-lg font-extrabold">Questions</h2>
          <div className="mt-3 space-y-2">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-line bg-surface px-4 py-3 shadow-card"
              >
                <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 font-extrabold">
                  {item.q}
                  <span
                    className="text-muted transition-transform group-open:rotate-45"
                    aria-hidden
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </Page>
  );
}

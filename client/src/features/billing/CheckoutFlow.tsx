import type { CheckoutOrder, PlanDto, ProrationQuote, SubscriptionDto } from '@planpilot/shared';
import { ArrowRight, CreditCard, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorOf } from '../../api/errors';
import type { AppError } from '../../api/errors';
import { useAppSelector } from '../../app/store';
import { CHANGE_LABEL, PlanPill } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/dialog';
import { Illustration, Spinner } from '../../components/ui/feedback';
import { formatDate, formatInr, plural } from '../../lib/format';
import {
  useLazyPreviewQuery,
  usePaymentFailedMutation,
  useSubscribeMutation,
  useVerifyPaymentMutation,
} from '../subscription/subscriptionApi';
import { openRazorpay } from './razorpay';

type Step =
  | { name: 'idle' }
  | { name: 'loading'; plan: PlanDto }
  | { name: 'preview'; plan: PlanDto; quote: ProrationQuote }
  | { name: 'simulated'; plan: PlanDto; order: CheckoutOrder }
  | { name: 'verifying'; plan: PlanDto }
  /** Razorpay's own window is open: ours must stay closed so it can take focus and input. */
  | { name: 'external'; plan: PlanDto }
  | { name: 'success'; subscription: SubscriptionDto; paid: number }
  | { name: 'failed'; plan: PlanDto; reason: string };

interface CheckoutContext {
  start: (plan: PlanDto) => void;
  busyPlanId: string | null;
}

const Ctx = createContext<CheckoutContext | null>(null);

export function useCheckout() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCheckout must be used inside CheckoutProvider');
  return ctx;
}

const HEADLINE: Record<ProrationQuote['changeType'], string> = {
  new: 'Subscribe to',
  renewal: 'Renew with',
  upgrade: 'Upgrade to',
  downgrade: 'Switch to',
  admin_assign: 'Switch to',
};

/**
 * The whole purchase flow in one place:
 * preview (server-calculated proration) → confirm → Razorpay test checkout or the
 * simulated checkout → server verifies the signature → success or failure screen.
 */
export function CheckoutProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const signedIn = useAppSelector((s) => s.auth.status === 'authenticated');
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [loadPreview] = useLazyPreviewQuery();
  const [subscribe, { isLoading: subscribing }] = useSubscribeMutation();
  const [verify] = useVerifyPaymentMutation();
  const [reportFailure] = usePaymentFailedMutation();

  const fail = useCallback((plan: PlanDto, error: AppError | null, fallback: string) => {
    setStep({ name: 'failed', plan, reason: error?.message ?? fallback });
  }, []);

  const start = useCallback(
    async (plan: PlanDto) => {
      if (!signedIn) {
        navigate(`/login?next=${encodeURIComponent('/plans')}`);
        return;
      }
      setStep({ name: 'loading', plan });
      try {
        const quote = await loadPreview(plan.id).unwrap();
        setStep({ name: 'preview', plan, quote });
      } catch (e) {
        setStep({ name: 'idle' });
        toast.error(errorOf(e)?.message ?? 'Could not prepare this plan. Please try again.');
      }
    },
    [signedIn, loadPreview, navigate],
  );

  const finishPayment = async (
    plan: PlanDto,
    order: CheckoutOrder,
    response: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    },
  ) => {
    setStep({ name: 'verifying', plan });
    try {
      const result = await verify(response).unwrap();
      setStep({ name: 'success', subscription: result.subscription, paid: order.amount });
    } catch (e) {
      fail(plan, errorOf(e), 'We could not verify the payment.');
    }
  };

  const confirm = async () => {
    if (step.name !== 'preview') return;
    const { plan } = step;
    try {
      const result = await subscribe(plan.id).unwrap();
      if (result.activated) {
        setStep({ name: 'success', subscription: result.subscription, paid: 0 });
        return;
      }
      const order = result.checkout;
      if (order.mode === 'simulated') {
        setStep({ name: 'simulated', plan, order });
        return;
      }
      setStep({ name: 'external', plan });
      const outcome = await openRazorpay(order);
      if (outcome.kind === 'paid') {
        await finishPayment(plan, order, outcome.response);
      } else {
        const reason =
          outcome.kind === 'failed' ? outcome.reason : 'Checkout was closed before paying.';
        void reportFailure({ orderId: order.orderId, reason });
        if (outcome.kind === 'failed') setStep({ name: 'failed', plan, reason });
        else {
          setStep({ name: 'idle' });
          toast.info('Checkout closed. Nothing was charged.');
        }
      }
    } catch (e) {
      fail(plan, errorOf(e), 'Could not start the checkout.');
    }
  };

  const close = () => setStep({ name: 'idle' });
  const value = useMemo(
    () => ({
      start: (p: PlanDto) => void start(p),
      busyPlanId: step.name === 'loading' ? step.plan.id : null,
    }),
    [start, step],
  );

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* 1. Preview: exactly what the server will charge, before anything happens. */}
      <Modal
        open={step.name === 'preview'}
        onOpenChange={(open) => !open && close()}
        title={
          step.name === 'preview' ? `${HEADLINE[step.quote.changeType]} ${step.plan.name}` : ''
        }
        description="Review the details. The amount is calculated on the server."
        footer={
          <>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => void confirm()} loading={subscribing}>
              {step.name === 'preview' && step.quote.requiresPayment ? (
                <>
                  <LockKeyhole /> Pay {formatInr(step.quote.amountDue)}
                </>
              ) : (
                <>
                  Confirm switch <ArrowRight />
                </>
              )}
            </Button>
          </>
        }
      >
        {step.name === 'preview' && <QuoteBreakdown quote={step.quote} />}
      </Modal>

      {/* 2a. Simulated checkout (no Razorpay keys configured). */}
      <Modal
        open={step.name === 'simulated'}
        onOpenChange={(open) => {
          if (!open && step.name === 'simulated') {
            void reportFailure({
              orderId: step.order.orderId,
              reason: 'Checkout was closed before paying.',
            });
            close();
            toast.info('Checkout closed. Nothing was charged.');
          }
        }}
        title="Test checkout"
        description="Payments run in test mode: no real money moves."
      >
        {step.name === 'simulated' && (
          <SimulatedCheckout
            order={step.order}
            onPay={() => {
              const sim = step.order.simulation;
              if (!sim) return;
              void finishPayment(step.plan, step.order, {
                razorpay_order_id: step.order.orderId,
                razorpay_payment_id: sim.paymentId,
                razorpay_signature: sim.signature,
              });
            }}
            onFail={() => {
              void reportFailure({ orderId: step.order.orderId, reason: 'Card declined (test)' });
              setStep({
                name: 'failed',
                plan: step.plan,
                reason: 'Your bank declined the test payment. Nothing was charged.',
              });
            }}
          />
        )}
      </Modal>

      {/* 2b. Waiting for checkout or verification. */}
      <Modal
        open={step.name === 'verifying' || step.name === 'loading'}
        onOpenChange={() => undefined}
        dismissible={false}
        title="One moment…"
      >
        <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
          <Spinner className="size-8" />
          <p className="text-sm text-muted">
            {step.name === 'loading'
              ? 'Preparing your plan details'
              : 'Confirming your payment securely'}
          </p>
        </div>
      </Modal>

      {/* 3. Result */}
      <Modal
        open={step.name === 'success'}
        onOpenChange={(open) => !open && close()}
        title="You're all set!"
      >
        {step.name === 'success' && (
          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            >
              <Illustration name="paymentSuccess" size={150} eager />
            </motion.div>
            <p className="mt-3 text-lg font-extrabold">
              {step.subscription.plan.name} is active until {formatDate(step.subscription.endDate)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {step.paid > 0
                ? `${formatInr(step.paid)} paid. The receipt is in your billing history.`
                : 'Your unused credit covered this change. Nothing to pay.'}
            </p>
            <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  close();
                  navigate('/workspace');
                }}
              >
                Open workspace
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  close();
                  navigate('/dashboard');
                }}
              >
                Go to dashboard <ArrowRight />
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={step.name === 'failed'}
        onOpenChange={(open) => !open && close()}
        title="Payment didn't go through"
      >
        {step.name === 'failed' && (
          <div className="flex flex-col items-center text-center">
            <Illustration name="paymentFailed" size={140} eager />
            <p className="mt-3 text-sm text-muted">{step.reason}</p>
            <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={close}>
                Not now
              </Button>
              <Button className="flex-1" onClick={() => void start(step.plan)}>
                Try again
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Ctx.Provider>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-2 ${strong ? 'text-base font-black' : 'text-sm'}`}
    >
      <dt className={strong ? '' : 'text-muted'}>{label}</dt>
      <dd className="num text-right font-extrabold">{value}</dd>
    </div>
  );
}

export function QuoteBreakdown({ quote }: { quote: ProrationQuote }) {
  return (
    <div>
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-extrabold">
            {CHANGE_LABEL[quote.changeType]}
            {quote.currentPlan && (
              <span className="font-bold text-muted">
                {' '}
                from <PlanPill slug={quote.currentPlan.slug} name={quote.currentPlan.name} />
              </span>
            )}
          </p>
          <p className="text-muted">Starts now and runs until {formatDate(quote.endDate)}.</p>
        </div>
      </div>
      <dl className="mt-3 divide-y divide-line">
        <Row
          label={`${quote.plan.name} · ${plural(quote.plan.durationDays, 'day')}`}
          value={formatInr(quote.price)}
        />
        {quote.credit > 0 && (
          <Row
            label="Credit for unused days"
            value={`− ${formatInr(Math.min(quote.credit, quote.price))}`}
          />
        )}
        {quote.bonusDays > 0 && (
          <Row
            label="Leftover credit becomes"
            value={`+ ${plural(quote.bonusDays, 'bonus day')}`}
          />
        )}
        <Row label="Due today" value={formatInr(quote.amountDue)} strong />
      </dl>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted">
        <ShieldCheck className="size-4 shrink-0 text-success-ink" aria-hidden />
        Paid through Razorpay (test mode). We never see or store card details.
      </p>
    </div>
  );
}

function SimulatedCheckout({
  order,
  onPay,
  onFail,
}: {
  order: CheckoutOrder;
  onPay: () => void;
  onFail: () => void;
}) {
  return (
    <div>
      <div className="rounded-2xl bg-brand-gradient p-5 text-white shadow-brand">
        <div className="flex items-center justify-between">
          <span className="text-sm font-extrabold opacity-90">PlanPilot · {order.planName}</span>
          <CreditCard className="size-6 opacity-90" aria-hidden />
        </div>
        <p className="num mt-4 text-3xl font-black">{formatInr(order.amount)}</p>
        <p className="mt-1 text-xs opacity-80">Order {order.orderId}</p>
      </div>
      <p className="mt-4 text-sm text-muted">
        Razorpay keys aren't configured on this server, so this built-in test checkout stands in.
        The server still verifies a signed payment exactly as it would for Razorpay.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Button size="lg" onClick={onPay}>
          <LockKeyhole /> Pay {formatInr(order.amount)} (test)
        </Button>
        <Button variant="danger-ghost" onClick={onFail}>
          Simulate a declined payment
        </Button>
      </div>
    </div>
  );
}

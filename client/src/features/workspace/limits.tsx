import { ERROR_CODES } from '@planpilot/shared';
import type { LimitKey, MySubscriptionDto, PlanDto } from '@planpilot/shared';
import { ArrowRight, Rocket } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { AppError } from '../../api/errors';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/dialog';
import { Illustration, Skeleton } from '../../components/ui/feedback';
import { plural } from '../../lib/format';
import { usePlansQuery } from '../subscription/subscriptionApi';

export const NOUNS: Record<LimitKey, { title: string; one: string; many: string }> = {
  projects: { title: 'Projects', one: 'project', many: 'projects' },
  teamMembers: { title: 'Team members', one: 'team member', many: 'team members' },
};

export interface Usage {
  used: number;
  /** `null` means unlimited. */
  limit: number | null;
  /** Slots still free, or `null` when unlimited. */
  left: number | null;
}

export function usageOf(sub: MySubscriptionDto | undefined, key: LimitKey): Usage | null {
  if (!sub) return null;
  const used = sub.usage[key];
  const limit = sub.limits[key];
  return { used, limit, left: limit === null ? null : Math.max(0, limit - used) };
}

/** Why an add or edit can't go ahead: a full plan, or no active plan at all. */
export type Blocker =
  | { kind: 'limit'; key: LimitKey; limit: number; used: number; plan: string }
  | { kind: 'readOnly' };

/** Reads the server's PLAN_LIMIT_REACHED / READ_ONLY answers; anything else is a normal error. */
export function blockerFrom(error: AppError | null): Blocker | null {
  if (error?.code === ERROR_CODES.READ_ONLY) return { kind: 'readOnly' };
  if (error?.code !== ERROR_CODES.PLAN_LIMIT_REACHED) return null;
  const { key, limit, used, plan } = error.meta;
  const limitNumber = typeof limit === 'number' ? limit : 0;
  return {
    kind: 'limit',
    key: key === 'teamMembers' ? 'teamMembers' : 'projects',
    limit: limitNumber,
    used: typeof used === 'number' ? used : limitNumber,
    plan: typeof plan === 'string' ? plan : 'current',
  };
}

const amount = (key: LimitKey, limit: number | null) =>
  limit === null ? `Unlimited ${NOUNS[key].many}` : plural(limit, NOUNS[key].one, NOUNS[key].many);

/** The cheapest plan that gives more room for this limit. */
function roomierPlan(plans: PlanDto[] | undefined, key: LimitKey, limit: number) {
  return plans
    ?.filter((p) => p.isActive && (p.limits[key] === null || (p.limits[key] ?? 0) > limit))
    .sort((a, b) => a.tier - b.tier || a.price - b.price)[0];
}

export function BlockerModal({
  open,
  onOpenChange,
  blocker,
  sub,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocker: Blocker | null;
  sub: MySubscriptionDto | undefined;
}) {
  const navigate = useNavigate();
  const { data: plans, isLoading: plansLoading } = usePlansQuery(undefined, {
    skip: !open || blocker?.kind !== 'limit',
  });
  const goToPlans = () => {
    onOpenChange(false);
    navigate('/plans');
  };

  if (blocker?.kind === 'limit') {
    const { key, limit, used, plan } = blocker;
    const noun = NOUNS[key];
    const next = roomierPlan(plans, key, limit);
    return (
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={`You've reached your ${plan} limit`}
        description={`Your ${plan} plan includes ${amount(key, limit)}, and you're using ${
          used > limit ? used : 'all of them'
        }. Upgrade to add more. Nothing you've created is lost.`}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Not now
            </Button>
            <Button onClick={goToPlans}>
              <Rocket aria-hidden /> See plans
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center text-center">
          <Illustration name="limitReached" size={140} eager float />
          {plansLoading ? (
            <Skeleton className="mt-5 h-[68px] w-full rounded-2xl" />
          ) : next ? (
            <div className="mt-5 grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3.5 text-left">
              <div className="min-w-0">
                <p className="truncate text-xs font-extrabold text-muted">Now on {plan}</p>
                <p className="num truncate font-black">{amount(key, limit)}</p>
              </div>
              <ArrowRight className="size-4 text-subtle" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-xs font-extrabold text-brand-ink">With {next.name}</p>
                <p className="num truncate font-black">{amount(key, next.limits[key])}</p>
              </div>
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted">
              You're already on the roomiest plan for {noun.many}. Remove one to free a slot.
            </p>
          )}
        </div>
      </Modal>
    );
  }

  const neverSubscribed = sub?.status === 'none';
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={neverSubscribed ? 'Pick a plan to start building' : 'Your workspace is read-only'}
      description={
        neverSubscribed
          ? 'Projects and team seats come with a plan. Choose one to start adding them.'
          : 'Renew a plan to add or edit projects. Everything you created is still here, and you can still delete items.'
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button onClick={goToPlans}>
            <Rocket aria-hidden /> {neverSubscribed ? 'Choose a plan' : 'Renew a plan'}
          </Button>
        </>
      }
    >
      <div className="flex justify-center">
        <Illustration name="lockedDoor" size={140} eager float />
      </div>
    </Modal>
  );
}

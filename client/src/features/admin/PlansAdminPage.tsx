import type { PlanDto, PlanInput } from '@planpilot/shared';
import {
  Archive,
  ArchiveRestore,
  Check,
  Gauge,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorOf } from '../../api/errors';
import { PageHeader } from '../../components/layout/AdminShell';
import { Badge, PlanPill } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { EmptyState, Skeleton } from '../../components/ui/feedback';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../components/ui/menu';
import { cn } from '../../lib/cn';
import { formatInr, formatNumber, plural } from '../../lib/format';
import { useAdminPlansQuery, useDeletePlanMutation, useUpdatePlanMutation } from './adminApi';
import { ErrorCard } from './components/common';
import { ConfirmDialog } from './components/dialogs';
import { PlanFormDialog } from './components/PlanFormDialog';
import { durationLabel, limitsLabel } from './components/utils';

type AdminPlan = PlanDto & { activeSubscribers: number };

const VISIBLE_FEATURES = 5;

const toInput = (plan: PlanDto, patch: Partial<PlanInput> = {}): PlanInput => ({
  name: plan.name,
  description: plan.description,
  price: plan.price,
  durationDays: plan.durationDays,
  tier: plan.tier,
  features: plan.features,
  limits: plan.limits,
  isPopular: plan.isPopular,
  isActive: plan.isActive,
  ...patch,
});

/** Live plans first (cheapest tier first), archived ones at the end. */
const byShelf = (a: AdminPlan, b: AdminPlan) =>
  Number(b.isActive) - Number(a.isActive) || a.tier - b.tier || a.price - b.price;

export default function PlansAdminPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useAdminPlansQuery();
  const [updatePlan] = useUpdatePlanMutation();
  const [deletePlan, { isLoading: deleting }] = useDeletePlanMutation();
  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AdminPlan | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const reduce = useReducedMotion();

  const plans = [...(data ?? [])].sort(byShelf);
  const live = plans.filter((p) => p.isActive);
  const subscribers = plans.reduce((sum, p) => sum + p.activeSubscribers, 0);
  const nextTier = Math.min(10, Math.max(0, ...plans.map((p) => p.tier)) + 1);

  const openForm = (plan: AdminPlan | null) => {
    setEditing(plan);
    setFormOpen(true);
  };

  const toggleActive = async (plan: AdminPlan) => {
    try {
      await updatePlan({ id: plan.id, body: toInput(plan, { isActive: !plan.isActive }) }).unwrap();
      toast.success(
        plan.isActive
          ? `Archived ${plan.name}. Current subscribers keep it until their period ends.`
          : `${plan.name} is back on the plans page.`,
      );
    } catch (e) {
      toast.error(errorOf(e)?.message ?? `Could not update ${plan.name}.`);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      const result = await deletePlan(toDelete.id).unwrap();
      toast.success(
        result.archived
          ? `Archived ${toDelete.name} (it has subscription history).`
          : `Deleted ${toDelete.name}.`,
      );
      setDeleteOpen(false);
    } catch (e) {
      toast.error(errorOf(e)?.message ?? `Could not delete ${toDelete.name}.`);
    }
  };

  return (
    <>
      <PageHeader
        title="Plans"
        description="Create, edit and archive the plans customers can choose from."
        actions={
          <Button onClick={() => openForm(null)} className="w-full sm:w-auto">
            <Plus aria-hidden /> New plan
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy>
          {Array.from({ length: 4 }, (_, i) => (
            <PlanCardSkeleton key={i} />
          ))}
        </div>
      ) : isError && !data ? (
        <ErrorCard
          error={error}
          onRetry={() => void refetch()}
          retrying={isFetching}
          title="We couldn't load the plans"
        />
      ) : plans.length ? (
        <>
          <p className="mb-4 text-sm text-muted">
            <b className="num text-ink">{live.length}</b> live
            {plans.length > live.length && (
              <>
                {' '}
                · <b className="num text-ink">{plans.length - live.length}</b> archived
              </>
            )}{' '}
            · <b className="num text-ink">{formatNumber(subscribers)}</b> active{' '}
            {subscribers === 1 ? 'subscriber' : 'subscribers'}
          </p>
          <motion.ul
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
            initial={reduce ? false : 'hidden'}
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          >
            {plans.map((plan) => (
              <motion.li
                key={plan.id}
                className="min-w-0"
                variants={{
                  hidden: { opacity: 0, y: 14 },
                  show: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
                  },
                }}
              >
                <PlanCard
                  plan={plan}
                  onEdit={() => openForm(plan)}
                  onToggleActive={() => void toggleActive(plan)}
                  onDelete={() => {
                    setToDelete(plan);
                    setDeleteOpen(true);
                  }}
                />
              </motion.li>
            ))}
          </motion.ul>
        </>
      ) : (
        <Card>
          <EmptyState
            illustration="rocket"
            title="No plans yet"
            description="Create your first plan so customers have something to subscribe to."
            action={
              <Button onClick={() => openForm(null)}>
                <Plus aria-hidden /> New plan
              </Button>
            }
          />
        </Card>
      )}

      <PlanFormDialog
        plan={editing}
        nextTier={nextTier}
        open={formOpen}
        onOpenChange={setFormOpen}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        danger
        title={toDelete ? `Delete the ${toDelete.name} plan?` : 'Delete plan?'}
        description={
          toDelete
            ? `If anyone has ever subscribed to ${toDelete.name}, it's archived instead, so their billing history stays intact. Otherwise it's removed for good.`
            : undefined
        }
        confirmLabel="Delete plan"
        cancelLabel="Keep plan"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      >
        {toDelete && toDelete.activeSubscribers > 0 && (
          <p className="rounded-xl bg-warning-soft px-3.5 py-3 text-sm font-bold text-warning-ink">
            {plural(toDelete.activeSubscribers, 'customer is', 'customers are')} on {toDelete.name}{' '}
            right now. They keep it until their current period ends.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

function PlanCard({
  plan,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  plan: AdminPlan;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const extra = plan.features.length - VISIBLE_FEATURES;
  return (
    <Card
      className={cn(
        'flex h-full flex-col',
        plan.isPopular && plan.isActive && 'border-brand/40 ring-1 ring-brand/20',
        !plan.isActive && 'border-dashed bg-surface-2 shadow-none',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <PlanPill slug={plan.slug} name={plan.name} />
          {plan.isPopular && (
            <Badge tone="brand">
              <Star className="size-3 fill-current" aria-hidden /> Most popular
            </Badge>
          )}
          {!plan.isActive && <Badge>Archived</Badge>}
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mt-2 -mr-2 shrink-0"
              aria-label={`Actions for ${plan.name}`}
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={onEdit}>
              <Pencil /> Edit plan
            </MenuItem>
            <MenuItem onSelect={onToggleActive}>
              {plan.isActive ? (
                <>
                  <Archive /> Archive
                </>
              ) : (
                <>
                  <ArchiveRestore /> Restore
                </>
              )}
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={onDelete}>
              <Trash2 /> Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <h2 className="mt-3 text-xl font-black tracking-tight">{plan.name}</h2>
      <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted">
        {plan.description || 'No description yet.'}
      </p>

      <p className="mt-4 flex flex-wrap items-baseline gap-x-1.5">
        <span className="num text-[32px] leading-none font-black tracking-tight">
          {formatInr(plan.price)}
        </span>
        <span className="text-sm font-bold text-muted">/ {durationLabel(plan.durationDays)}</span>
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-xs font-extrabold text-muted">
            <Users className="size-3.5" aria-hidden /> Subscribers
          </dt>
          <dd className="num mt-0.5 text-lg font-black">{formatNumber(plan.activeSubscribers)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <dt className="text-xs font-extrabold text-muted">Tier</dt>
          <dd className="num mt-0.5 text-lg font-black">{plan.tier}</dd>
        </div>
      </dl>

      <p className="mt-4 flex items-center gap-2 text-sm font-extrabold">
        <Gauge className="size-4 shrink-0 text-brand" aria-hidden />
        {limitsLabel(plan.limits)}
      </p>

      <ul className="mt-3 space-y-2 text-sm">
        {plan.features.slice(0, VISIBLE_FEATURES).map((feature, i) => (
          <li key={`${i}-${feature}`} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span className="min-w-0">{feature}</span>
          </li>
        ))}
        {extra > 0 && (
          <li className="pl-6 text-[13px] font-bold text-muted">
            + {plural(extra, 'more feature')}
          </li>
        )}
      </ul>

      <div className="mt-auto pt-5">
        <Button variant="outline" className="w-full" onClick={onEdit}>
          <Pencil aria-hidden /> Edit plan
        </Button>
      </div>
    </Card>
  );
}

function PlanCardSkeleton() {
  return (
    <Card className="flex flex-col">
      <div className="flex justify-between">
        <Skeleton className="h-6 w-20 rounded-lg" />
        <Skeleton className="size-9 rounded-xl" />
      </div>
      <Skeleton className="mt-4 h-6 w-32" />
      <Skeleton className="mt-2 h-4 w-full" />
      <Skeleton className="mt-5 h-8 w-36" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
      <div className="mt-5 space-y-2.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-4/5" />
        ))}
      </div>
      <Skeleton className="mt-6 h-11 w-full rounded-xl" />
    </Card>
  );
}

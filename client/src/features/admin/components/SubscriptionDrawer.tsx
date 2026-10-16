import type { AdminSubscriptionRow, SubscriptionDto } from '@planpilot/shared';
import { CalendarPlus, CalendarX, CircleSlash, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { CHANGE_LABEL, PlanPill, StatusBadge } from '../../../components/ui/badge';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Drawer } from '../../../components/ui/dialog';
import { ProgressBar } from '../../../components/ui/feedback';
import { cn } from '../../../lib/cn';
import { formatDate, formatDateTime, formatInr } from '../../../lib/format';
import { DetailList, DetailRow, DrawerSection, PersonCell } from './common';
import { EndPlanDialog, ExtendPlanDialog } from './dialogs';
import type { PlanTarget } from './dialogs';
import { endsLabel, periodProgress } from './utils';

type Action = 'extend' | 'expire' | 'cancel';

/** Full details of one subscription row, with the admin actions that apply to it. */
export function SubscriptionDrawer({
  row,
  open,
  onOpenChange,
  onUpdated,
}: {
  row: AdminSubscriptionRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (subscription: SubscriptionDto) => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  if (!row) return null;

  const active = row.status === 'active';
  const target: PlanTarget = {
    id: row.id,
    customer: row.user.name,
    plan: row.plan.name,
    endDate: row.endDate,
    active,
  };
  const progress = periodProgress(row.startDate, row.endDate);
  const closeAction = (next: boolean) => !next && setAction(null);

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title={row.user.name}
        description={`${row.plan.name} plan · ${CHANGE_LABEL[row.changeType]}`}
        footer={
          active ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Button className="col-span-2 sm:col-span-1" onClick={() => setAction('extend')}>
                <CalendarPlus aria-hidden /> Extend
              </Button>
              <Button variant="outline" onClick={() => setAction('expire')}>
                <CalendarX aria-hidden /> Expire now
              </Button>
              <Button variant="danger-ghost" onClick={() => setAction('cancel')}>
                <CircleSlash aria-hidden /> Cancel plan
              </Button>
            </div>
          ) : (
            <div>
              <Button className="w-full" onClick={() => setAction('extend')}>
                <CalendarPlus aria-hidden /> Extend to revive
              </Button>
              <p className="mt-2 text-center text-xs text-muted">
                Extending an ended plan makes it active again, at no charge.
              </p>
            </div>
          )
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PersonCell name={row.user.name} email={row.user.email} />
          <Link
            to={`/admin/users?user=${row.user.id}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-11 sm:h-9')}
          >
            <UserRound aria-hidden /> View customer
          </Link>
        </div>

        <div className="mt-5 rounded-2xl border border-line bg-surface-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PlanPill slug={row.plan.slug} name={row.plan.name} />
            <StatusBadge status={row.status} />
          </div>
          <p className="num mt-3 text-[28px] leading-none font-black tracking-tight">
            {formatInr(row.amountPaid)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {row.changeType === 'admin_assign' && row.amountPaid === 0
              ? 'Set by an admin, no payment'
              : `Paid for this ${CHANGE_LABEL[row.changeType].toLowerCase()}`}
          </p>
          {active && (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-xs font-extrabold text-muted">
                <span>
                  Day {progress.elapsed} of {progress.total}
                </span>
                <span>{endsLabel(row.endDate)}</span>
              </div>
              <ProgressBar
                value={progress.elapsed}
                max={progress.total}
                label="Time used in this plan period"
              />
            </div>
          )}
        </div>

        <DrawerSection title="Details">
          <DetailList>
            <DetailRow label="Customer">
              <span className="block truncate">{row.user.email}</span>
            </DetailRow>
            <DetailRow label="Plan">{row.plan.name}</DetailRow>
            <DetailRow label="Change type">{CHANGE_LABEL[row.changeType]}</DetailRow>
            <DetailRow label="Started">{formatDate(row.startDate)}</DetailRow>
            <DetailRow label={active ? 'Ends' : 'Ended'}>
              {formatDate(row.endDate)}
              <span className="block text-xs font-bold text-muted">{endsLabel(row.endDate)}</span>
            </DetailRow>
            <DetailRow label="Created">{formatDateTime(row.createdAt)}</DetailRow>
            <DetailRow label="Subscription ID">
              <span className="font-mono text-xs break-all">{row.id}</span>
            </DetailRow>
          </DetailList>
        </DrawerSection>
      </Drawer>

      <ExtendPlanDialog
        target={target}
        open={action === 'extend'}
        onOpenChange={closeAction}
        onDone={onUpdated}
      />
      <EndPlanDialog
        target={target}
        kind="expire"
        open={action === 'expire'}
        onOpenChange={closeAction}
        onDone={onUpdated}
      />
      <EndPlanDialog
        target={target}
        kind="cancel"
        open={action === 'cancel'}
        onOpenChange={closeAction}
        onDone={onUpdated}
      />
    </>
  );
}

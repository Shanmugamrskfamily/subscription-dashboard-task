import { assignPlanSchema, roleSchema, userStatusSchema } from '@planpilot/shared';
import type { AdminUserDetail, Role, UserStatus } from '@planpilot/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorOf } from '../../../api/errors';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Skeleton } from '../../../components/ui/feedback';
import { TextField } from '../../../components/ui/form';
import { formatInr, plural } from '../../../lib/format';
import {
  useAdminPlansQuery,
  useAssignPlanMutation,
  useForceSignOutMutation,
  useSetUserRoleMutation,
  useSetUserStatusMutation,
} from '../adminApi';
import { ChoiceCardsField } from './common';
import { ConfirmDialog, FormDialog, ReasonField } from './dialogs';
import {
  durationLabel,
  endOfDayIso,
  firstName,
  limitsLabel,
  toDateInput,
  tomorrowInput,
  yupErrors,
} from './utils';

interface DialogProps {
  detail: AdminUserDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Put a customer on any plan, free of charge, starting today. */
export function ChangePlanDialog({ detail, open, onOpenChange }: DialogProps) {
  const { user, subscription } = detail;
  const name = firstName(user.name);
  const plans = useAdminPlansQuery(undefined, { skip: !open });
  const [assign] = useAssignPlanMutation();
  const choices = (plans.data ?? [])
    .filter((p) => p.isActive)
    .sort((a, b) => a.tier - b.tier || a.price - b.price);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={subscription ? `Change ${name}'s plan` : `Assign a plan to ${name}`}
      description={
        subscription
          ? `${name} moves to the new plan straight away, with no payment. The ${subscription.plan.name} plan ends now and the new period starts today.`
          : `${name} gets the plan straight away, with no payment. The period starts today.`
      }
      submitLabel={subscription ? 'Change plan' : 'Assign plan'}
      initialValues={{ planId: '', reason: '' }}
      validationSchema={assignPlanSchema}
      onSubmit={async ({ planId, reason }) => {
        await assign({ userId: user.id, planId, reason: reason.trim() }).unwrap();
        const plan = choices.find((p) => p.id === planId);
        toast.success(`${name} is now on the ${plan?.name ?? 'new'} plan.`);
      }}
    >
      {plans.isLoading ? (
        <div className="space-y-2" aria-busy>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : plans.isError ? (
        <div role="alert" className="rounded-xl bg-danger-soft p-3.5 text-sm text-danger-ink">
          <p className="font-bold">
            {errorOf(plans.error)?.message ?? 'Could not load the plans.'}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void plans.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <ChoiceCardsField
          name="planId"
          label="New plan"
          options={choices.map((p) => {
            const current = subscription?.plan.id === p.id;
            return {
              value: p.id,
              disabled: current,
              label: (
                <span className="flex items-center gap-2">
                  {p.name}
                  {current && <Badge tone="brand">Current</Badge>}
                </span>
              ),
              aside: (
                <span className="num text-[13px] font-bold text-muted">
                  {formatInr(p.price)} / {durationLabel(p.durationDays)}
                </span>
              ),
              description: limitsLabel(p.limits),
            };
          })}
        />
      )}
      <ReasonField placeholder="e.g. Upgraded as part of the partner programme" />
    </FormDialog>
  );
}

interface StatusValues {
  status: UserStatus;
  reason: string;
  accessExpiresAt: string;
}

const statusPayload = (v: StatusValues) => ({
  status: v.status,
  reason: v.reason.trim(),
  accessExpiresAt: v.accessExpiresAt ? endOfDayIso(v.accessExpiresAt) : null,
});

/** Active, inactive or blocked, plus an optional "access until" date. */
export function AccountStatusDialog({ detail, open, onOpenChange }: DialogProps) {
  const { user } = detail;
  const name = firstName(user.name);
  const [setStatus] = useSetUserStatusMutation();
  return (
    <FormDialog<StatusValues>
      open={open}
      onOpenChange={onOpenChange}
      title={`Set ${name}'s account status`}
      description={`Changes apply immediately, and ${name} gets a notification with your reason.`}
      submitLabel="Save status"
      initialValues={{
        status: user.status,
        reason: '',
        accessExpiresAt: user.accessExpiresAt ? toDateInput(user.accessExpiresAt) : '',
      }}
      validate={(values) => yupErrors<StatusValues>(userStatusSchema, statusPayload(values))}
      onSubmit={async (values) => {
        await setStatus({ id: user.id, ...statusPayload(values) }).unwrap();
        toast.success(`${name}'s account is now ${values.status}.`);
      }}
    >
      {({ values, setFieldValue }) => (
        <>
          <ChoiceCardsField
            name="status"
            label="Status"
            options={[
              {
                value: 'active',
                label: 'Active',
                description: `${name} can sign in and use their plan as normal.`,
              },
              {
                value: 'inactive',
                label: 'Inactive',
                description: `${name} will be signed out on every device and see "Your account is inactive" when signing in.`,
              },
              {
                value: 'blocked',
                label: 'Blocked',
                description: `${name} will be signed out on every device and see "blocked" when signing in.`,
              },
            ]}
          />
          <div>
            <TextField
              name="accessExpiresAt"
              label="Access until (optional)"
              type="date"
              min={tomorrowInput()}
              hint={`After this day ${name} can't sign in, even while the account is active. Leave it empty for no end date.`}
              className="dark:[&_input]:[color-scheme:dark]"
            />
            {values.accessExpiresAt && (
              <Button
                variant="link"
                size="sm"
                className="mt-1 h-11 px-0 sm:h-8"
                onClick={() => void setFieldValue('accessExpiresAt', '')}
              >
                Remove the end date
              </Button>
            )}
          </div>
          <ReasonField
            placeholder={
              values.status === 'active'
                ? 'e.g. Dispute resolved, access restored'
                : 'e.g. Payment dispute under review'
            }
          />
        </>
      )}
    </FormDialog>
  );
}

/** Customer or admin. The person is signed out so the new role applies at next sign-in. */
export function RoleDialog({ detail, open, onOpenChange }: DialogProps) {
  const { user } = detail;
  const name = firstName(user.name);
  const [setRole] = useSetUserRoleMutation();
  return (
    <FormDialog<{ role: Role }>
      open={open}
      onOpenChange={onOpenChange}
      title={`Change ${name}'s role`}
      description={`${name} is signed out everywhere, so the new role applies the next time they sign in.`}
      submitLabel="Change role"
      initialValues={{ role: user.role === 'admin' ? 'user' : 'admin' }}
      validationSchema={roleSchema}
      onSubmit={async ({ role }) => {
        await setRole({ id: user.id, role }).unwrap();
        toast.success(`${name} is now ${role === 'admin' ? 'an admin' : 'a customer'}.`);
      }}
    >
      <ChoiceCardsField
        name="role"
        label="Role"
        options={[
          {
            value: 'user',
            label: 'Customer',
            aside: user.role === 'user' ? <Badge tone="brand">Current</Badge> : undefined,
            description: 'Has a plan and a workspace. No access to the admin area.',
          },
          {
            value: 'admin',
            label: 'Admin',
            aside: user.role === 'admin' ? <Badge tone="brand">Current</Badge> : undefined,
            description:
              "Full access to this admin area. Admins can't hold a plan, so end any active plan first.",
          },
        ]}
      />
    </FormDialog>
  );
}

export function SignOutDialog({ detail, open, onOpenChange }: DialogProps) {
  const { user, sessions } = detail;
  const name = firstName(user.name);
  const [signOut] = useForceSignOutMutation();
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const { revoked } = await signOut(user.id).unwrap();
      toast.success(`Signed ${name} out of ${plural(revoked, 'session')}.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorOf(e)?.message ?? `Could not sign ${name} out.`);
    } finally {
      setLoading(false);
    }
  };
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      danger
      title={`Sign ${name} out everywhere?`}
      description={`${name} will be signed out on every device (${plural(sessions.length, 'active session')}) and need to sign in again. Their account and plan don't change.`}
      confirmLabel="Sign out everywhere"
      loading={loading}
      onConfirm={() => void run()}
    />
  );
}

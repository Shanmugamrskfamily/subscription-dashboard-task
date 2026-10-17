import { REASON_MAX, extendSubscriptionSchema, reasonOnlySchema } from '@planpilot/shared';
import type { SubscriptionDto } from '@planpilot/shared';
import { Form, Formik } from 'formik';
import type { FormikErrors, FormikProps, FormikValues } from 'formik';
import { CalendarCheck } from 'lucide-react';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import type { AnySchema } from 'yup';
import { errorOf } from '../../../api/errors';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/dialog';
import {
  FocusFirstError,
  FormAlert,
  TextField,
  TextareaField,
  applyServerErrors,
} from '../../../components/ui/form';
import { formatDate } from '../../../lib/format';
import { useEndSubscriptionMutation, useExtendSubscriptionMutation } from '../adminApi';
import { ChoiceCardsField } from './common';
import {
  endOfDayIso,
  endsLabel,
  firstName,
  isFutureDateInput,
  previewEndDate,
  tomorrowInput,
  yupErrors,
} from './utils';

/** Remounts the form each time the dialog opens, so it always starts fresh. */
function useOpenSession(open: boolean) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((s) => s + 1);
  }
  return session;
}

interface FormDialogProps<V extends FormikValues> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  submitLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  initialValues: V;
  validationSchema?: AnySchema;
  validate?: (values: V) => FormikErrors<V>;
  /** Server field names that differ from the form's, e.g. `{ price: 'priceRupees' }`. */
  fieldMap?: Record<string, string>;
  /** Runs the mutation (with `.unwrap()`); throwing keeps the dialog open with the errors. */
  onSubmit: (values: V) => Promise<void>;
  children: ReactNode | ((form: FormikProps<V>) => ReactNode);
  className?: string;
}

/**
 * A Formik form in a modal: submit button in the footer with a spinner, server field
 * errors mapped back onto fields, everything else shown above the form and as a toast.
 */
export function FormDialog<V extends FormikValues>({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  cancelLabel = 'Cancel',
  danger = false,
  initialValues,
  validationSchema,
  validate,
  fieldMap,
  onSubmit,
  children,
  className,
}: FormDialogProps<V>) {
  const formId = useId();
  const session = useOpenSession(open);
  return (
    <Formik<V>
      key={session}
      initialValues={initialValues}
      validationSchema={validationSchema}
      validate={validate}
      onSubmit={async (values, helpers) => {
        helpers.setStatus(null);
        try {
          await onSubmit(values);
          onOpenChange(false);
        } catch (e) {
          const err = errorOf(e);
          if (!err) return;
          applyServerErrors(
            {
              ...err,
              details: err.details.map((d) => ({ ...d, field: fieldMap?.[d.field] ?? d.field })),
            },
            helpers,
          );
          toast.error(err.message);
        }
      }}
    >
      {(form) => (
        <Modal
          open={open}
          onOpenChange={onOpenChange}
          title={title}
          description={description}
          className={className}
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={form.isSubmitting}
              >
                {cancelLabel}
              </Button>
              <Button
                type="submit"
                form={formId}
                variant={danger ? 'danger' : 'primary'}
                loading={form.isSubmitting}
              >
                {submitLabel}
              </Button>
            </>
          }
        >
          <Form id={formId} noValidate className="space-y-4">
            <FocusFirstError />
            <FormAlert message={form.status as string | null} />
            {typeof children === 'function' ? children(form) : children}
          </Form>
        </Modal>
      )}
    </Formik>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

export function ReasonField({ placeholder }: { placeholder?: string }) {
  return (
    <TextareaField
      name="reason"
      label="Reason"
      placeholder={placeholder}
      maxLength={REASON_MAX}
      hint="They'll see this in their notification. 5 to 200 characters."
    />
  );
}

/** A confirmation that needs a written reason (it's logged and sent to the customer). */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  cancelLabel,
  danger,
  placeholder,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  submitLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  placeholder?: string;
  onSubmit: (reason: string) => Promise<void>;
  children?: ReactNode;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      submitLabel={submitLabel}
      cancelLabel={cancelLabel}
      danger={danger}
      initialValues={{ reason: '' }}
      validationSchema={reasonOnlySchema}
      onSubmit={({ reason }) => onSubmit(reason.trim())}
    >
      {children}
      <ReasonField placeholder={placeholder} />
    </FormDialog>
  );
}

// ---------- subscription actions (used by the subscriptions table and the user drawer) ----------

export interface PlanTarget {
  /** Subscription id. */
  id: string;
  customer: string;
  plan: string;
  endDate: string;
  active: boolean;
}

interface ExtendValues {
  choice: string;
  endDate: string;
  reason: string;
}

const EXTEND_CHOICES = [
  { value: '7', label: '+7 days' },
  { value: '30', label: '+30 days' },
  { value: '90', label: '+90 days' },
  { value: 'date', label: 'Pick a date' },
];

const extendPayload = (v: ExtendValues) =>
  v.choice === 'date'
    ? { endDate: v.endDate ? endOfDayIso(v.endDate) : undefined, reason: v.reason.trim() }
    : { days: Number(v.choice), reason: v.reason.trim() };

/** Extend by 7, 30 or 90 days or to a chosen date. On an ended plan it revives it. */
export function ExtendPlanDialog({
  target,
  open,
  onOpenChange,
  onDone,
}: {
  target: PlanTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: (subscription: SubscriptionDto) => void;
}) {
  const [extend] = useExtendSubscriptionMutation();
  if (!target) return null;
  const name = firstName(target.customer);
  return (
    <FormDialog<ExtendValues>
      open={open}
      onOpenChange={onOpenChange}
      title={
        target.active
          ? `Extend ${name}'s ${target.plan} plan`
          : `Revive ${name}'s ${target.plan} plan`
      }
      description={
        target.active
          ? `It ${endsLabel(target.endDate)}, on ${formatDate(target.endDate)}. ${name} gets a notification with your reason.`
          : `It ended on ${formatDate(target.endDate)}. Extending it makes it active again from today, at no charge.`
      }
      submitLabel={target.active ? 'Extend plan' : 'Revive plan'}
      initialValues={{ choice: '30', endDate: '', reason: '' }}
      validate={(values) => {
        const errors = yupErrors<ExtendValues>(extendSubscriptionSchema, extendPayload(values));
        if (values.choice === 'date') {
          if (!values.endDate) errors.endDate = 'Pick the new end date';
          else if (!isFutureDateInput(values.endDate)) errors.endDate = 'Pick a date after today';
        }
        return errors;
      }}
      fieldMap={{ days: 'choice' }}
      onSubmit={async (values) => {
        const result = await extend({ id: target.id, ...extendPayload(values) }).unwrap();
        toast.success(`${name}'s ${target.plan} plan now ends on ${formatDate(result.endDate)}.`);
        onDone?.(result);
      }}
    >
      {({ values }) => {
        const days = Number(values.choice);
        const newEnd =
          values.choice === 'date'
            ? values.endDate && isFutureDateInput(values.endDate)
              ? endOfDayIso(values.endDate)
              : null
            : previewEndDate(target.endDate, target.active, days);
        return (
          <>
            <ChoiceCardsField
              name="choice"
              label="Extend by"
              columns="grid-cols-2 sm:grid-cols-4"
              options={EXTEND_CHOICES}
            />
            {values.choice === 'date' && (
              <TextField
                name="endDate"
                label="New end date"
                type="date"
                min={tomorrowInput()}
                className="dark:[&_input]:[color-scheme:dark]"
              />
            )}
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-3 text-sm">
              <CalendarCheck className="size-5 shrink-0 text-brand" aria-hidden />
              <p aria-live="polite">
                {newEnd ? (
                  <>
                    New end date: <b>{formatDate(newEnd)}</b>
                  </>
                ) : (
                  <span className="text-muted">Pick a date to see the new end date.</span>
                )}
              </p>
            </div>
            <ReasonField placeholder="e.g. Goodwill extension while their renewal payment clears" />
          </>
        );
      }}
    </FormDialog>
  );
}

/** Expire (time's up) or cancel (taken away) an active plan right now. */
export function EndPlanDialog({
  target,
  kind,
  open,
  onOpenChange,
  onDone,
}: {
  target: PlanTarget | null;
  kind: 'expire' | 'cancel';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: (subscription: SubscriptionDto) => void;
}) {
  const [end] = useEndSubscriptionMutation();
  if (!target) return null;
  const name = firstName(target.customer);
  const expire = kind === 'expire';
  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      danger
      title={
        expire
          ? `Expire ${name}'s ${target.plan} plan now?`
          : `Cancel ${name}'s ${target.plan} plan?`
      }
      description={
        expire
          ? `The plan ends immediately instead of on ${formatDate(target.endDate)}. ${name}'s projects and team become read-only until they choose a new plan.`
          : `The plan is cancelled immediately and shows as cancelled in ${name}'s billing history. Their projects and team become read-only until they choose a new plan.`
      }
      submitLabel={expire ? 'Expire now' : 'Cancel plan'}
      cancelLabel={expire ? 'Cancel' : 'Keep plan'}
      placeholder={expire ? 'e.g. Trial period is over' : "e.g. Refunded at the customer's request"}
      onSubmit={async (reason) => {
        const result = await end({ id: target.id, kind, reason }).unwrap();
        toast.success(
          expire ? `${name}'s ${target.plan} plan has ended.` : `${name}'s plan was cancelled.`,
        );
        onDone?.(result);
      }}
    />
  );
}

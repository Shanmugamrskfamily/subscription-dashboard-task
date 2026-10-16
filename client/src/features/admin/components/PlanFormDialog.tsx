import { planFormSchema } from '@planpilot/shared';
import type { PlanDto, PlanInput } from '@planpilot/shared';
import { FieldArray, useField } from 'formik';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { TextField, TextareaField } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';
import { useCreatePlanMutation, useUpdatePlanMutation } from '../adminApi';
import { FormDialog } from './dialogs';
import { yupErrors } from './utils';

const MAX_FEATURES = 12;

type NumberInput = number | '';

interface PlanFormState {
  name: string;
  description: string;
  priceRupees: NumberInput;
  durationDays: NumberInput;
  tier: NumberInput;
  features: string[];
  limits: { projects: NumberInput | null; teamMembers: NumberInput | null };
  isPopular: boolean;
  isActive: boolean;
}

const toFormState = (plan: PlanDto | null, nextTier: number): PlanFormState =>
  plan
    ? {
        name: plan.name,
        description: plan.description,
        priceRupees: plan.price / 100,
        durationDays: plan.durationDays,
        tier: plan.tier,
        features: plan.features.length ? [...plan.features] : [''],
        limits: { ...plan.limits },
        isPopular: plan.isPopular,
        isActive: plan.isActive,
      }
    : {
        name: '',
        description: '',
        priceRupees: '',
        durationDays: 30,
        tier: nextTier,
        features: [''],
        limits: { projects: 10, teamMembers: 5 },
        isPopular: false,
        isActive: true,
      };

/**
 * Empty number boxes become "missing" (so the message says "required"); an empty
 * limit that isn't unlimited becomes NaN (so it says "must be a number").
 */
const toSchemaInput = (v: PlanFormState) => ({
  name: v.name,
  description: v.description,
  priceRupees: v.priceRupees === '' ? undefined : v.priceRupees,
  durationDays: v.durationDays === '' ? undefined : v.durationDays,
  tier: v.tier === '' ? undefined : v.tier,
  features: v.features,
  limits: {
    projects: v.limits.projects === '' ? Number.NaN : v.limits.projects,
    teamMembers: v.limits.teamMembers === '' ? Number.NaN : v.limits.teamMembers,
  },
  isPopular: v.isPopular,
  isActive: v.isActive,
});

/** The API takes the price in whole paise; the form takes rupees. */
function toPlanInput(v: PlanFormState): PlanInput {
  const clean = planFormSchema.cast(toSchemaInput(v), { stripUnknown: true });
  return {
    name: clean.name,
    description: clean.description,
    price: Math.round(clean.priceRupees * 100),
    durationDays: clean.durationDays,
    tier: clean.tier,
    features: clean.features,
    limits: clean.limits,
    isPopular: clean.isPopular,
    isActive: clean.isActive,
  };
}

export function PlanFormDialog({
  plan,
  nextTier,
  open,
  onOpenChange,
}: {
  plan: PlanDto | null;
  nextTier: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [createPlan] = useCreatePlanMutation();
  const [updatePlan] = useUpdatePlanMutation();
  return (
    <FormDialog<PlanFormState>
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-2xl"
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      description={
        plan
          ? 'Changes apply to new purchases and renewals. Current subscribers keep what they paid for until their period ends.'
          : 'New plans appear on the plans page as soon as they are active.'
      }
      submitLabel={plan ? 'Save changes' : 'Create plan'}
      initialValues={toFormState(plan, nextTier)}
      validate={(values) => yupErrors<PlanFormState>(planFormSchema, toSchemaInput(values))}
      fieldMap={{ price: 'priceRupees' }}
      onSubmit={async (values) => {
        const body = toPlanInput(values);
        if (plan) {
          await updatePlan({ id: plan.id, body }).unwrap();
          toast.success(`Saved your changes to ${body.name}.`);
        } else {
          await createPlan(body).unwrap();
          toast.success(`${body.name} is ready.`, {
            description: body.isActive
              ? 'Customers can pick it on the plans page now.'
              : 'It stays hidden until you make it active.',
          });
        }
      }}
    >
      {({ values, errors, submitCount }) => (
        <>
          <TextField name="name" label="Plan name" placeholder="e.g. Pro" maxLength={40} />
          <TextareaField
            name="description"
            label="Description (optional)"
            placeholder="One line customers see under the plan name"
            maxLength={160}
            className="[&_textarea]:min-h-20"
            hint={`${values.description.length} of 160 characters`}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              name="priceRupees"
              label="Price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="799"
              icon={<span className="font-black text-subtle">₹</span>}
            />
            <TextField
              name="durationDays"
              label="Duration (days)"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              hint="30 = monthly, 365 = yearly"
            />
            <TextField
              name="tier"
              label="Tier"
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              step={1}
              hint="Higher tiers count as upgrades"
            />
          </div>

          <FieldArray name="features">
            {({ push, remove }) => (
              <fieldset>
                <legend className="mb-1.5 text-[13px] font-extrabold text-muted">Features</legend>
                <ul className="space-y-2">
                  {values.features.map((_, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <FeatureInput name={`features.${i}`} index={i} />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted hover:text-danger-ink"
                        disabled={values.features.length <= 1}
                        onClick={() => remove(i)}
                        aria-label={`Remove feature ${i + 1}`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
                {typeof errors.features === 'string' && submitCount > 0 && (
                  <FieldError message={errors.features} />
                )}
                <div className="mt-2 flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 sm:h-9"
                    disabled={values.features.length >= MAX_FEATURES}
                    onClick={() => push('')}
                  >
                    <Plus aria-hidden /> Add feature
                  </Button>
                  <span className="num text-xs font-bold text-subtle">
                    {values.features.length} of {MAX_FEATURES}
                  </span>
                </div>
              </fieldset>
            )}
          </FieldArray>

          <div className="grid gap-4 sm:grid-cols-2">
            <LimitField name="limits.projects" label="Project limit" />
            <LimitField name="limits.teamMembers" label="Team member limit" />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <SwitchField
              name="isPopular"
              label="Most popular"
              description="Highlights this plan with a badge."
            />
            <SwitchField
              name="isActive"
              label="Active"
              description="Shown on the plans page and open to new customers."
            />
          </div>
        </>
      )}
    </FormDialog>
  );
}

function FieldError({ id, message }: { id?: string; message: string }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-[13px] font-bold text-danger-ink">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

function FeatureInput({ name, index }: { name: string; index: number }) {
  const [field, meta] = useField<string>(name);
  const errorId = useId();
  const error = meta.touched && meta.error ? meta.error : undefined;
  return (
    <div className="min-w-0 flex-1">
      <input
        {...field}
        value={field.value ?? ''}
        aria-label={`Feature ${index + 1}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        placeholder={index === 0 ? 'e.g. Priority email support' : 'Another feature'}
        maxLength={80}
        // A row added with "Add feature" gets focus straight away.
        autoFocus={index > 0 && !field.value}
        className={cn(
          'h-11 w-full rounded-xl border-[1.5px] bg-surface px-3.5 text-ink outline-none placeholder:text-subtle',
          error
            ? 'border-danger'
            : 'border-line focus:border-brand focus:ring-4 focus:ring-brand/15',
        )}
      />
      {error && <FieldError id={errorId} message={error} />}
    </div>
  );
}

/** A number box with an "Unlimited" switch-off; unlimited is stored as `null`. */
function LimitField({ name, label }: { name: string; label: string }) {
  const [field, , helpers] = useField<NumberInput | null>(name);
  const [lastValue, setLastValue] = useState<NumberInput>(field.value ?? 10);
  const unlimited = field.value === null;
  return (
    <div>
      <TextField
        name={name}
        label={label}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        disabled={unlimited}
        placeholder={unlimited ? 'Unlimited' : undefined}
      />
      <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-bold sm:min-h-9">
        <input
          type="checkbox"
          checked={unlimited}
          onChange={(e) => {
            if (e.target.checked) {
              setLastValue(field.value ?? 10);
              void helpers.setValue(null);
            } else {
              void helpers.setValue(lastValue);
            }
          }}
          className="size-[18px] cursor-pointer accent-[var(--brand)]"
        />
        Unlimited
      </label>
    </div>
  );
}

function SwitchField({
  name,
  label,
  description,
}: {
  name: string;
  label: string;
  description: string;
}) {
  const [field, , helpers] = useField<boolean>(name);
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line py-2 pr-1.5 pl-3.5">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-extrabold">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {description}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={field.value}
        aria-describedby={`${id}-hint`}
        onClick={() => void helpers.setValue(!field.value)}
        className="grid h-11 w-14 shrink-0 cursor-pointer place-items-center rounded-xl"
      >
        <span
          className={cn(
            'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
            field.value ? 'bg-brand' : 'bg-surface-3',
          )}
        >
          <span
            className={cn(
              'inline-block size-5 rounded-full bg-white shadow-card transition-transform',
              field.value ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </span>
      </button>
    </div>
  );
}

import { useField, useFormikContext } from 'formik';
import type { FormikHelpers } from 'formik';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import type { AppError } from '../../api/errors';
import { fieldErrors } from '../../api/errors';
import { cn } from '../../lib/cn';

const shell =
  'flex items-center gap-2.5 rounded-xl border-[1.5px] bg-surface px-3.5 transition-[border-color,box-shadow] duration-150 [&>svg]:size-[18px] [&>svg]:shrink-0 [&>svg]:text-subtle';

interface BaseProps {
  name: string;
  label: string;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

function useFieldA11y(name: string, hint?: ReactNode) {
  const [field, meta, helpers] = useField(name);
  const id = useId();
  const error = meta.touched && meta.error ? String(meta.error) : undefined;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return { field, meta, helpers, id, error, describedBy };
}

function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  if (error) {
    return (
      <p
        id={`${id}-error`}
        className="mt-1.5 flex items-start gap-1.5 text-[13px] font-bold text-danger-ink"
      >
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {error}
      </p>
    );
  }
  return hint ? (
    <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">
      {hint}
    </p>
  ) : null;
}

/** Visible label, error under the field after it's been touched, linked for screen readers. */
export function TextField({
  name,
  label,
  hint,
  icon,
  className,
  trailing,
  ...props
}: BaseProps & InputHTMLAttributes<HTMLInputElement> & { trailing?: ReactNode }) {
  const { field, id, error, describedBy } = useFieldA11y(name, hint);
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-extrabold text-muted">
        {label}
      </label>
      <div
        className={cn(
          shell,
          'h-12',
          error
            ? 'border-danger'
            : 'border-line focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15',
        )}
      >
        {icon}
        <input
          id={id}
          {...field}
          value={field.value ?? ''}
          {...props}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className="h-full w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-subtle"
        />
        {trailing}
      </div>
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  );
}

function strength(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const level = Math.min(4, score);
  return {
    level,
    label: ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][level] as string,
    color: ['bg-danger', 'bg-danger', 'bg-warning', 'bg-sky', 'bg-success'][level] as string,
  };
}

export function PasswordField({
  showStrength = false,
  ...props
}: BaseProps & InputHTMLAttributes<HTMLInputElement> & { showStrength?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [field] = useField<string>(props.name);
  const s = strength(field.value ?? '');
  return (
    <div className={props.className}>
      <TextField
        {...props}
        className={undefined}
        type={visible ? 'text' : 'password'}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="-mr-2 grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg text-subtle hover:text-ink"
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
          >
            {visible ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        }
      />
      {showStrength && field.value && (
        <div className="mt-2 flex items-center gap-2" aria-live="polite">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  i < s.level ? s.color : 'bg-surface-3',
                )}
              />
            ))}
          </div>
          <span className="w-16 text-right text-xs font-extrabold text-muted">{s.label}</span>
        </div>
      )}
    </div>
  );
}

export function TextareaField({
  name,
  label,
  hint,
  className,
  ...props
}: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { field, id, error, describedBy } = useFieldA11y(name, hint);
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-extrabold text-muted">
        {label}
      </label>
      <textarea
        id={id}
        {...field}
        value={field.value ?? ''}
        {...props}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={cn(
          'min-h-24 w-full rounded-xl border-[1.5px] bg-surface px-3.5 py-3 text-ink outline-none placeholder:text-subtle',
          error
            ? 'border-danger'
            : 'border-line focus:border-brand focus:ring-4 focus:ring-brand/15',
        )}
      />
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  hint,
  className,
  options,
  ...props
}: BaseProps &
  SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  const { field, id, error, describedBy } = useFieldA11y(name, hint);
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-extrabold text-muted">
        {label}
      </label>
      <select
        id={id}
        {...field}
        value={field.value ?? ''}
        {...props}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={cn(
          'h-12 w-full cursor-pointer rounded-xl border-[1.5px] bg-surface px-3 text-ink outline-none',
          error
            ? 'border-danger'
            : 'border-line focus:border-brand focus:ring-4 focus:ring-brand/15',
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  );
}

/** After a failed submit, moves focus to the first field with an error. */
export function FocusFirstError() {
  const { submitCount, isSubmitting, isValid, errors } = useFormikContext();
  const handled = useRef(0);
  useEffect(() => {
    // Validation is async: wait until this submit attempt has settled, then act once.
    if (!submitCount || isSubmitting || isValid || handled.current === submitCount) return;
    const first = Object.keys(errors as object)[0];
    if (!first) return;
    handled.current = submitCount;
    document
      .querySelector<HTMLElement>(`[name="${CSS.escape(first)}"], [name^="${CSS.escape(first)}."]`)
      ?.focus();
  }, [submitCount, isSubmitting, isValid, errors]);
  return null;
}

/** Puts server validation errors back on their fields, and the rest above the form. */
export function applyServerErrors<T>(error: AppError, helpers: FormikHelpers<T>) {
  const byField = fieldErrors(error);
  if (Object.keys(byField).length) {
    helpers.setErrors(byField as never);
    helpers.setTouched(
      Object.fromEntries(Object.keys(byField).map((k) => [k, true])) as never,
      false,
    );
  }
  helpers.setStatus(Object.keys(byField).length ? null : error.message);
}

export function FormAlert({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-sm font-bold text-danger-ink"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </div>
  );
}

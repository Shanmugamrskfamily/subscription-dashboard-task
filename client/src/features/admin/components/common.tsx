import { useField } from 'formik';
import { AlertCircle, Download, RotateCw, Search, X } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { errorOf } from '../../../api/errors';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Avatar, Illustration } from '../../../components/ui/feedback';
import { Tooltip } from '../../../components/ui/menu';
import { cn } from '../../../lib/cn';
import { plural } from '../../../lib/format';
import { useExportSubscriptionsMutation } from '../adminApi';
import type { SubscriptionFilters } from '../adminApi';
import { downloadCsv } from './utils';

// ---------- loading and errors ----------

/** What every data area shows when a request fails: the reason and a way to try again. */
export function ErrorState({
  error,
  onRetry,
  retrying = false,
  title = "We couldn't load this",
  className,
}: {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  title?: string;
  className?: string;
}) {
  const err = errorOf(error);
  const offline = err?.code === 'NETWORK_ERROR' || err?.code === 'TIMEOUT';
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center px-4 py-10 text-center', className)}
    >
      <Illustration name={offline ? 'unplugged' : 'brokenGear'} size={120} />
      <h3 className="mt-4 text-lg font-extrabold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">
        {err?.message ?? 'Something went wrong. Please try again.'}
      </p>
      <Button variant="outline" className="mt-5" onClick={onRetry} loading={retrying}>
        {!retrying && <RotateCw aria-hidden />} Try again
      </Button>
    </div>
  );
}

export function ErrorCard(props: Parameters<typeof ErrorState>[0]) {
  return (
    <Card>
      <ErrorState {...props} />
    </Card>
  );
}

// ---------- people ----------

export function PersonCell({
  name,
  email,
  online,
  badge,
  className,
}: {
  name: string;
  email: string;
  online?: boolean;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <Avatar name={name} online={online} />
      <div className="max-w-[15rem] min-w-0">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-extrabold">{name}</span>
          {badge}
        </p>
        <p className="truncate text-xs text-muted" title={email}>
          {email}
        </p>
      </div>
    </div>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full bg-success motion-safe:animate-live',
        className,
      )}
      aria-hidden
    />
  );
}

// ---------- filters ----------

const control =
  'h-11 w-full rounded-xl border-[1.5px] border-line bg-surface text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand/15 dark:[color-scheme:dark]';

function FilterLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-extrabold text-muted">
      {children}
    </label>
  );
}

export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('min-w-0', className)}>
      <FilterLabel htmlFor={id}>{label}</FilterLabel>
      <div className="flex h-11 items-center gap-2.5 rounded-xl border-[1.5px] border-line bg-surface pl-3.5 transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
        <Search className="size-[18px] shrink-0 text-subtle" aria-hidden />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={80}
          className="h-full w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="mr-0.5 grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg text-subtle hover:text-ink"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('min-w-0', className)}>
      <FilterLabel htmlFor={id}>{label}</FilterLabel>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(control, 'cursor-pointer px-3 font-bold')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterDate({
  label,
  value,
  onChange,
  min,
  max,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('min-w-0', className)}>
      <FilterLabel htmlFor={id}>{label}</FilterLabel>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className={cn(control, 'px-3 font-bold')}
      />
    </div>
  );
}

export interface ActiveFilter {
  key: string;
  name: string;
  value: string;
  onRemove: () => void;
}

/** The filters in effect, each removable, plus "Clear all". */
export function FilterChips({
  filters,
  onClearAll,
}: {
  filters: ActiveFilter[];
  onClearAll: () => void;
}) {
  if (!filters.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={f.onRemove}
          aria-label={`Remove filter ${f.name}: ${f.value}`}
          className="inline-flex min-h-11 max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface pr-2 pl-3 text-[13px] font-bold text-ink transition-colors hover:border-line-strong hover:bg-surface-2 sm:min-h-8"
        >
          <span className="shrink-0 text-muted">{f.name}:</span>
          <span className="truncate">{f.value}</span>
          <X className="size-3.5 shrink-0 text-subtle" aria-hidden />
        </button>
      ))}
      <Button variant="link" size="sm" onClick={onClearAll} className="h-11 px-2 sm:h-8">
        Clear all
      </Button>
    </div>
  );
}

// ---------- actions ----------

export function ExportCsvButton({
  filters,
  className,
}: {
  filters: SubscriptionFilters;
  className?: string;
}) {
  const [exportCsv, { isLoading }] = useExportSubscriptionsMutation();
  const run = async () => {
    try {
      const { filename, csv } = await exportCsv(filters).unwrap();
      downloadCsv(filename, csv);
      const rows = Math.max(0, csv.split(/\r?\n/).filter(Boolean).length - 1);
      toast.success(`Exported ${plural(rows, 'subscription')} to ${filename}.`);
    } catch (e) {
      toast.error(errorOf(e)?.message ?? 'Could not export the subscriptions.');
    }
  };
  return (
    <Button variant="outline" className={className} loading={isLoading} onClick={() => void run()}>
      {!isLoading && <Download aria-hidden />} Export CSV
    </Button>
  );
}

/** Explains why a control is disabled, on hover and on keyboard focus. */
export function DisabledReason({ reason, children }: { reason?: string; children: ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip content={reason}>
      <span tabIndex={0} className="inline-flex w-full rounded-xl" aria-label={reason}>
        {children}
      </span>
    </Tooltip>
  );
}

// ---------- drawers ----------

export function DrawerSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mt-6', className)}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="text-xs font-black tracking-wider text-subtle uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-line rounded-xl border border-line px-3.5">{children}</dl>;
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-bold">{children}</dd>
    </div>
  );
}

// ---------- form fields ----------

export interface ChoiceOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  disabled?: boolean;
}

/** Radio buttons drawn as cards: big touch targets, with a line explaining each option. */
export function ChoiceCardsField({
  name,
  label,
  options,
  className,
  columns = 'grid-cols-1',
}: {
  name: string;
  label: string;
  options: ChoiceOption[];
  className?: string;
  columns?: string;
}) {
  const [field, meta, helpers] = useField<string>(name);
  const error = meta.touched && meta.error ? meta.error : undefined;
  const errorId = useId();
  return (
    <fieldset className={className} aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1.5 text-[13px] font-extrabold text-muted">{label}</legend>
      <div className={cn('grid gap-2', columns)}>
        {options.map((o) => {
          const checked = field.value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border-[1.5px] px-3.5 py-3 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/20',
                checked
                  ? 'border-brand bg-brand-soft'
                  : 'border-line bg-surface hover:border-line-strong',
                o.disabled && 'cursor-not-allowed opacity-55 hover:border-line',
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                disabled={o.disabled}
                onChange={() => void helpers.setValue(o.value)}
                onBlur={field.onBlur}
                className="sr-only"
              />
              <span
                className={cn(
                  'mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-2',
                  checked ? 'border-brand' : 'border-line-strong',
                )}
                aria-hidden
              >
                {checked && <span className="size-2 rounded-full bg-brand" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm font-extrabold">
                  {o.label}
                  {o.aside}
                </span>
                {o.description && (
                  <span className="mt-0.5 block text-[13px] text-muted">{o.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p
          id={errorId}
          className="mt-1.5 flex items-start gap-1.5 text-[13px] font-bold text-danger-ink"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </fieldset>
  );
}

import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { ILLUSTRATIONS } from '../../lib/illustrations';
import type { IllustrationName } from '../../lib/illustrations';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} aria-hidden />;
}

/** Fixed width and height on every image, so nothing jumps while it loads. */
export function Illustration({
  name,
  size = 160,
  className,
  alt = '',
  eager = false,
  float = false,
}: {
  name: IllustrationName;
  size?: number;
  className?: string;
  alt?: string;
  eager?: boolean;
  float?: boolean;
}) {
  return (
    <img
      src={ILLUSTRATIONS[name]}
      alt={alt}
      width={size}
      height={size}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      className={cn(
        'h-auto object-contain drop-shadow-[0_14px_22px_rgb(79_70_229_/_0.18)] select-none dark:drop-shadow-[0_14px_26px_rgb(0_0_0_/_0.45)]',
        float && 'motion-safe:animate-float',
        className,
      )}
      style={{ width: size }}
    />
  );
}

export function EmptyState({
  illustration,
  title,
  description,
  action,
  className,
  size = 150,
}: {
  illustration: IllustrationName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  size?: number;
}) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-10 text-center', className)}>
      <Illustration name={illustration} size={size} float />
      <h3 className="mt-4 text-lg font-extrabold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block size-5 animate-spin rounded-full border-2 border-brand/25 border-t-brand',
        className,
      )}
    />
  );
}

export function ProgressBar({
  value,
  max,
  className,
  label,
}: {
  value: number;
  max: number | null;
  className?: string;
  label?: string;
}) {
  const pct = max === null ? 8 : max === 0 ? 100 : Math.min(100, (value / max) * 100);
  const tone =
    max === null
      ? 'bg-brand-gradient'
      : pct >= 100
        ? 'bg-gradient-to-r from-red-500 to-red-600'
        : pct >= 80
          ? 'bg-gradient-to-r from-amber-400 to-orange-500'
          : 'bg-brand-gradient';
  return (
    <div
      className={cn('h-2.5 overflow-hidden rounded-full bg-surface-2', className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max ?? undefined}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-out', tone)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Avatar({
  name,
  className,
  online,
}: {
  name: string;
  className?: string;
  online?: boolean;
}) {
  const palette = [
    'from-indigo-500 to-violet-500',
    'from-sky-500 to-indigo-500',
    'from-amber-500 to-rose-500',
    'from-emerald-500 to-sky-500',
    'from-pink-500 to-violet-500',
  ];
  const hash = [...name].reduce((n, c) => n + c.charCodeAt(0), 0);
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={cn(
        'relative inline-grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[13px] font-black text-white',
        palette[hash % palette.length],
        className,
      )}
      aria-hidden
    >
      {letters}
      {online && (
        <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface bg-success" />
      )}
    </span>
  );
}

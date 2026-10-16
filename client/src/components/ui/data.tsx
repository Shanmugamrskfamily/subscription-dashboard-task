import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { percentChange } from '../../lib/format';
import { Card } from './card';
import { Skeleton } from './feedback';

/** Numbers count up when they come into view (instantly for reduced-motion users). */
export function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setShown,
    });
    return () => controls.stop();
  }, [inView, value, reduce]);
  return (
    <span ref={ref} className={cn('num', className)}>
      {format(reduce ? value : shown)}
    </span>
  );
}

export function Delta({
  value,
  previous,
  invert = false,
  suffix = '',
}: {
  value: number;
  previous: number;
  invert?: boolean;
  suffix?: string;
}) {
  const change = percentChange(value, previous);
  if (change === null)
    return <span className="text-xs font-extrabold text-success-ink">New this period</span>;
  const good = invert ? change <= 0 : change >= 0;
  const Icon = change >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-extrabold',
        good ? 'text-success-ink' : 'text-danger-ink',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {change > 0 ? '+' : ''}
      {change}%{suffix}
      <span className="font-bold text-muted">vs previous</span>
    </span>
  );
}

export function KpiCard({
  label,
  icon,
  tone = 'brand',
  children,
  footer,
  className,
  onClick,
}: {
  label: string;
  icon?: ReactNode;
  tone?: 'brand' | 'sky' | 'success' | 'warning' | 'danger' | 'violet';
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const tones = {
    brand: 'bg-brand-soft text-brand-ink',
    sky: 'bg-info-soft text-info-ink',
    success: 'bg-success-soft text-success-ink',
    warning: 'bg-warning-soft text-warning-ink',
    danger: 'bg-danger-soft text-danger-ink',
    violet: 'bg-[color-mix(in_srgb,var(--violet)_14%,transparent)] text-violet',
  };
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-extrabold text-muted">{label}</span>
        {icon && (
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-[18px]',
              tones[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 text-[26px] leading-none font-black tracking-tight sm:text-[28px]">
        {children}
      </div>
      {footer && <div className="mt-2.5">{footer}</div>}
    </>
  );
  return onClick ? (
    <Card
      interactive
      className={cn('cursor-pointer p-4 text-left sm:p-5', className)}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {body}
    </Card>
  ) : (
    <Card className={cn('p-4 sm:p-5', className)}>{body}</Card>
  );
}

export function KpiSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <div className="flex justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-9 rounded-xl" />
      </div>
      <Skeleton className="mt-3 h-7 w-28" />
      <Skeleton className="mt-3 h-3 w-32" />
    </Card>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Hidden below this breakpoint in table mode (column priority). */
  hideBelow?: 'md' | 'lg' | 'xl';
  align?: 'left' | 'right';
  sort?: string;
}

/**
 * One component, two layouts: a real <table> from 640 px, stacked cards below that,
 * built from the same column definitions.
 */
export function ResponsiveTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  loading,
  empty,
  sort,
  onSort,
  cardTitle,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  sort?: string;
  onSort?: (sort: string) => void;
  cardTitle?: (row: T) => ReactNode;
}) {
  const hide = {
    md: 'hidden md:table-cell',
    lg: 'hidden lg:table-cell',
    xl: 'hidden xl:table-cell',
  };
  if (loading) {
    return (
      <div className="space-y-2.5" aria-busy>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (!rows.length) return <>{empty}</>;

  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.replace(/^-/, '') === c.sort;
                const dir = active
                  ? sort?.startsWith('-')
                    ? 'descending'
                    : 'ascending'
                  : undefined;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={dir ?? (c.sort ? 'none' : undefined)}
                    className={cn(
                      'border-b border-line px-3 py-2.5 text-xs font-black tracking-wider whitespace-nowrap text-subtle uppercase',
                      c.align === 'right' ? 'text-right' : 'text-left',
                      c.hideBelow && hide[c.hideBelow],
                    )}
                  >
                    {c.sort && onSort ? (
                      <button
                        type="button"
                        className="cursor-pointer uppercase hover:text-ink"
                        onClick={() =>
                          onSort(
                            active && !sort?.startsWith('-') ? `-${c.sort}` : (c.sort as string),
                          )
                        }
                      >
                        {c.header} {active ? (sort?.startsWith('-') ? '↓' : '↑') : ''}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-line last:border-0',
                  onRowClick && 'cursor-pointer transition-colors hover:bg-surface-2',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-3 py-3 align-middle',
                      c.align === 'right' && 'text-right',
                      c.hideBelow && hide[c.hideBelow],
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2.5 sm:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)}>
            <div
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
              className={cn(
                'rounded-xl border border-line bg-surface p-3.5',
                onRowClick && 'cursor-pointer active:bg-surface-2',
              )}
            >
              {cardTitle && <div className="mb-2">{cardTitle(row)}</div>}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                {columns
                  .filter((c) => !cardTitle || c.key !== columns[0]?.key)
                  .map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[11px] font-black tracking-wider text-subtle uppercase">
                        {c.header}
                      </dt>
                      <dd className="mt-0.5 truncate">{c.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1)
    return (
      <p className="mt-4 text-sm text-muted">
        {total} result{total === 1 ? '' : 's'}
      </p>
    );
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-sm text-muted">
        Page <b className="text-ink">{page}</b> of {totalPages} · {total} results
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="grid size-10 cursor-pointer place-items-center rounded-xl border border-line bg-surface hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          className="grid size-10 cursor-pointer place-items-center rounded-xl border border-line bg-surface hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}

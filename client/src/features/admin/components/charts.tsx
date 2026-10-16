import type { AdminRange, AdminStatsDto, DisplayStatus } from '@planpilot/shared';
import { motion, useReducedMotion } from 'motion/react';
import { useId } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '../../../lib/cn';
import { formatInr, formatInrCompact, formatNumber } from '../../../lib/format';
import { useIsPhone } from './hooks';

type Point = AdminStatsDto['series'][number];
type PlanSlice = AdminStatsDto['planMix'][number] & { fill: string };

const dayShort = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const dayLong = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const monthShort = new Intl.DateTimeFormat('en-IN', { month: 'short' });
const monthLong = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

/** Series keys are `YYYY-MM-DD` (or `YYYY-MM` for 12 months) in Indian time; read them as local dates. */
function parseBucket(key: string) {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function bucketLabel(key: string, range: AdminRange, long = false) {
  const date = parseBucket(key);
  if (range === '12m') return (long ? monthLong : monthShort).format(date);
  return (long ? dayLong : dayShort).format(date);
}

/** SVG ids from useId contain characters `url(#…)` can't reference. */
const useSvgId = (prefix: string) => `${prefix}-${useId().replace(/[^\w-]/g, '')}`;

const axisTick = { fill: 'var(--subtle)', fontSize: 12, fontWeight: 700 };

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} aria-hidden />
      <dt className="text-muted">{label}</dt>
      <dd className="num ml-auto pl-4 font-extrabold">{value}</dd>
    </div>
  );
}

function RevenueTooltip({
  active,
  point,
  range,
}: {
  active?: boolean;
  point?: Point;
  range: AdminRange;
}) {
  if (!active || !point) return null;
  return (
    <div className="min-w-48 rounded-xl border border-line bg-surface px-3.5 py-3 text-[13px] shadow-pop">
      <p className="font-extrabold">{bucketLabel(point.date, range, true)}</p>
      <dl className="mt-2 space-y-1.5">
        <TooltipRow color="var(--chart-1)" label="Revenue" value={formatInr(point.revenue)} />
        <TooltipRow
          color="var(--chart-2)"
          label="New subscriptions"
          value={formatNumber(point.newSubscriptions)}
        />
        <TooltipRow
          color="var(--line-strong)"
          label="Sign-ups"
          value={formatNumber(point.signups)}
        />
      </dl>
    </div>
  );
}

/** Revenue as an area, new subscriptions as bars on their own scale underneath. */
export function RevenueChart({ series, range }: { series: Point[]; range: AdminRange }) {
  const phone = useIsPhone();
  const reduce = useReducedMotion();
  const fillId = useSvgId('revenue');
  return (
    <div className="h-[240px] sm:h-[290px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: phone ? 4 : 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => bucketLabel(value, range)}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            minTickGap={phone ? 36 : 20}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="revenue"
            hide={phone}
            width={58}
            tickFormatter={(value: number) => formatInrCompact(value)}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            tickCount={4}
          />
          {/* Extra headroom keeps the bars in the lower part, under the revenue line. */}
          <YAxis
            yAxisId="subs"
            orientation="right"
            hide
            allowDecimals={false}
            domain={[0, (max: number) => Math.max(4, Math.ceil(max * 2.4))]}
          />
          <Tooltip
            cursor={{ fill: 'var(--chart-grid)' }}
            content={({ active, payload }) => (
              <RevenueTooltip
                active={active}
                point={payload?.[0]?.payload as Point | undefined}
                range={range}
              />
            )}
          />
          <Bar
            yAxisId="subs"
            dataKey="newSubscriptions"
            name="New subscriptions"
            fill="var(--chart-2)"
            radius={[4, 4, 0, 0]}
            maxBarSize={14}
            isAnimationActive={!reduce}
          />
          <Area
            yAxisId="revenue"
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="var(--chart-1)"
            strokeWidth={3}
            fill={`url(#${fillId})`}
            activeDot={{ r: 5, fill: 'var(--surface)', stroke: 'var(--chart-1)', strokeWidth: 3 }}
            isAnimationActive={!reduce}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The small white trend line inside the MRR hero tile. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const reduce = useReducedMotion();
  const fillId = useSvgId('spark');
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="h-full w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          accessibilityLayer={false}
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#fff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area
            type="monotone"
            dataKey="v"
            stroke="#fff"
            strokeWidth={3}
            fill={`url(#${fillId})`}
            dot={false}
            activeDot={false}
            isAnimationActive={!reduce}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- plan mix ----------

const PLAN_COLOR: Record<string, string> = {
  pro: 'var(--chart-1)',
  starter: 'var(--chart-2)',
  business: 'var(--chart-3)',
  'pro-annual': 'var(--chart-4)',
};
const EXTRA_COLORS = ['var(--chart-5)', 'var(--chart-3)', 'var(--chart-2)', 'var(--chart-4)'];

/** Same colour for a plan everywhere, so the legend and the slices always agree. */
export const planColor = (slug: string, index: number) =>
  PLAN_COLOR[slug] ?? EXTRA_COLORS[index % EXTRA_COLORS.length] ?? 'var(--chart-5)';

const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

function PlanTooltip({
  active,
  slice,
  total,
}: {
  active?: boolean;
  slice?: PlanSlice;
  total: number;
}) {
  if (!active || !slice) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] shadow-pop">
      <p className="flex items-center gap-2 font-extrabold">
        <span className="size-2.5 rounded-[3px]" style={{ background: slice.fill }} aria-hidden />
        {slice.name}
      </p>
      <p className="mt-0.5 text-muted">
        <b className="num text-ink">{formatNumber(slice.count)}</b> active ·{' '}
        {percent(slice.count, total)}%
      </p>
    </div>
  );
}

/** Donut of active subscriptions by plan. A slice or legend row opens the filtered table. */
export function PlanMixChart({
  planMix,
  onSelect,
}: {
  planMix: AdminStatsDto['planMix'];
  onSelect: (planId: string) => void;
}) {
  const reduce = useReducedMotion();
  const slices: PlanSlice[] = planMix
    .filter((p) => p.count > 0)
    .map((p, i) => ({ ...p, fill: planColor(p.slug, i) }));
  const total = slices.reduce((sum, p) => sum + p.count, 0);
  if (!total) {
    return (
      <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
        No active subscriptions yet. The plan mix appears once customers subscribe.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 @[19rem]:flex-row @[19rem]:gap-5">
      <div className="relative size-[168px] shrink-0">
        <PieChart width={168} height={168}>
          <Pie
            data={slices}
            dataKey="count"
            nameKey="name"
            innerRadius={54}
            outerRadius={80}
            paddingAngle={slices.length > 1 ? 2 : 0}
            cornerRadius={4}
            stroke="var(--surface)"
            strokeWidth={2}
            className="cursor-pointer outline-none"
            isAnimationActive={!reduce}
            onClick={(_, index) => {
              const slice = slices[index];
              if (slice) onSelect(slice.planId);
            }}
          />
          <Tooltip
            allowEscapeViewBox={{ x: true, y: true }}
            wrapperStyle={{ zIndex: 10 }}
            content={({ active, payload }) => (
              <PlanTooltip
                active={active}
                slice={payload?.[0]?.payload as PlanSlice | undefined}
                total={total}
              />
            )}
          />
        </PieChart>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="num text-2xl leading-none font-black">{formatNumber(total)}</p>
            <p className="mt-1 text-xs font-bold text-muted">active</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1">
        {slices.map((p) => (
          <li key={p.planId}>
            <button
              type="button"
              onClick={() => onSelect(p.planId)}
              className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 text-left text-sm font-bold transition-colors hover:bg-surface-2"
              aria-label={`${p.name}: ${p.count} active. Show these subscriptions`}
            >
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: p.fill }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="num text-xs text-subtle">{percent(p.count, total)}%</span>
              <b className="num w-9 text-right">{formatNumber(p.count)}</b>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- status breakdown ----------

const STATUSES: { key: DisplayStatus; label: string; bar: string }[] = [
  { key: 'active', label: 'Active', bar: 'bg-success' },
  { key: 'expired', label: 'Expired', bar: 'bg-danger' },
  { key: 'cancelled', label: 'Cancelled', bar: 'bg-warning' },
  { key: 'none', label: 'No plan', bar: 'bg-subtle' },
];

/** Customers by their latest subscription state, as one stacked bar with a clickable legend. */
export function StatusBreakdown({
  breakdown,
  onSelect,
}: {
  breakdown: AdminStatsDto['statusBreakdown'];
  onSelect: (status: DisplayStatus) => void;
}) {
  const reduce = useReducedMotion();
  const total = STATUSES.reduce((sum, s) => sum + breakdown[s.key], 0);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[13px] font-extrabold text-muted">
        <span>Status breakdown</span>
        <span className="num">{formatNumber(total)} customers</span>
      </div>
      <motion.div
        className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-2"
        style={{ originX: 0 }}
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        aria-hidden
      >
        {STATUSES.map((s) =>
          breakdown[s.key] > 0 ? (
            <button
              key={s.key}
              type="button"
              tabIndex={-1}
              title={`${s.label}: ${formatNumber(breakdown[s.key])}`}
              onClick={() => onSelect(s.key)}
              style={{ flexGrow: breakdown[s.key] }}
              className={cn(
                'h-full min-w-1.5 basis-0 cursor-pointer transition-[filter] hover:brightness-110',
                s.bar,
              )}
            />
          ) : null,
        )}
      </motion.div>
      <ul className="mt-2 grid grid-cols-2 gap-x-2">
        {STATUSES.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-[13px] font-bold transition-colors hover:bg-surface-2"
              aria-label={`${s.label}: ${breakdown[s.key]} customers. Show them`}
            >
              <span className={cn('size-2.5 shrink-0 rounded-full', s.bar)} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="num text-muted">{formatNumber(breakdown[s.key])}</span>
              <span className="num w-9 text-right text-xs text-subtle">
                {percent(breakdown[s.key], total)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

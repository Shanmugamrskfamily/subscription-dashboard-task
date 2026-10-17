import {
  CHANGE_TYPES,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  SUBSCRIPTION_SORTS,
  SUBSCRIPTION_STATUSES,
} from '@planpilot/shared';
import type { AdminSubscriptionRow, SubscriptionDto } from '@planpilot/shared';
import { SlidersHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';
import { PageHeader } from '../../components/layout/AdminShell';
import { Badge, CHANGE_LABEL, PlanPill, StatusBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Pagination, ResponsiveTable } from '../../components/ui/data';
import type { Column } from '../../components/ui/data';
import { Modal } from '../../components/ui/dialog';
import { EmptyState } from '../../components/ui/feedback';
import { cn } from '../../lib/cn';
import { formatDate, formatInr, formatNumber, plural } from '../../lib/format';
import { useAdminPlansQuery, useAdminSubscriptionsQuery } from './adminApi';
import type { SubscriptionFilters } from './adminApi';
import {
  ErrorCard,
  ExportCsvButton,
  FilterChips,
  FilterDate,
  FilterSelect,
  PersonCell,
  SearchField,
} from './components/common';
import type { ActiveFilter } from './components/common';
import { SubscriptionDrawer } from './components/SubscriptionDrawer';
import { useIsPhone, useSearchParamInput, useUrlParams } from './components/hooks';

type Sort = (typeof SUBSCRIPTION_SORTS)[number];
const DEFAULT_SORT: Sort = '-createdAt';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];
const CHANGE_OPTIONS = [
  { value: 'all', label: 'All types' },
  ...CHANGE_TYPES.map((t) => ({ value: t, label: CHANGE_LABEL[t] })),
];
const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: '-createdAt', label: 'Newest first' },
  { value: 'createdAt', label: 'Oldest first' },
  { value: 'endDate', label: 'Ending soonest' },
  { value: '-endDate', label: 'Ending latest' },
  { value: '-startDate', label: 'Started most recently' },
  { value: 'startDate', label: 'Started earliest' },
  { value: '-amountPaid', label: 'Highest amount' },
  { value: 'amountPaid', label: 'Lowest amount' },
];
const PAGE_SIZE_OPTIONS = PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} rows` }));

const pick = <T extends string, F extends string>(
  value: string,
  allowed: readonly T[],
  fallback: F,
): T | F => ((allowed as readonly string[]).includes(value) ? (value as T) : fallback);
const isDateInput = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Reads the filters from the URL, ignoring anything malformed so the API never sees it. */
function useFilters() {
  const { get, update } = useUrlParams();
  const pageSize = Number(get('pageSize'));
  return {
    update,
    filters: {
      search: get('search').slice(0, 80),
      status: pick(get('status'), SUBSCRIPTION_STATUSES, 'all'),
      planId: /^[a-f\d]{24}$/i.test(get('planId')) ? get('planId') : '',
      changeType: pick(get('changeType'), CHANGE_TYPES, 'all'),
      from: isDateInput(get('from')) ? get('from') : '',
      to: isDateInput(get('to')) ? get('to') : '',
      sort: pick(get('sort'), SUBSCRIPTION_SORTS, DEFAULT_SORT),
      page: Math.max(1, Math.floor(Number(get('page'))) || 1),
      pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
    },
  };
}

type Filters = ReturnType<typeof useFilters>['filters'];

const toApi = (f: Filters): SubscriptionFilters => ({
  page: f.page,
  pageSize: f.pageSize,
  search: f.search,
  status: f.status === 'all' ? undefined : f.status,
  planId: f.planId,
  changeType: f.changeType === 'all' ? undefined : f.changeType,
  from: f.from,
  to: f.to,
  sort: f.sort,
});

const columns: Column<AdminSubscriptionRow>[] = [
  {
    key: 'customer',
    header: 'Customer',
    cell: (r) => <PersonCell name={r.user.name} email={r.user.email} />,
  },
  { key: 'plan', header: 'Plan', cell: (r) => <PlanPill slug={r.plan.slug} name={r.plan.name} /> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  {
    key: 'type',
    header: 'Type',
    hideBelow: 'lg',
    cell: (r) => <span className="font-bold text-muted">{CHANGE_LABEL[r.changeType]}</span>,
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    sort: 'amountPaid',
    cell: (r) => <b className="num">{formatInr(r.amountPaid)}</b>,
  },
  {
    key: 'start',
    header: 'Started',
    hideBelow: 'md',
    sort: 'startDate',
    cell: (r) => <span className="num whitespace-nowrap">{formatDate(r.startDate)}</span>,
  },
  {
    key: 'end',
    header: 'Ends',
    sort: 'endDate',
    cell: (r) => <span className="num whitespace-nowrap">{formatDate(r.endDate)}</span>,
  },
  {
    key: 'created',
    header: 'Created',
    hideBelow: 'xl',
    sort: 'createdAt',
    cell: (r) => (
      <span className="num whitespace-nowrap text-muted">{formatDate(r.createdAt)}</span>
    ),
  },
];

export default function SubscriptionsPage() {
  const { filters: f, update } = useFilters();
  const phone = useIsPhone();
  const plans = useAdminPlansQuery();
  const query = useAdminSubscriptionsQuery(toApi(f));
  const [search, setSearch] = useSearchParamInput(f.search, (value) =>
    update({ search: value || null, page: null }),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<AdminSubscriptionRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const setFilter = (patch: Record<string, string | null>) => update({ ...patch, page: null });
  const planName = (id: string) => plans.data?.find((p) => p.id === id)?.name ?? 'Selected plan';

  const chips: ActiveFilter[] = [
    f.search && {
      key: 'search',
      name: 'Search',
      value: `“${f.search}”`,
      onRemove: () => {
        setSearch('');
        setFilter({ search: null });
      },
    },
    f.status !== 'all' && {
      key: 'status',
      name: 'Status',
      value: STATUS_OPTIONS.find((o) => o.value === f.status)?.label ?? f.status,
      onRemove: () => setFilter({ status: null }),
    },
    f.planId && {
      key: 'plan',
      name: 'Plan',
      value: planName(f.planId),
      onRemove: () => setFilter({ planId: null }),
    },
    f.changeType !== 'all' && {
      key: 'type',
      name: 'Type',
      value: CHANGE_LABEL[f.changeType],
      onRemove: () => setFilter({ changeType: null }),
    },
    f.from && {
      key: 'from',
      name: 'Started from',
      value: formatDate(`${f.from}T00:00:00`),
      onRemove: () => setFilter({ from: null }),
    },
    f.to && {
      key: 'to',
      name: 'Started by',
      value: formatDate(`${f.to}T00:00:00`),
      onRemove: () => setFilter({ to: null }),
    },
  ].filter((c): c is ActiveFilter => Boolean(c));

  const clearAll = () => {
    setSearch('');
    setFilter({ search: null, status: null, planId: null, changeType: null, from: null, to: null });
  };

  const exportFilters: SubscriptionFilters = { ...toApi(f), page: undefined, pageSize: undefined };
  const live = selected ? (query.data?.items.find((r) => r.id === selected.id) ?? selected) : null;
  const total = query.data?.meta.total ?? 0;
  const busy = query.isFetching && !query.isLoading;

  const openRow = (row: AdminSubscriptionRow) => {
    setSelected(row);
    setDrawerOpen(true);
  };
  const applyUpdate = (sub: SubscriptionDto) =>
    setSelected((prev) => (prev ? { ...prev, status: sub.status, endDate: sub.endDate } : prev));
  const goToPage = (page: number) => {
    update({ page: page === 1 ? null : page });
    tableRef.current?.scrollIntoView({ block: 'start' });
  };

  const filterFields = (
    <SubscriptionFilterFields
      filters={f}
      plans={plans.data ?? []}
      onChange={setFilter}
      showSort={phone}
      onSort={(sort) => update({ sort: sort === DEFAULT_SORT ? null : sort, page: null })}
    />
  );

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Every plan your customers have had. Filter, sort, export and manage them."
        actions={<ExportCsvButton filters={exportFilters} className="w-full sm:w-auto" />}
      />

      <Card className="p-4 sm:p-5">
        <div className="flex items-end gap-2">
          <SearchField
            label="Search"
            placeholder="Customer name or email"
            value={search}
            onChange={setSearch}
            className="flex-1"
          />
          {phone && (
            <Button
              variant="outline"
              onClick={() => setFiltersOpen(true)}
              aria-label={`Filters${chips.length ? `, ${chips.length} active` : ''}`}
            >
              <SlidersHorizontal aria-hidden /> Filters
              {chips.length > 0 && (
                <Badge tone="brand" className="num px-2">
                  {chips.length}
                </Badge>
              )}
            </Button>
          )}
        </div>
        {!phone && <div className="mt-3">{filterFields}</div>}
        {chips.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <FilterChips filters={chips} onClearAll={clearAll} />
          </div>
        )}
      </Card>

      <div
        ref={tableRef}
        className="mt-5 mb-3 flex scroll-mt-20 flex-wrap items-center justify-between gap-3"
      >
        <p className="text-sm text-muted" aria-live="polite">
          {query.data ? (
            <>
              <b className="num text-ink">{formatNumber(total)}</b>{' '}
              {total === 1 ? 'subscription' : 'subscriptions'}
              {chips.length > 0 && ' match your filters'}
            </>
          ) : (
            'Loading subscriptions…'
          )}
        </p>
        <label className="flex items-center gap-2 text-sm font-bold text-muted">
          Show
          <select
            value={String(f.pageSize)}
            onChange={(e) => {
              const size = Number(e.target.value);
              update({ pageSize: size === DEFAULT_PAGE_SIZE ? null : size, page: null });
            }}
            className="h-11 cursor-pointer rounded-xl border-[1.5px] border-line bg-surface px-3 font-bold text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 sm:h-9 dark:[color-scheme:dark]"
          >
            {PAGE_SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {query.isError && !query.data ? (
        <ErrorCard
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          title="We couldn't load the subscriptions"
        />
      ) : (
        <Card
          className={cn(
            'p-0 transition-opacity max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none sm:p-3',
            busy && 'opacity-60',
          )}
          aria-busy={busy}
        >
          <ResponsiveTable
            rows={query.data?.items ?? []}
            columns={columns}
            rowKey={(r) => r.id}
            loading={query.isLoading}
            onRowClick={openRow}
            sort={f.sort}
            onSort={(sort) => update({ sort: sort === DEFAULT_SORT ? null : sort, page: null })}
            cardTitle={(r) => <PersonCell name={r.user.name} email={r.user.email} />}
            empty={
              f.page > 1 && total > 0 ? (
                <EmptyState
                  illustration="lostCompass"
                  title="This page is empty"
                  description="There are fewer results now. Head back to the first page."
                  action={<Button onClick={() => goToPage(1)}>Go to page 1</Button>}
                />
              ) : chips.length ? (
                <EmptyState
                  illustration="noResults"
                  title="No subscriptions match these filters"
                  description="Try a different search, or clear the filters to see everything."
                  action={
                    <Button variant="outline" onClick={clearAll}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  illustration="emptyBox"
                  title="No subscriptions yet"
                  description="When customers subscribe, every plan they've had shows up here."
                />
              )
            }
          />
          {query.data && query.data.items.length > 0 && (
            <div className="px-1 pb-1 sm:px-2">
              <Pagination
                page={query.data.meta.page}
                totalPages={query.data.meta.totalPages}
                total={query.data.meta.total}
                onPage={goToPage}
              />
            </div>
          )}
        </Card>
      )}

      <Modal
        open={filtersOpen && phone}
        onOpenChange={setFiltersOpen}
        title="Filters"
        description="Changes apply straight away."
        footer={
          <>
            <Button variant="outline" onClick={clearAll} disabled={!chips.length}>
              Clear all
            </Button>
            <Button onClick={() => setFiltersOpen(false)} loading={query.isFetching}>
              Show {plural(total, 'result')}
            </Button>
          </>
        }
      >
        {filterFields}
      </Modal>

      <SubscriptionDrawer
        row={live}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onUpdated={applyUpdate}
      />
    </>
  );
}

function SubscriptionFilterFields({
  filters: f,
  plans,
  onChange,
  showSort,
  onSort,
}: {
  filters: Filters;
  plans: { id: string; name: string; isActive: boolean }[];
  onChange: (patch: Record<string, string | null>) => void;
  showSort: boolean;
  onSort: (sort: string) => void;
}) {
  const planOptions = [
    { value: '', label: 'All plans' },
    ...plans.map((p) => ({ value: p.id, label: p.isActive ? p.name : `${p.name} (archived)` })),
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <FilterSelect
        label="Status"
        value={f.status}
        options={STATUS_OPTIONS}
        onChange={(v) => onChange({ status: v === 'all' ? null : v })}
      />
      <FilterSelect
        label="Plan"
        value={f.planId}
        options={planOptions}
        onChange={(v) => onChange({ planId: v || null })}
      />
      <FilterSelect
        label="Type"
        value={f.changeType}
        options={CHANGE_OPTIONS}
        onChange={(v) => onChange({ changeType: v === 'all' ? null : v })}
      />
      <FilterDate
        label="Started from"
        value={f.from}
        max={f.to || undefined}
        // Keep the range valid: a start after the end clears the end.
        onChange={(v) =>
          onChange({ from: v || null, ...(v && f.to && v > f.to ? { to: null } : {}) })
        }
      />
      <FilterDate
        label="Started by"
        value={f.to}
        min={f.from || undefined}
        onChange={(v) =>
          onChange({ to: v || null, ...(v && f.from && v < f.from ? { from: null } : {}) })
        }
      />
      {showSort && (
        <FilterSelect label="Sort by" value={f.sort} options={SORT_OPTIONS} onChange={onSort} />
      )}
    </div>
  );
}

import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  ROLES,
  SUBSCRIPTION_STATUSES,
  USER_SORTS,
  USER_STATUSES,
} from '@planpilot/shared';
import type { AdminUserRow } from '@planpilot/shared';
import { SlidersHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';
import { PageHeader } from '../../components/layout/AdminShell';
import { AccountBadge, Badge, PlanPill, StatusBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Pagination, ResponsiveTable } from '../../components/ui/data';
import type { Column } from '../../components/ui/data';
import { Modal } from '../../components/ui/dialog';
import { EmptyState } from '../../components/ui/feedback';
import { cn } from '../../lib/cn';
import { formatDate, formatNumber, formatRelative, plural } from '../../lib/format';
import { useAdminUsersQuery } from './adminApi';
import type { UserFilters } from './adminApi';
import { ErrorCard, FilterChips, FilterSelect, PersonCell, SearchField } from './components/common';
import type { ActiveFilter } from './components/common';
import { UserDrawer } from './components/UserDrawer';
import { useIsPhone, useSearchParamInput, useUrlParams } from './components/hooks';
import { usageLabel } from './components/utils';

type Sort = (typeof USER_SORTS)[number];
const DEFAULT_SORT: Sort = '-createdAt';

const ROLE_OPTIONS = [
  { value: 'all', label: 'All roles' },
  { value: 'user', label: 'Customers' },
  { value: 'admin', label: 'Admins' },
];
const STATUS_OPTIONS = [
  { value: 'all', label: 'Any account status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'blocked', label: 'Blocked' },
];
const SUBSCRIPTION_OPTIONS = [
  { value: 'all', label: 'Any subscription' },
  { value: 'active', label: 'Active plan' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'none', label: 'Never subscribed' },
];
const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: '-createdAt', label: 'Newest first' },
  { value: 'createdAt', label: 'Oldest first' },
  { value: 'name', label: 'Name A to Z' },
  { value: '-name', label: 'Name Z to A' },
  { value: '-lastSeenAt', label: 'Recently active' },
];
const PAGE_SIZE_OPTIONS = PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} rows` }));

const pick = <T extends string, F extends string>(
  value: string,
  allowed: readonly T[],
  fallback: F,
): T | F => ((allowed as readonly string[]).includes(value) ? (value as T) : fallback);
const label = (options: { value: string; label: string }[], value: string) =>
  options.find((o) => o.value === value)?.label ?? value;

function useFilters() {
  const { get, update } = useUrlParams();
  const pageSize = Number(get('pageSize'));
  const user = get('user');
  return {
    update,
    userParam: /^[a-f\d]{24}$/i.test(user) ? user : '',
    filters: {
      search: get('search').slice(0, 80),
      role: pick(get('role'), ROLES, 'all'),
      status: pick(get('status'), USER_STATUSES, 'all'),
      subscription: pick(get('subscription'), [...SUBSCRIPTION_STATUSES, 'none'] as const, 'all'),
      sort: pick(get('sort'), USER_SORTS, DEFAULT_SORT),
      page: Math.max(1, Math.floor(Number(get('page'))) || 1),
      pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
    },
  };
}

type Filters = ReturnType<typeof useFilters>['filters'];

const toApi = (f: Filters): UserFilters => ({
  page: f.page,
  pageSize: f.pageSize,
  search: f.search,
  role: f.role === 'all' ? undefined : f.role,
  status: f.status === 'all' ? undefined : f.status,
  subscription: f.subscription === 'all' ? undefined : f.subscription,
  sort: f.sort,
});

/** "Last seen" only sorts most-recent-first, so both header clicks map to that. */
const normaliseSort = (sort: string): Sort =>
  pick(sort === 'lastSeenAt' ? '-lastSeenAt' : sort, USER_SORTS, DEFAULT_SORT);

function UserCell({ user }: { user: AdminUserRow }) {
  return (
    <PersonCell
      name={user.name}
      email={user.email}
      online={user.online}
      badge={user.role === 'admin' ? <Badge tone="brand">Admin</Badge> : undefined}
    />
  );
}

const columns: Column<AdminUserRow>[] = [
  { key: 'user', header: 'User', sort: 'name', cell: (u) => <UserCell user={u} /> },
  { key: 'account', header: 'Account', cell: (u) => <AccountBadge status={u.status} /> },
  {
    key: 'plan',
    header: 'Plan',
    cell: (u) =>
      u.currentPlan ? (
        <PlanPill slug={u.currentPlan.slug} name={u.currentPlan.name} />
      ) : (
        <span className="text-sm text-subtle">No plan</span>
      ),
  },
  {
    key: 'subscription',
    header: 'Subscription',
    hideBelow: 'md',
    cell: (u) => <StatusBadge status={u.subscriptionStatus} />,
  },
  {
    key: 'usage',
    header: 'Usage',
    hideBelow: 'xl',
    cell: (u) => <span className="whitespace-nowrap text-muted">{usageLabel(u.usage)}</span>,
  },
  {
    key: 'seen',
    header: 'Last seen',
    hideBelow: 'lg',
    sort: 'lastSeenAt',
    cell: (u) =>
      u.online ? (
        <span className="font-extrabold whitespace-nowrap text-success-ink">Online now</span>
      ) : (
        <span className="whitespace-nowrap text-muted">
          {u.lastSeenAt ? formatRelative(u.lastSeenAt) : 'Never'}
        </span>
      ),
  },
  {
    key: 'joined',
    header: 'Joined',
    hideBelow: 'lg',
    sort: 'createdAt',
    cell: (u) => <span className="num whitespace-nowrap">{formatDate(u.createdAt)}</span>,
  },
];

export default function UsersPage() {
  const { filters: f, update, userParam } = useFilters();
  const phone = useIsPhone();
  const query = useAdminUsersQuery(toApi(f));
  const [search, setSearch] = useSearchParamInput(f.search, (value) =>
    update({ search: value || null, page: null }),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Keep showing the last person while the drawer slides closed.
  const [drawerUser, setDrawerUser] = useState(userParam);
  if (userParam && userParam !== drawerUser) setDrawerUser(userParam);
  const tableRef = useRef<HTMLDivElement>(null);

  const setFilter = (patch: Record<string, string | null>) => update({ ...patch, page: null });
  const setSort = (sort: string) => {
    const next = normaliseSort(sort);
    update({ sort: next === DEFAULT_SORT ? null : next, page: null });
  };

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
    f.role !== 'all' && {
      key: 'role',
      name: 'Role',
      value: label(ROLE_OPTIONS, f.role),
      onRemove: () => setFilter({ role: null }),
    },
    f.status !== 'all' && {
      key: 'status',
      name: 'Account',
      value: label(STATUS_OPTIONS, f.status),
      onRemove: () => setFilter({ status: null }),
    },
    f.subscription !== 'all' && {
      key: 'subscription',
      name: 'Subscription',
      value: label(SUBSCRIPTION_OPTIONS, f.subscription),
      onRemove: () => setFilter({ subscription: null }),
    },
  ].filter((c): c is ActiveFilter => Boolean(c));

  const clearAll = () => {
    setSearch('');
    setFilter({ search: null, role: null, status: null, subscription: null });
  };
  const goToPage = (page: number) => {
    update({ page: page === 1 ? null : page });
    tableRef.current?.scrollIntoView({ block: 'start' });
  };

  const total = query.data?.meta.total ?? 0;
  const busy = query.isFetching && !query.isLoading;

  const filterFields = (
    <div className={cn('grid gap-3', phone ? 'grid-cols-1' : 'sm:grid-cols-3 xl:grid-cols-4')}>
      <FilterSelect
        label="Role"
        value={f.role}
        options={ROLE_OPTIONS}
        onChange={(v) => setFilter({ role: v === 'all' ? null : v })}
      />
      <FilterSelect
        label="Account status"
        value={f.status}
        options={STATUS_OPTIONS}
        onChange={(v) => setFilter({ status: v === 'all' ? null : v })}
      />
      <FilterSelect
        label="Subscription"
        value={f.subscription}
        options={SUBSCRIPTION_OPTIONS}
        onChange={(v) => setFilter({ subscription: v === 'all' ? null : v })}
      />
      <FilterSelect label="Sort by" value={f.sort} options={SORT_OPTIONS} onChange={setSort} />
    </div>
  );

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with a PlanPilot account. Open a person to manage their plan and access."
      />

      <Card className="p-4 sm:p-5">
        <div className="flex items-end gap-2">
          <SearchField
            label="Search"
            placeholder="Name or email"
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
              {total === 1 ? 'person' : 'people'}
              {chips.length > 0 && ' match your filters'}
            </>
          ) : (
            'Loading people…'
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
          title="We couldn't load the users"
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
            rowKey={(u) => u.id}
            loading={query.isLoading}
            onRowClick={(u) => update({ user: u.id }, { push: true })}
            sort={f.sort}
            onSort={setSort}
            cardTitle={(u) => <UserCell user={u} />}
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
                  title="Nobody matches these filters"
                  description="Try a different name or email, or clear the filters to see everyone."
                  action={
                    <Button variant="outline" onClick={clearAll}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  illustration="emptyBoard"
                  title="No users yet"
                  description="People appear here as soon as they create an account."
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
              Show {plural(total, 'person', 'people')}
            </Button>
          </>
        }
      >
        {filterFields}
      </Modal>

      <UserDrawer
        userId={drawerUser}
        open={Boolean(userParam)}
        onOpenChange={(open) => !open && update({ user: null })}
      />
    </>
  );
}

import type { ActivityDto } from '@planpilot/shared';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/layout/AdminShell';
import { Badge } from '../../components/ui/badge';
import type { Tone } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { EmptyState, Skeleton } from '../../components/ui/feedback';
import { Segmented } from '../../components/ui/menu';
import { formatRelative, plural } from '../../lib/format';
import { useActivityQuery } from './adminApi';
import { ActivityIcon, ActivitySkeleton, describeActivity } from './components/activity';
import type { ActivityCategory } from './components/activity';
import { ErrorCard } from './components/common';
import { useUrlParams } from './components/hooks';
import { dayHeading, formatFullDateTime, toDateInput } from './components/utils';

type Filter = 'all' | ActivityCategory;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'customers', label: 'Customers' },
  { value: 'admin', label: 'Admin' },
  { value: 'security', label: 'Security' },
];
const CATEGORY: Record<ActivityCategory, { label: string; tone: Tone }> = {
  customers: { label: 'Customer', tone: 'info' },
  admin: { label: 'Admin', tone: 'brand' },
  security: { label: 'Security', tone: 'danger' },
};
const isFilter = (value: string): value is Filter => FILTERS.some((f) => f.value === value);

function groupByDay(items: ActivityDto[]) {
  const groups: { key: string; label: string; items: ActivityDto[] }[] = [];
  for (const item of items) {
    const key = toDateInput(item.createdAt);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: dayHeading(item.createdAt), items: [item] });
  }
  return groups;
}

export default function ActivityPage() {
  const { get, update } = useUrlParams();
  const param = get('type');
  const filter: Filter = isFilter(param) ? param : 'all';
  // Not polled: it's an audit trail. Fresh on each visit, and on demand with Refresh.
  const { data, isLoading, isError, error, refetch, isFetching } = useActivityQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });

  const items = (data ?? []).filter(
    (a) => filter === 'all' || describeActivity(a).category === filter,
  );
  const groups = groupByDay(items);
  const filterLabel = FILTERS.find((f) => f.value === filter)?.label.toLowerCase() ?? '';

  return (
    <>
      <PageHeader
        title="Activity"
        description="The latest 50 sign-ups, payments, plan changes and admin actions, newest first."
        actions={
          <Button
            variant="outline"
            onClick={() => void refetch()}
            loading={isFetching && !isLoading}
            className="w-full sm:w-auto"
          >
            {!(isFetching && !isLoading) && <RefreshCw aria-hidden />} Refresh
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Show activity from"
          value={filter}
          onChange={(next) => update({ type: next === 'all' ? null : next })}
          options={FILTERS}
          className="w-full sm:w-auto"
        />
        {data && (
          <p className="text-sm text-muted" aria-live="polite">
            {plural(items.length, 'event')}
            {filter !== 'all' && ` from ${filterLabel}`}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-6" aria-busy aria-label="Loading activity">
          {[5, 3].map((rows, i) => (
            <section key={i}>
              <Skeleton className="mb-3 h-3.5 w-24" />
              <Card>
                <ActivitySkeleton rows={rows} />
              </Card>
            </section>
          ))}
        </div>
      ) : isError && !data ? (
        <ErrorCard
          error={error}
          onRetry={() => void refetch()}
          retrying={isFetching}
          title="We couldn't load the activity"
        />
      ) : !data?.length ? (
        <Card>
          <EmptyState
            illustration="quietBell"
            title="No activity yet"
            description="Sign-ups, payments, plan changes and admin actions show up here as they happen."
          />
        </Card>
      ) : !items.length ? (
        <Card>
          <EmptyState
            illustration="noResults"
            title={`No ${filterLabel} activity`}
            description={`None of the latest ${plural(data.length, 'event')} came from ${filterLabel}.`}
            action={
              <Button variant="outline" onClick={() => update({ type: null })}>
                Show all activity
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`day-${group.key}`}>
              <h2
                id={`day-${group.key}`}
                className="mb-3 text-xs font-black tracking-wider text-subtle uppercase"
              >
                {group.label} <span className="num font-bold">· {group.items.length}</span>
              </h2>
              <Card className="p-4 sm:p-5">
                <ol>
                  {group.items.map((activity, i) => (
                    <TimelineEntry
                      key={activity.id}
                      activity={activity}
                      last={i === group.items.length - 1}
                    />
                  ))}
                </ol>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function TimelineEntry({ activity, last }: { activity: ActivityDto; last: boolean }) {
  const { sentence, reason, category } = describeActivity(activity);
  const tag = CATEGORY[category];
  return (
    <li className="relative flex gap-3.5 pb-5 last:pb-0">
      {!last && (
        <span className="absolute top-11 bottom-1 left-[17.5px] w-px bg-line" aria-hidden />
      )}
      <ActivityIcon activity={activity} />
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-sm text-muted">{sentence}</p>
        {reason && (
          <p className="mt-1.5 border-l-2 border-line-strong pl-2.5 text-[13px] text-muted italic">
            {reason}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <time
            dateTime={activity.createdAt}
            title={formatFullDateTime(activity.createdAt)}
            className="text-xs text-subtle"
          >
            {formatRelative(activity.createdAt)}
          </time>
          <Badge tone={tag.tone} className="px-2 text-[11px]">
            {tag.label}
          </Badge>
        </div>
      </div>
    </li>
  );
}

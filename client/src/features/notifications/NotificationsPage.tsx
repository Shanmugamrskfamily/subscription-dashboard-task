import { CheckCheck, RefreshCw } from 'lucide-react';
import { motion, MotionConfig } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorOf } from '../../api/errors';
import { Page, PageTitle } from '../../components/layout/Page';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Pagination } from '../../components/ui/data';
import { EmptyState, Illustration, Skeleton } from '../../components/ui/feedback';
import { Segmented } from '../../components/ui/menu';
import { cn } from '../../lib/cn';
import { plural } from '../../lib/format';
import { groupByDay } from './groupByDay';
import { NotificationRow } from './NotificationBell';
import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsQuery,
} from './notificationsApi';

type Filter = 'all' | 'unread';

export default function NotificationsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const { data, currentData, isError, error, isFetching, refetch } = useNotificationsQuery(
    { unread: filter === 'unread', page },
    { pollingInterval: 30_000, skipPollingIfUnfocused: true },
  );
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();

  const unread = data?.unread ?? 0;
  const meta = currentData?.meta;

  // Reading the last unread item on a later page empties it; step back to a page that exists.
  const lastPage = Math.max(1, meta?.totalPages ?? 1);
  if (meta && page > lastPage) setPage(lastPage);

  // While another page or filter loads, keep the previous list on screen, dimmed.
  const view = currentData ?? (isFetching ? data : undefined);
  const stale = Boolean(view) && view !== currentData;

  const changeFilter = (next: Filter) => {
    setFilter(next);
    setPage(1);
  };

  const goToPage = (next: number) => {
    setPage(next);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  const readOne = (id: string) => {
    markRead(id)
      .unwrap()
      .catch((e: unknown) => toast.error(errorOf(e)?.message ?? "Couldn't mark that as read."));
  };

  const readAll = async () => {
    try {
      const { updated } = await markAll().unwrap();
      toast.success(
        updated ? `Marked ${plural(updated, 'notification')} as read` : "You're all caught up",
      );
    } catch (e) {
      toast.error(errorOf(e)?.message ?? "Couldn't mark everything as read.");
    }
  };

  let body;
  if (!view) {
    body = isError ? (
      <Card role="alert" className="flex flex-col items-center px-5 py-8 text-center">
        <Illustration name="brokenGear" size={104} />
        <h2 className="mt-3 text-lg font-extrabold">We couldn't load your notifications</h2>
        <p className="mt-1 max-w-sm text-sm text-muted">
          {errorOf(error)?.message ?? 'Something went wrong. Please try again.'}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => void refetch()}>
          <RefreshCw aria-hidden /> Retry
        </Button>
      </Card>
    ) : (
      <ListSkeleton />
    );
  } else if (!view.items.length) {
    body = (
      <Card>
        <EmptyState
          illustration="quietBell"
          title="You're all caught up"
          description={
            filter === 'unread'
              ? "No unread notifications. We'll let you know when something changes."
              : 'Updates about your plan, payments and usage will show up here.'
          }
          action={
            filter === 'unread' ? (
              <Button variant="outline" onClick={() => changeFilter('all')}>
                Show all notifications
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  } else {
    body = (
      <>
        <Card
          className={cn('p-2 transition-opacity duration-200 sm:p-3', stale && 'opacity-60')}
          aria-busy={stale || undefined}
        >
          {groupByDay(view.items).map((group, groupIndex) => (
            <section
              key={group.key}
              aria-labelledby={`day-${group.key}`}
              className={cn(groupIndex > 0 && 'mt-2 border-t border-line pt-2')}
            >
              <h2
                id={`day-${group.key}`}
                className="px-2.5 pt-2 pb-1.5 text-xs font-black tracking-wider text-subtle uppercase"
              >
                {group.label}
              </h2>
              <ul className="space-y-1">
                {group.items.map((n, i) => (
                  <motion.li
                    key={n.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut', delay: Math.min(i, 8) * 0.03 }}
                  >
                    <NotificationRow n={n} onRead={readOne} />
                  </motion.li>
                ))}
              </ul>
            </section>
          ))}
        </Card>
        {meta && (
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            onPage={goToPage}
          />
        )}
      </>
    );
  }

  return (
    <Page title={unread ? `(${unread}) Notifications` : 'Notifications'}>
      <PageTitle
        title="Notifications"
        description={
          unread
            ? `You have ${plural(unread, 'unread notification')}.`
            : 'Plan changes, payments and reminders, all in one place.'
        }
        actions={
          <Button
            variant="outline"
            loading={markingAll}
            disabled={!unread}
            onClick={() => void readAll()}
          >
            {!markingAll && <CheckCheck aria-hidden />} Mark all read
          </Button>
        }
      />
      <div className="mb-4">
        <Segmented<Filter>
          label="Show notifications"
          value={filter}
          onChange={changeFilter}
          className="w-full sm:w-auto [&>button]:min-h-11 sm:[&>button]:min-h-9 sm:[&>button]:px-4"
          options={[
            { value: 'all', label: 'All' },
            {
              value: 'unread',
              label: (
                <>
                  Unread
                  {unread > 0 && (
                    <span className="num ml-1.5 rounded-full bg-brand-soft px-1.5 py-px text-[11px] text-brand-ink">
                      {unread}
                    </span>
                  )}
                </>
              ),
            },
          ]}
        />
      </div>
      <MotionConfig reducedMotion="user">{body}</MotionConfig>
    </Page>
  );
}

function ListSkeleton() {
  return (
    <Card className="p-2 sm:p-3" role="status" aria-label="Loading notifications">
      <Skeleton className="mx-2.5 mt-2 mb-3 h-3 w-16" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3 p-2.5">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2 pt-0.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
      ))}
    </Card>
  );
}

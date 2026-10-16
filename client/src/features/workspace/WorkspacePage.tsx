import type { LimitKey } from '@planpilot/shared';
import { FolderKanban, Lock, Plus, Rocket, UserPlus, Users } from 'lucide-react';
import { motion, MotionConfig } from 'motion/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { AppError } from '../../api/errors';
import { Page, PageTitle } from '../../components/layout/Page';
import { PlanPill } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { KpiCard, KpiSkeleton } from '../../components/ui/data';
import { Illustration, ProgressBar } from '../../components/ui/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/menu';
import { cn } from '../../lib/cn';
import { plural } from '../../lib/format';
import type { IllustrationName } from '../../lib/illustrations';
import { useMySubscriptionQuery } from '../subscription/subscriptionApi';
import { BlockerModal, blockerFrom, NOUNS, usageOf } from './limits';
import type { Blocker, Usage } from './limits';
import { LoadError } from './LoadError';
import { ProjectsPanel } from './ProjectsPanel';
import { TeamPanel } from './TeamPanel';
import { useProjectsQuery, useTeamQuery } from './workspaceApi';

type Tab = 'projects' | 'team';

const LIMIT_KEY: Record<Tab, LimitKey> = { projects: 'projects', team: 'teamMembers' };
const SLOT: Record<LimitKey, [string, string]> = {
  projects: ['project', 'projects'],
  teamMembers: ['seat', 'seats'],
};

export default function WorkspacePage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'team' ? 'team' : 'projects';
  const subscription = useMySubscriptionQuery();
  const sub = subscription.data;
  const { data: projects } = useProjectsQuery();
  const { data: team } = useTeamQuery();
  const [creating, setCreating] = useState<Tab | null>(null);
  // The blocker outlives `open` so the dialog keeps its content while it animates out.
  const [blocked, setBlocked] = useState<{ open: boolean; blocker: Blocker | null }>({
    open: false,
    blocker: null,
  });

  const readOnly = sub?.readOnly ?? false;
  const plan = sub?.subscription?.plan ?? null;
  const usage: Record<Tab, Usage | null> = {
    projects: usageOf(sub, 'projects'),
    team: usageOf(sub, 'teamMembers'),
  };
  const overLimit = sub
    ? (['projects', 'teamMembers'] as const).filter((key) => {
        const limit = sub.limits[key];
        return !readOnly && limit !== null && sub.usage[key] > limit;
      })
    : [];

  const block = (blocker: Blocker) => setBlocked({ open: true, blocker });

  /** The server said no: explain why, and refresh usage because ours was out of date. */
  const onBlocked = (error: AppError) => {
    const blocker = blockerFrom(error);
    if (!blocker) return false;
    block(blocker);
    void subscription.refetch();
    return true;
  };

  // Check the plan before opening a form, so nobody fills one in only to be told no.
  const startCreate = (kind: Tab) => {
    const u = usage[kind];
    if (readOnly) return block({ kind: 'readOnly' });
    if (u?.left === 0 && plan) {
      return block({
        kind: 'limit',
        key: LIMIT_KEY[kind],
        limit: u.limit ?? 0,
        used: u.used,
        plan: plan.name,
      });
    }
    setCreating(kind);
  };

  const selectTab = (value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'team') next.set('tab', 'team');
        else next.delete('tab');
        return next;
      },
      { replace: true },
    );

  const current = usage[tab];
  const neverSubscribed = sub?.status === 'none';

  return (
    <Page title="Workspace">
      <MotionConfig reducedMotion="user">
        <PageTitle
          title="Workspace"
          description={
            plan ? (
              <>
                Projects and people on your{' '}
                <PlanPill slug={plan.slug} name={plan.name} className="mx-0.5 align-middle" /> plan.
              </>
            ) : (
              'Your projects and the people you work with.'
            )
          }
        />

        {sub && readOnly && (
          <Banner
            tone="warning"
            illustration="lockedDoor"
            title={
              neverSubscribed ? 'Pick a plan to start building' : 'Your workspace is read-only'
            }
            action={
              <Link to="/plans" className={cn(buttonVariants(), 'w-full sm:w-auto')}>
                <Rocket aria-hidden /> {neverSubscribed ? 'Choose a plan' : 'Renew a plan'}
              </Link>
            }
          >
            {neverSubscribed
              ? 'Projects and team seats come with a plan. Choose one to start adding them.'
              : 'Renew a plan to add or edit projects. Everything you created is still here.'}
          </Banner>
        )}

        {sub && overLimit.length > 0 && (
          <Banner
            tone="info"
            illustration="limitReached"
            title="You're over your plan's limit"
            action={
              <Link
                to="/plans"
                className={cn(buttonVariants({ variant: 'outline' }), 'w-full sm:w-auto')}
              >
                See plans
              </Link>
            }
          >
            Existing items stay, but you can't add more{' '}
            {overLimit
              .map((key) => `${NOUNS[key].many} until you're under ${sub.limits[key]}`)
              .join(', or ')}
            .
          </Banner>
        )}

        <section aria-label="Plan usage" className="mb-6 grid gap-4 sm:grid-cols-2">
          {sub ? (
            <>
              <UsageCard
                limitKey="projects"
                usage={usage.projects}
                planName={plan?.name}
                readOnly={readOnly}
                icon={<FolderKanban />}
              />
              <UsageCard
                limitKey="teamMembers"
                usage={usage.team}
                planName={plan?.name}
                readOnly={readOnly}
                icon={<Users />}
              />
            </>
          ) : subscription.isError ? (
            <LoadError
              className="sm:col-span-2"
              title="We couldn't load your plan usage"
              error={subscription.error}
              onRetry={() => void subscription.refetch()}
              retrying={subscription.isFetching}
            />
          ) : (
            <>
              <KpiSkeleton />
              <KpiSkeleton />
            </>
          )}
        </section>

        <Tabs value={tab} onValueChange={selectTab}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList aria-label="Workspace sections" className="w-full sm:w-auto">
              <TabsTrigger value="projects" className="min-h-11 flex-1 sm:min-h-9 sm:flex-none">
                <FolderKanban aria-hidden /> Projects <TabCount count={projects?.length} />
              </TabsTrigger>
              <TabsTrigger value="team" className="min-h-11 flex-1 sm:min-h-9 sm:flex-none">
                <Users aria-hidden /> Team <TabCount count={team?.length} />
              </TabsTrigger>
            </TabsList>
            <Button className="w-full sm:w-auto" onClick={() => startCreate(tab)}>
              {readOnly ? (
                <Lock aria-hidden />
              ) : tab === 'projects' ? (
                <Plus aria-hidden />
              ) : (
                <UserPlus aria-hidden />
              )}
              {tab === 'projects' ? 'New project' : 'Add member'}
              {/* The space keeps the accessible name readable; flex layout ignores it visually. */}
              {!readOnly && current?.left != null && (
                <>
                  {' '}
                  <span className="font-bold opacity-80">· {current.left} left</span>
                </>
              )}
            </Button>
          </div>

          <TabsContent value="projects">
            <ProjectsPanel
              usage={usage.projects}
              readOnly={readOnly}
              createOpen={creating === 'projects'}
              onCreateOpenChange={(open) => setCreating(open ? 'projects' : null)}
              onCreate={() => startCreate('projects')}
              onReadOnly={() => block({ kind: 'readOnly' })}
              onBlocked={onBlocked}
            />
          </TabsContent>
          <TabsContent value="team">
            <TeamPanel
              usage={usage.team}
              readOnly={readOnly}
              createOpen={creating === 'team'}
              onCreateOpenChange={(open) => setCreating(open ? 'team' : null)}
              onCreate={() => startCreate('team')}
              onBlocked={onBlocked}
            />
          </TabsContent>
        </Tabs>

        <BlockerModal
          open={blocked.open}
          onOpenChange={(open) => setBlocked((s) => ({ ...s, open }))}
          blocker={blocked.blocker}
          sub={sub}
        />
      </MotionConfig>
    </Page>
  );
}

function TabCount({ count }: { count: number | undefined }) {
  if (count === undefined) return null;
  return (
    <span className="num min-w-5 rounded-full bg-surface-3 px-1.5 text-center text-xs leading-5 text-muted">
      {count}
    </span>
  );
}

const BANNER_TONES = {
  warning: 'border-warning/30 bg-warning-soft text-warning-ink',
  info: 'border-info-ink/20 bg-info-soft text-info-ink',
} as const;

function Banner({
  tone,
  illustration,
  title,
  children,
  action,
}: {
  tone: keyof typeof BANNER_TONES;
  illustration: IllustrationName;
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'mb-5 flex flex-col gap-4 rounded-card border p-4 sm:flex-row sm:items-center sm:p-5',
        BANNER_TONES[tone],
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <Illustration name={illustration} size={56} eager className="shrink-0" />
        <div className="min-w-0">
          <p className="font-extrabold">{title}</p>
          <p className="mt-0.5 text-sm">{children}</p>
        </div>
      </div>
      {action}
    </motion.div>
  );
}

function UsageCard({
  limitKey,
  usage,
  planName = 'your plan',
  readOnly,
  icon,
}: {
  limitKey: LimitKey;
  usage: Usage | null;
  planName?: string;
  readOnly: boolean;
  icon: ReactNode;
}) {
  if (!usage) return null;
  const { used, limit, left } = usage;
  const [one, many] = SLOT[limitKey];
  const pct = limit === null ? 0 : limit === 0 ? 100 : (used / limit) * 100;

  const note = readOnly
    ? { text: 'Read-only until you pick a plan', className: 'text-warning-ink' }
    : limit === null
      ? { text: `Unlimited on ${planName}`, className: 'text-muted' }
      : used > limit
        ? { text: `${used - limit} over your ${planName} limit`, className: 'text-danger-ink' }
        : left === 0
          ? { text: 'Limit reached. Upgrade for more room.', className: 'text-danger-ink' }
          : pct >= 80
            ? {
                text: `Only ${plural(left ?? 0, one, many)} left. Upgrade for more.`,
                className: 'text-warning-ink',
              }
            : {
                text: `${plural(left ?? 0, one, many)} left on ${planName}`,
                className: 'text-muted',
              };

  return (
    <KpiCard
      label={NOUNS[limitKey].title}
      icon={icon}
      tone={limitKey === 'projects' ? 'brand' : 'sky'}
      footer={
        <>
          <ProgressBar value={used} max={limit} label={`${NOUNS[limitKey].title} used`} />
          <p className={cn('mt-2 text-xs font-extrabold', note.className)}>{note.text}</p>
        </>
      }
    >
      <span className="num">{used}</span>
      <span className="ml-1.5 text-sm font-extrabold tracking-normal text-muted">
        {readOnly ? 'in use' : limit === null ? 'of unlimited' : `of ${limit}`}
      </span>
    </KpiCard>
  );
}

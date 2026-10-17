import type { SessionDto } from '@planpilot/shared';
import { LogOut, Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorOf } from '../../api/errors';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardHeader } from '../../components/ui/card';
import { Modal } from '../../components/ui/dialog';
import { EmptyState, Illustration, Skeleton } from '../../components/ui/feedback';
import { cn } from '../../lib/cn';
import { formatDate, formatRelative, plural } from '../../lib/format';
import {
  useRevokeSessionMutation,
  useSessionsQuery,
  useSignOutEverywhereMutation,
} from '../auth/authApi';
import { describeDevice } from './device';
import type { DeviceKind } from './device';

const DEVICE_ICON: Record<DeviceKind, typeof Monitor> = {
  desktop: Monitor,
  phone: Smartphone,
  tablet: Tablet,
};

export function SessionsCard() {
  const { data, isError, error, refetch, isFetching } = useSessionsQuery();
  const [revoke] = useRevokeSessionMutation();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [signOutEverywhere, { isLoading: signingOut }] = useSignOutEverywhereMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // This device first, then the most recently used.
  const sessions = data
    ? [...data].sort(
        (a, b) => Number(b.current) - Number(a.current) || b.lastUsedAt.localeCompare(a.lastUsedAt),
      )
    : undefined;
  const others = sessions?.filter((s) => !s.current).length ?? 0;

  const revokeOne = async (session: SessionDto, label: string) => {
    setRevokingId(session.id);
    try {
      await revoke(session.id).unwrap();
      toast.success(`Signed out of ${label}`);
    } catch (e) {
      toast.error(errorOf(e)?.message ?? "Couldn't sign out that device.");
    } finally {
      setRevokingId(null);
    }
  };

  // This also ends the session here; the app then takes you to the sign-in page.
  const signOutAll = async () => {
    try {
      const { revoked } = await signOutEverywhere().unwrap();
      toast.success(`Signed out of ${plural(revoked, 'device')}.`);
    } catch (e) {
      toast.error(errorOf(e)?.message ?? "Couldn't sign out everywhere.");
    }
  };

  let body;
  if (!sessions) {
    body = isError ? (
      <div
        role="alert"
        className="flex flex-col items-center rounded-xl bg-surface-2 px-4 py-6 text-center"
      >
        <p className="font-extrabold">We couldn't load your sessions</p>
        <p className="mt-1 text-sm text-muted">
          {errorOf(error)?.message ?? 'Something went wrong. Please try again.'}
        </p>
        <Button
          variant="outline"
          className="mt-3"
          loading={isFetching}
          onClick={() => void refetch()}
        >
          {!isFetching && <RefreshCw aria-hidden />} Retry
        </Button>
      </div>
    ) : (
      <ul className="space-y-2" aria-busy aria-label="Loading sessions">
        {[0, 1].map((i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl border border-line p-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="mt-2 h-3 w-48 max-w-full" />
            </div>
          </li>
        ))}
      </ul>
    );
  } else if (!sessions.length) {
    body = (
      <EmptyState
        illustration="emptyBox"
        size={110}
        className="py-6"
        title="No active sessions"
        description="Devices you sign in on will show up here."
      />
    );
  } else {
    body = (
      <>
        <ul className="space-y-2">
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              revoking={revokingId === session.id}
              onRevoke={(label) => void revokeOne(session, label)}
            />
          ))}
        </ul>
        {others === 0 && (
          <p className="mt-3 text-[13px] text-muted">You're only signed in on this device.</p>
        )}
      </>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Active sessions"
        description="Devices signed in to your account."
        action={
          sessions?.length ? (
            <Badge tone="neutral" className="num">
              {sessions.length}
            </Badge>
          ) : null
        }
      />
      {body}
      <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted">
          Lost a device or used a shared computer? Sign out everywhere, including here.
        </p>
        <Button variant="danger" className="shrink-0" onClick={() => setConfirmOpen(true)}>
          <LogOut aria-hidden /> Sign out everywhere
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Sign out everywhere?"
        description="Every device signed in to your account, including this one, will be signed out. You'll need to sign in again."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={signingOut} onClick={() => void signOutAll()}>
              {!signingOut && <LogOut aria-hidden />} Sign out everywhere
            </Button>
          </>
        }
      >
        <div className="flex justify-center">
          <Illustration name="lockedDoor" size={120} eager float />
        </div>
      </Modal>
    </Card>
  );
}

function SessionRow({
  session,
  revoking,
  onRevoke,
}: {
  session: SessionDto;
  revoking: boolean;
  onRevoke: (label: string) => void;
}) {
  const { label, kind } = describeDevice(session.userAgent);
  const Icon = DEVICE_ICON[kind];
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border p-3',
        session.current ? 'border-success/30 bg-success-soft/40' : 'border-line',
      )}
    >
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl',
          session.current ? 'bg-success-soft text-success-ink' : 'bg-surface-2 text-muted',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 truncate font-extrabold" title={session.userAgent}>
            {label}
          </p>
          {session.current && (
            <Badge tone="success" dot>
              This device
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {session.current ? 'Active now' : `Last active ${formatRelative(session.lastUsedAt)}`}
          <span aria-hidden> · </span>
          <span className="whitespace-nowrap">Signed in {formatDate(session.createdAt)}</span>
        </p>
      </div>
      {!session.current && (
        // Icon-only on phones so the device name keeps room to breathe.
        <Button
          variant="outline"
          size="sm"
          className="size-11 shrink-0 p-0 sm:h-9 sm:w-auto sm:px-3"
          loading={revoking}
          onClick={() => onRevoke(label)}
          aria-label={`Sign out ${label}`}
        >
          {!revoking && <LogOut aria-hidden />}
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      )}
    </li>
  );
}

import { LogOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api } from '../../api/apiSlice';
import { handleSessionError, isAuthResponse, refreshAccessToken } from '../../api/baseQuery';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/dialog';
import { Illustration } from '../../components/ui/feedback';
import { onBroadcast } from '../../lib/broadcast';
import { useLogoutMutation } from './authApi';
import { endReasonCleared, restoreFinished, sessionEnded, sessionStarted } from './authSlice';

const IDLE_LIMIT_MS = 30 * 60_000;
const WARNING_SECONDS = 60;
const REFRESH_EARLY_MS = 60_000;

/**
 * Owns the signed-in session for the whole app:
 *  - restores it on page load from the HttpOnly refresh cookie,
 *  - refreshes the access token a minute before it expires (silent refresh),
 *  - signs out after 30 idle minutes, with a 60-second warning,
 *  - keeps every tab in step, and explains why a session ended.
 */
export function SessionManager() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { status, expiresAt, endReason, restriction } = useAppSelector((s) => s.auth);
  const [logout] = useLogoutMutation();
  const [warning, setWarning] = useState<number | null>(null);
  const lastActivity = useRef(0);

  /** `quiet`: a failed refresh just means "not signed in" (first visit, other tab). */
  const refresh = useCallback(
    async (quiet: boolean) => {
      const result = await refreshAccessToken();
      if (isAuthResponse(result)) dispatch(sessionStarted(result));
      else if (result.status === 403) handleSessionError(result, dispatch);
      else if (!quiet && result.status === 401) dispatch(sessionEnded('expired'));
      return isAuthResponse(result);
    },
    [dispatch],
  );

  // 1. Restore on page load.
  useEffect(() => {
    void refresh(true).finally(() => dispatch(restoreFinished()));
  }, [refresh, dispatch]);

  // 2. Silent refresh shortly before the access token expires.
  useEffect(() => {
    if (status !== 'authenticated' || !expiresAt) return;
    const delay = Math.max(5_000, new Date(expiresAt).getTime() - Date.now() - REFRESH_EARLY_MS);
    const timer = setTimeout(() => void refresh(false), delay);
    return () => clearTimeout(timer);
  }, [status, expiresAt, refresh]);

  // 3. Idle sign-out with a warning.
  useEffect(() => {
    if (status !== 'authenticated') return;
    lastActivity.current = Date.now();
    let last = 0;
    const mark = () => {
      const now = Date.now();
      if (now - last > 1000) {
        last = now;
        lastActivity.current = now;
      }
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const timer = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_LIMIT_MS) {
        clearInterval(timer);
        setWarning(null);
        void logout().finally(() => dispatch(sessionEnded('idle')));
      } else if (idle >= IDLE_LIMIT_MS - WARNING_SECONDS * 1000) {
        setWarning(Math.ceil((IDLE_LIMIT_MS - idle) / 1000));
      }
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(timer);
    };
  }, [status, logout, dispatch]);

  // 4. Other tabs signing in or out.
  useEffect(
    () =>
      onBroadcast((message) => {
        if (message.type === 'signed-out') {
          dispatch(sessionEnded('elsewhere'));
          dispatch(api.util.resetApiState());
        } else {
          void refresh(true);
        }
      }),
    [dispatch, refresh],
  );

  // 5. Explain why the session ended, then show the login page.
  useEffect(() => {
    if (!endReason || endReason === 'restricted') return;
    const messages = {
      expired: 'Your session expired. Please sign in again.',
      idle: 'You were signed out after 30 minutes of inactivity.',
      elsewhere: 'You signed out in another tab.',
      'signed-out': null,
    } as const;
    const message = messages[endReason];
    if (message) toast.info(message);
    dispatch(endReasonCleared());
    navigate(
      endReason === 'signed-out'
        ? '/login'
        : `/login?next=${encodeURIComponent(location.pathname)}`,
      { replace: true },
    );
  }, [endReason, dispatch, navigate]);

  const restrictionArt =
    restriction?.code === 'ACCOUNT_BLOCKED'
      ? 'accountBlocked'
      : restriction?.code === 'ACCOUNT_INACTIVE'
        ? 'accountInactive'
        : 'accessExpired';

  return (
    <>
      <Modal
        open={warning !== null}
        onOpenChange={() => undefined}
        dismissible={false}
        title="Are you still there?"
        description={`For your security you'll be signed out in ${warning ?? 0} seconds.`}
        footer={
          <>
            <Button variant="outline" onClick={() => void logout()}>
              <LogOut /> Sign out now
            </Button>
            <Button
              onClick={() => {
                lastActivity.current = Date.now();
                setWarning(null);
                void refresh(false);
              }}
            >
              Stay signed in
            </Button>
          </>
        }
      >
        <div className="flex justify-center">
          <Illustration name="accountInactive" size={130} eager />
        </div>
      </Modal>

      {/* An admin restricted this account while it was signed in. */}
      <Modal
        // On the login page the same message shows as a banner instead.
        open={Boolean(restriction) && endReason === 'restricted' && pathname !== '/login'}
        onOpenChange={() => {
          dispatch(endReasonCleared());
          navigate('/login', { replace: true });
        }}
        title={restriction?.message ?? ''}
        description={restriction?.reason ? `Reason: ${restriction.reason}` : undefined}
        footer={
          <Button
            onClick={() => {
              dispatch(endReasonCleared());
              navigate('/login', { replace: true });
            }}
          >
            OK
          </Button>
        }
      >
        <div className="flex flex-col items-center text-center">
          <Illustration name={restrictionArt} size={130} eager />
          {restriction?.supportEmail && (
            <p className="mt-3 text-sm text-muted">
              Need help? Write to{' '}
              <a
                className="font-extrabold text-brand-ink underline"
                href={`mailto:${restriction.supportEmail}`}
              >
                {restriction.supportEmail}
              </a>
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

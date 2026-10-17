import type { Role } from '@planpilot/shared';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { AdminShell } from '../components/layout/AdminShell';
import { AppShell } from '../components/layout/AppShell';
import { BrandLoader } from '../components/feedback/status';
import { safeNext } from '../lib/navigation';
import { ForbiddenPage } from '../pages/ErrorPages';
import { useAppSelector } from './store';

export const homeFor = (role: Role | undefined) => (role === 'admin' ? '/admin' : '/dashboard');

/** Waits for the session restore, then sends anonymous visitors to sign in (and back). */
export function RequireAuth() {
  const { status } = useAppSelector((s) => s.auth);
  const location = useLocation();
  if (status === 'restoring') return <BrandLoader />;
  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

/**
 * Role gate for the client side. The server enforces the same rule on every call,
 * so this only decides what to show.
 */
export function RequireRole({ role }: { role: Role }) {
  const user = useAppSelector((s) => s.auth.user);
  if (user?.role === role) return <Outlet />;
  // An admin opening a customer page goes to the admin area; a customer gets 403.
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;
  return <ForbiddenPage />;
}

/**
 * Sign-in and sign-up pages. The moment a session starts, this is what moves the
 * visitor on: to the safe `?next=` path they were heading to, or their home page.
 */
export function GuestOnly() {
  const { status, user } = useAppSelector((s) => s.auth);
  const [params] = useSearchParams();
  if (status === 'restoring') return <BrandLoader />;
  if (status === 'authenticated') {
    return <Navigate to={safeNext(params.get('next')) ?? homeFor(user?.role)} replace />;
  }
  return <Outlet />;
}

export function HomeRedirect() {
  const { status, user } = useAppSelector((s) => s.auth);
  if (status === 'restoring') return <BrandLoader />;
  return <Navigate to={status === 'authenticated' ? homeFor(user?.role) : '/plans'} replace />;
}

/** Profile and notifications live in whichever shell matches the role. */
export function RoleShell() {
  const role = useAppSelector((s) => s.auth.user?.role);
  return role === 'admin' ? <AdminShell /> : <AppShell />;
}

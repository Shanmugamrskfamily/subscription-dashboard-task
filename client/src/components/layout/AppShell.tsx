import { Bell, FolderKanban, Layers, LayoutDashboard, UserRound } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAppSelector } from '../../app/store';
import { NotificationBell } from '../../features/notifications/NotificationBell';
import { useNotificationsQuery } from '../../features/notifications/notificationsApi';
import { PlanReminders } from '../../features/subscription/PlanReminders';
import { cn } from '../../lib/cn';
import { Logo } from '../brand/logo';
import { buttonVariants } from '../ui/button';
import { ThemeToggle, UserMenu } from './controls';

const TOP_LINKS = [
  { to: '/plans', label: 'Plans' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/workspace', label: 'Workspace' },
];

const TABS = [
  { to: '/plans', label: 'Plans', icon: Layers },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workspace', label: 'Workspace', icon: FolderKanban },
  { to: '/notifications', label: 'Alerts', icon: Bell },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

/** Customer area and public pages: top bar everywhere, bottom tab bar on phones. */
export function AppShell() {
  const { status, user } = useAppSelector((s) => s.auth);
  const signedIn = status === 'authenticated';
  const isCustomer = signedIn && user?.role === 'user';
  const { pathname } = useLocation();
  const { data } = useNotificationsQuery(undefined, { skip: !signedIn });

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-[80] rounded-lg bg-surface px-3 py-2 font-bold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="PlanPilot home">
            <Logo />
          </Link>

          {isCustomer && (
            <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
              {TOP_LINKS.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-xl px-3.5 py-2 text-sm font-extrabold text-muted transition-colors hover:text-ink',
                      isActive && 'bg-brand-soft text-brand-ink hover:text-brand-ink',
                    )
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {signedIn ? (
              <>
                <NotificationBell />
                <UserMenu />
              </>
            ) : status === 'anonymous' ? (
              <>
                <Link
                  to="/login"
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'sm' }),
                    'hidden sm:inline-flex',
                  )}
                >
                  Sign in
                </Link>
                <Link to="/register" className={buttonVariants({ size: 'sm' })}>
                  Get started
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main id="main" className={cn('flex-1', isCustomer && 'pb-24 md:pb-0')}>
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <Outlet />
        </motion.div>
      </main>

      {isCustomer && (
        <>
          <PlanReminders />
          <nav
            className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md safe-bottom md:hidden"
            aria-label="Main"
          >
            <ul className="flex justify-around px-1 pt-1.5">
              {TABS.map((t) => (
                <li key={t.to}>
                  <NavLink
                    to={t.to}
                    className={({ isActive }) =>
                      cn(
                        'relative flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-extrabold text-muted',
                        isActive && 'text-brand-ink',
                      )
                    }
                  >
                    <t.icon className="size-5" aria-hidden />
                    {t.label}
                    {t.to === '/notifications' && (data?.unread ?? 0) > 0 && (
                      <span
                        className="absolute top-0.5 right-3 size-2.5 rounded-full border-2 border-surface bg-danger"
                        role="img"
                        aria-label={`${data?.unread} unread`}
                      />
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}

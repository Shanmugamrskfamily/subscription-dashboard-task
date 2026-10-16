import {
  Activity,
  Bell,
  Layers,
  LayoutDashboard,
  Menu as MenuIcon,
  ReceiptText,
  RotateCcw,
  UserRound,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { toast } from 'sonner';
import { errorOf } from '../../api/errors';
import { useResetDemoMutation } from '../../features/admin/adminApi';
import { NotificationBell } from '../../features/notifications/NotificationBell';
import { cn } from '../../lib/cn';
import { Logo } from '../brand/logo';
import { Button } from '../ui/button';
import { Drawer } from '../ui/dialog';
import { Illustration } from '../ui/feedback';
import { ThemeToggle, UserMenu } from './controls';

const NAV = [
  {
    section: 'Admin',
    items: [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/admin/subscriptions', label: 'Subscriptions', icon: ReceiptText },
      { to: '/admin/users', label: 'Users', icon: Users },
      { to: '/admin/plans', label: 'Plans', icon: Layers },
      { to: '/admin/activity', label: 'Activity', icon: Activity },
    ],
  },
  {
    section: 'Account',
    items: [
      { to: '/profile', label: 'Profile', icon: UserRound },
      { to: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
];

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const [reset, { isLoading }] = useResetDemoMutation();
  return (
    <div className="flex h-full flex-col gap-6">
      <nav aria-label="Admin" className="space-y-5">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="px-3.5 pb-1.5 text-[11px] font-black tracking-[0.12em] text-subtle uppercase">
              {group.section}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={'end' in item}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-bold text-muted transition-colors hover:bg-surface-2 hover:text-ink',
                        isActive &&
                          'bg-brand-soft text-brand-ink hover:bg-brand-soft hover:text-brand-ink',
                      )
                    }
                  >
                    <item.icon className="size-[18px]" aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mt-auto rounded-2xl border border-line bg-surface p-3.5 shadow-card">
        <div className="flex items-center gap-3">
          <Illustration name="crownBadge" size={42} eager />
          <div>
            <p className="text-sm font-extrabold">Demo data</p>
            <p className="text-xs text-muted">Sample customers and history</p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 w-full"
          loading={isLoading}
          onClick={async () => {
            try {
              await reset().unwrap();
              toast.success('Demo data reset to a fresh state.');
            } catch (e) {
              toast.error(errorOf(e)?.message ?? 'Could not reset the demo data.');
            }
          }}
        >
          <RotateCcw /> Reset demo data
        </Button>
      </div>
    </div>
  );
}

/** Admin area: fixed sidebar from 1024 px, a drawer behind the menu button below that. */
export function AdminShell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-[80] rounded-lg bg-surface px-3 py-2 font-bold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-surface px-4 py-5 lg:flex">
        <Link to="/admin" className="px-2" aria-label="PlanPilot admin">
          <Logo />
        </Link>
        <SideNav />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="grid size-10 cursor-pointer place-items-center rounded-xl border border-line bg-surface shadow-card lg:hidden"
              aria-label="Open navigation"
            >
              <MenuIcon className="size-5" />
            </button>
            <Link to="/admin" className="lg:hidden" aria-label="PlanPilot admin">
              <Logo className="text-[17px]" size={30} />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main id="main" className="px-4 py-6 sm:px-6 lg:px-8">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      <Drawer open={open} onOpenChange={setOpen} title="PlanPilot admin">
        <SideNav onNavigate={() => setOpen(false)} />
      </Drawer>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <title>{`${title} · Admin · PlanPilot`}</title>
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

import { createBrowserRouter, Outlet } from 'react-router';
import { Toaster } from 'sonner';
import { AdminShell } from '../components/layout/AdminShell';
import { AppShell } from '../components/layout/AppShell';
import { OfflineBanner, RouteProgress, ServerWakeBanner } from '../components/feedback/status';
import { SessionManager } from '../features/auth/SessionManager';
import { CheckoutProvider } from '../features/billing/CheckoutFlow';
import { useTheme } from '../features/theme/theme';
import { ForbiddenPage, NotFoundPage, RouteErrorPage } from '../pages/ErrorPages';
import { GuestOnly, HomeRedirect, RequireAuth, RequireRole, RoleShell } from './guards';

/** Code-split pages: each loads on first visit while the top progress bar runs. */
const page = (load: () => Promise<{ default: React.ComponentType }>) => () =>
  load().then((m) => ({ Component: m.default }));

function Root() {
  const { resolved } = useTheme();
  return (
    <>
      <RouteProgress />
      <OfflineBanner />
      <ServerWakeBanner />
      <SessionManager />
      <CheckoutProvider>
        <Outlet />
      </CheckoutProvider>
      <Toaster
        theme={resolved}
        position="top-center"
        richColors
        closeButton
        duration={5000}
        toastOptions={{ className: 'font-sans' }}
      />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomeRedirect /> },
      {
        element: <GuestOnly />,
        children: [
          { path: 'login', lazy: page(() => import('../features/auth/LoginPage')) },
          { path: 'register', lazy: page(() => import('../features/auth/RegisterPage')) },
        ],
      },
      {
        // Public pricing page, also the landing page for visitors.
        element: <AppShell />,
        children: [{ path: 'plans', lazy: page(() => import('../features/plans/PlansPage')) }],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <RequireRole role="user" />,
            children: [
              {
                element: <AppShell />,
                children: [
                  {
                    path: 'dashboard',
                    lazy: page(() => import('../features/subscription/DashboardPage')),
                  },
                  {
                    path: 'workspace',
                    lazy: page(() => import('../features/workspace/WorkspacePage')),
                  },
                ],
              },
            ],
          },
          {
            element: <RoleShell />,
            children: [
              { path: 'profile', lazy: page(() => import('../features/profile/ProfilePage')) },
              {
                path: 'notifications',
                lazy: page(() => import('../features/notifications/NotificationsPage')),
              },
            ],
          },
          {
            path: 'admin',
            element: <RequireRole role="admin" />,
            children: [
              {
                element: <AdminShell />,
                children: [
                  { index: true, lazy: page(() => import('../features/admin/OverviewPage')) },
                  {
                    path: 'subscriptions',
                    lazy: page(() => import('../features/admin/SubscriptionsPage')),
                  },
                  { path: 'users', lazy: page(() => import('../features/admin/UsersPage')) },
                  { path: 'plans', lazy: page(() => import('../features/admin/PlansAdminPage')) },
                  { path: 'activity', lazy: page(() => import('../features/admin/ActivityPage')) },
                ],
              },
            ],
          },
        ],
      },
      { path: '403', element: <ForbiddenPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

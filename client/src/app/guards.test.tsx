import type { Role } from '@planpilot/shared';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { AuthState } from '../features/auth/authSlice';
import { authState, LocationProbe } from '../test/utils';
import { GuestOnly, HomeRedirect, RequireAuth, RequireRole } from './guards';
import { makeStore } from './store';

function renderAt(path: string, auth: AuthState) {
  const router = createMemoryRouter(
    [
      { index: true, element: <HomeRedirect /> },
      { element: <GuestOnly />, children: [{ path: 'login', element: <LocationProbe /> }] },
      { path: 'plans', element: <LocationProbe /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <RequireRole role="user" />,
            children: [{ path: 'dashboard', element: <LocationProbe /> }],
          },
          {
            path: 'admin',
            element: <RequireRole role="admin" />,
            children: [{ index: true, element: <LocationProbe /> }],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <Provider store={makeStore({ auth })}>
      <RouterProvider router={router} />
    </Provider>,
  );
}

const location = () => screen.getByTestId('location').textContent;
const as = (role?: Role) => authState(role ? 'authenticated' : 'anonymous', role);

describe('route guards', () => {
  it('sends visitors to sign in and remembers where they were going', () => {
    renderAt('/dashboard?tab=billing', as());
    expect(location()).toBe('/login?next=%2Fdashboard%3Ftab%3Dbilling');
  });

  it('shows a loader, not a redirect, while the session is being restored', () => {
    renderAt('/dashboard', authState('restoring'));
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });

  it('lets customers into customer pages', () => {
    renderAt('/dashboard', as('user'));
    expect(location()).toBe('/dashboard');
  });

  it('shows a 403 page when a customer opens the admin area', () => {
    renderAt('/admin', as('user'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/for admins/i);
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });

  it('moves admins from customer pages to the admin area', () => {
    renderAt('/dashboard', as('admin'));
    expect(location()).toBe('/admin');
  });

  it('keeps signed-in people away from the sign-in page', () => {
    renderAt('/login', as('user'));
    expect(location()).toBe('/dashboard');
  });

  it('sends the home page to the right place for each visitor', () => {
    renderAt('/', as());
    expect(location()).toBe('/plans');
  });
});

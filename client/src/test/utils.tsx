import type { AuthResponse, Role, UserDto } from '@planpilot/shared';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import type { RouteObject } from 'react-router';
import { makeStore } from '../app/store';
import type { AuthState } from '../features/auth/authSlice';
import { ThemeProvider } from '../features/theme/theme';

export function makeUser(overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: 'u1',
    name: 'Priya Sharma',
    email: 'priya@planpilot.demo',
    role: 'user',
    status: 'active',
    statusReason: null,
    accessExpiresAt: null,
    lastSeenAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeSession(role: Role = 'user', token = 'token-1'): AuthResponse {
  return {
    user: makeUser(role === 'admin' ? { id: 'a1', name: 'Admin', role } : {}),
    accessToken: token,
    accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
}

export function authState(status: AuthState['status'], role?: Role): AuthState {
  const session = role ? makeSession(role) : null;
  return {
    status,
    user: session?.user ?? null,
    accessToken: session?.accessToken ?? null,
    expiresAt: session?.accessTokenExpiresAt ?? null,
    restriction: null,
    endReason: null,
  };
}

/** Prints where the router ended up, so tests can assert redirects. */
export function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

interface Options {
  auth?: AuthState;
  path?: string;
  route?: string;
  routes?: RouteObject[];
}

/** Renders a screen with the real store, theme and a memory router. */
export function renderApp(ui: ReactElement, options: Options = {}) {
  const store = makeStore({ auth: options.auth ?? authState('anonymous') });
  const router = createMemoryRouter(
    [{ path: options.path ?? '/', element: ui }, ...(options.routes ?? [])],
    { initialEntries: [options.route ?? options.path ?? '/'] },
  );
  const view = render(
    <Provider store={store}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </Provider>,
  );
  return { ...view, store, router };
}

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, axiosError } from '../../test/axios';
import { LocationProbe, makeSession, renderApp } from '../../test/utils';
import { safeNext } from '../../lib/navigation';
import LoginPage from './LoginPage';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../api/http', () => ({ http: { request: mocks.request, post: vi.fn() } }));
vi.mock('../../lib/broadcast', () => ({ broadcast: vi.fn(), onBroadcast: () => () => undefined }));

const destinations = ['/dashboard', '/workspace', '/admin'].map((path) => ({
  path,
  element: <LocationProbe />,
}));

function renderLogin(route = '/login') {
  return renderApp(<LoginPage />, { path: '/login', route, routes: destinations });
}

async function signIn(email: string, password: string) {
  const user = userEvent.setup({ delay: null });
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

beforeEach(() => {
  mocks.request.mockReset();
});

// Full sign-in round trips through Formik and RTK Query: allow for a busy CI machine.
describe('LoginPage', { timeout: 15_000 }, () => {
  it('validates both fields before calling the API', async () => {
    renderLogin();
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('signs in and continues to the page the visitor asked for', async () => {
    mocks.request.mockResolvedValue({ data: { success: true, data: makeSession('user') } });
    const { store } = renderLogin('/login?next=%2Fworkspace');

    await signIn('Priya@PlanPilot.demo ', 'Demo@12345');

    expect(await screen.findByTestId('location')).toHaveTextContent('/workspace');
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/auth/login',
        method: 'POST',
        // Trimmed and lower-cased by the shared schema before it is sent.
        data: { email: 'priya@planpilot.demo', password: 'Demo@12345' },
      }),
    );
    expect(store.getState().auth.status).toBe('authenticated');
  });

  it('sends admins to the admin area by default', async () => {
    mocks.request.mockResolvedValue({ data: { success: true, data: makeSession('admin') } });
    renderLogin();

    await signIn('admin@planpilot.demo', 'Admin@12345');

    expect(await screen.findByTestId('location')).toHaveTextContent('/admin');
  });

  it('warns how many attempts are left before the account pauses', async () => {
    mocks.request.mockRejectedValue(
      axiosError(
        401,
        apiError('INVALID_CREDENTIALS', 'Email or password is incorrect.', { attemptsLeft: 2 }),
      ),
    );
    renderLogin();

    await signIn('priya@planpilot.demo', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect. 2 attempts left before a 15-minute pause.',
    );
  });

  it('explains why an admin restricted the account', async () => {
    mocks.request.mockRejectedValue(
      axiosError(
        403,
        apiError('ACCOUNT_BLOCKED', 'Your account has been blocked.', {
          reason: 'Repeated payment disputes',
          supportEmail: 'support@planpilot.demo',
        }),
      ),
    );
    renderLogin();

    await signIn('rohan@planpilot.demo', 'Demo@12345');

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Your account has been blocked.');
    expect(banner).toHaveTextContent('Reason: Repeated payment disputes');
    expect(screen.getByRole('link', { name: 'support@planpilot.demo' })).toHaveAttribute(
      'href',
      'mailto:support@planpilot.demo',
    );
  });

  it('shows a countdown and disables sign-in while the account is locked', async () => {
    mocks.request.mockRejectedValue(
      axiosError(423, apiError('ACCOUNT_LOCKED', 'Too many attempts.', { retryAfterSeconds: 600 })),
    );
    renderLogin();

    await signIn('priya@planpilot.demo', 'wrong-password');

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled());
    expect(screen.getByText(/10:00|9:59/)).toBeInTheDocument();
  });
});

describe('safeNext', () => {
  it('only allows same-site paths', () => {
    expect(safeNext('/workspace?tab=team')).toBe('/workspace?tab=team');
    expect(safeNext('//evil.example/phish')).toBeNull();
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('/login?next=/admin')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});

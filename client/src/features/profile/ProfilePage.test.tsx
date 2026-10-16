import type { SessionDto, UserDto } from '@planpilot/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '../../app/store';
import { ThemeProvider } from '../theme/theme';
import ProfilePage from './ProfilePage';

// vi.mock factories are hoisted above the imports, so everything they use lives here.
const mocks = vi.hoisted(() => ({
  sessions: [] as SessionDto[],
  changePassword: vi.fn(),
  revokeSession: vi.fn(),
  idle: () => [vi.fn(), { isLoading: false }],
}));

vi.mock('../auth/authApi', () => ({
  useUpdateProfileMutation: mocks.idle,
  useChangePasswordMutation: () => [mocks.changePassword, { isLoading: false }],
  useSessionsQuery: () => ({
    data: mocks.sessions,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useRevokeSessionMutation: () => [mocks.revokeSession, { isLoading: false }],
  useSignOutEverywhereMutation: mocks.idle,
}));

const user: UserDto = {
  id: 'u1',
  name: 'Priya Sharma',
  email: 'priya@example.com',
  role: 'user',
  status: 'active',
  statusReason: null,
  accessExpiresAt: null,
  lastSeenAt: null,
  createdAt: '2026-09-12T10:00:00.000Z',
};

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

function renderPage() {
  const store = makeStore({
    auth: {
      status: 'authenticated',
      user,
      accessToken: 'token',
      expiresAt: null,
      restriction: null,
      endReason: null,
    },
  });
  return render(
    <Provider store={store}>
      <ThemeProvider>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </ThemeProvider>
    </Provider>,
  );
}

beforeEach(() => {
  mocks.sessions = [
    {
      id: 's2',
      userAgent: SAFARI_IPHONE,
      createdAt: '2026-10-01T08:00:00.000Z',
      lastUsedAt: '2026-10-15T08:00:00.000Z',
      current: false,
    },
    {
      id: 's1',
      userAgent: CHROME_WINDOWS,
      createdAt: '2026-10-10T08:00:00.000Z',
      lastUsedAt: '2026-10-16T08:00:00.000Z',
      current: true,
    },
  ];
  mocks.changePassword.mockReset();
  mocks.revokeSession.mockReset();
});

describe('ProfilePage', () => {
  it('shows the account and its signed-in devices, this one first', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Priya Sharma' })).toBeInTheDocument();
    expect(screen.getByText('Customer')).toBeInTheDocument();
    const devices = screen.getAllByText(/ on (Windows|iOS)$/).map((el) => el.textContent);
    expect(devices).toEqual(['Chrome on Windows', 'Safari on iOS']);
    expect(screen.getByText('This device')).toBeInTheDocument();
  });

  it('signs out another device', async () => {
    mocks.revokeSession.mockReturnValue({ unwrap: () => Promise.resolve({ revoked: true }) });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out Safari on iOS' }));
    expect(mocks.revokeSession).toHaveBeenCalledWith('s2');
  });

  it('puts a wrong current password back on its field', async () => {
    mocks.changePassword.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 400,
          code: 'WRONG_PASSWORD',
          message: 'Your current password is not correct.',
          details: [{ field: 'currentPassword', message: 'Your current password is not correct' }],
          meta: {},
        }),
    });
    renderPage();
    await userEvent.type(screen.getByLabelText('Current password'), 'OldPass123');
    await userEvent.type(screen.getByLabelText('New password'), 'NewPass456');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPass456');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(mocks.changePassword).toHaveBeenCalledWith({
      currentPassword: 'OldPass123',
      newPassword: 'NewPass456',
    });
    expect(await screen.findByText('Your current password is not correct')).toBeInTheDocument();
  });

  it('switches the theme', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(document.documentElement).toHaveClass('dark');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '../app/store';
import { apiError, axiosError } from '../test/axios';
import { authState, makeSession } from '../test/utils';
import { baseQueryWithReauth } from './baseQuery';
import type { RequestArgs } from './baseQuery';

const mocks = vi.hoisted(() => ({ request: vi.fn(), post: vi.fn() }));
vi.mock('./http', () => ({ http: { request: mocks.request, post: mocks.post } }));

const ok = (data: unknown) => ({ data: { success: true, data } });
const bearer = (config: { headers?: { Authorization?: string } }) =>
  config.headers?.Authorization?.replace('Bearer ', '');

function setup() {
  const store = makeStore({ auth: authState('authenticated', 'user') });
  const call = (args: RequestArgs) =>
    baseQueryWithReauth(
      args,
      {
        getState: store.getState,
        dispatch: store.dispatch,
        signal: new AbortController().signal,
        abort: vi.fn(),
        extra: undefined,
        endpoint: 'test',
        type: 'query',
      } as never,
      {},
    );
  return { store, call };
}

beforeEach(async () => {
  mocks.request.mockReset();
  mocks.post.mockReset();
  // The shared refresh promise is released one tick after it settles.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe('baseQueryWithReauth', () => {
  it('refreshes once for parallel requests with an expired token, then retries each', async () => {
    const fresh = makeSession('user', 'token-2');
    mocks.request.mockImplementation(async (config) =>
      bearer(config) === 'token-2'
        ? ok({ url: config.url })
        : Promise.reject(axiosError(401, apiError('TOKEN_EXPIRED'))),
    );
    mocks.post.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return ok(fresh);
    });

    const { store, call } = setup();
    const [a, b, c] = await Promise.all([
      call({ url: '/plans' }),
      call({ url: '/my-subscription' }),
      call({ url: '/notifications' }),
    ]);

    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith('/auth/refresh');
    expect([a.data, b.data, c.data]).toEqual([
      { url: '/plans' },
      { url: '/my-subscription' },
      { url: '/notifications' },
    ]);
    expect(store.getState().auth.accessToken).toBe('token-2');
  });

  it('signs out with "expired" when the refresh token is no longer valid', async () => {
    mocks.request.mockRejectedValue(axiosError(401, apiError('TOKEN_EXPIRED')));
    mocks.post.mockRejectedValue(axiosError(401, apiError('SESSION_EXPIRED')));

    const { store, call } = setup();
    const result = await call({ url: '/my-subscription' });

    expect(result.error?.code).toBe('SESSION_EXPIRED');
    expect(store.getState().auth).toMatchObject({
      status: 'anonymous',
      accessToken: null,
      endReason: 'expired',
    });
  });

  it('retries the refresh once when another tab rotated the cookie first', async () => {
    mocks.request.mockImplementation(async (config) =>
      bearer(config) === 'token-2'
        ? ok('fine')
        : Promise.reject(axiosError(401, apiError('TOKEN_EXPIRED'))),
    );
    mocks.post
      .mockRejectedValueOnce(axiosError(401, apiError('SESSION_EXPIRED', 'Retry', { retry: true })))
      .mockResolvedValueOnce(ok(makeSession('user', 'token-2')));

    const { call } = setup();
    const result = await call({ url: '/plans' });

    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(result.data).toBe('fine');
  });

  it('ends the session and keeps the reason when an admin blocks the account', async () => {
    mocks.request.mockRejectedValue(
      axiosError(
        403,
        apiError('ACCOUNT_BLOCKED', 'Your account has been blocked.', {
          reason: 'Payment dispute',
          supportEmail: 'support@planpilot.demo',
        }),
      ),
    );

    const { store, call } = setup();
    await call({ url: '/my-subscription' });

    expect(mocks.post).not.toHaveBeenCalled();
    expect(store.getState().auth).toMatchObject({
      status: 'anonymous',
      endReason: 'restricted',
      restriction: {
        code: 'ACCOUNT_BLOCKED',
        reason: 'Payment dispute',
        supportEmail: 'support@planpilot.demo',
      },
    });
  });

  it('leaves the session alone for ordinary errors', async () => {
    mocks.request.mockRejectedValue(axiosError(409, apiError('PLAN_LIMIT_REACHED')));

    const { store, call } = setup();
    const result = await call({ url: '/workspace/projects', method: 'POST', body: {} });

    expect(result.error?.code).toBe('PLAN_LIMIT_REACHED');
    expect(store.getState().auth.status).toBe('authenticated');
  });
});

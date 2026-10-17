import { ACCOUNT_BLOCKING_CODES, ERROR_CODES } from '@planpilot/shared';
import type { AuthResponse, PageMeta } from '@planpilot/shared';
import type { BaseQueryFn } from '@reduxjs/toolkit/query/react';
import type { AxiosRequestConfig } from 'axios';
import { accountRestricted, sessionEnded, sessionStarted } from '../features/auth/authSlice';
import type { AuthState } from '../features/auth/authSlice';
import { toAppError } from './errors';
import type { AppError } from './errors';
import { http } from './http';

export interface RequestArgs {
  url: string;
  method?: AxiosRequestConfig['method'];
  body?: unknown;
  params?: Record<string, unknown>;
}

export interface QueryMeta {
  page?: PageMeta;
}

type StateWithAuth = { auth: AuthState };

/** Calls the API through the encrypted Axios instance and unwraps `{ success, data, meta }`. */
const rawBaseQuery: BaseQueryFn<RequestArgs, unknown, AppError, object, QueryMeta> = async (
  args,
  api,
) => {
  const token = (api.getState() as StateWithAuth).auth.accessToken;
  try {
    const res = await http.request({
      url: args.url,
      method: args.method ?? 'GET',
      data: args.body,
      params: args.params,
      signal: api.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const body = res.data as { data: unknown; meta?: PageMeta };
    return { data: body.data, meta: { page: body.meta } };
  } catch (error) {
    return { error: toAppError(error) };
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callRefresh(): Promise<AuthResponse> {
  try {
    const res = await http.post<{ data: AuthResponse }>('/auth/refresh');
    return res.data.data;
  } catch (error) {
    const appError = toAppError(error);
    // Another tab rotated the cookie a moment ago: the browser now holds the new one.
    if (appError.meta.retry) {
      await wait(400);
      const res = await http.post<{ data: AuthResponse }>('/auth/refresh');
      return res.data.data;
    }
    throw error;
  }
}

let inFlight: Promise<AuthResponse | AppError> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers share one
 * request (single flight), and the Web Locks API stops two tabs refreshing at once.
 */
export function refreshAccessToken(): Promise<AuthResponse | AppError> {
  inFlight ??= (async () => {
    try {
      const run = () => callRefresh();
      return await (navigator.locks ? navigator.locks.request('planpilot-refresh', run) : run());
    } catch (error) {
      return toAppError(error);
    } finally {
      setTimeout(() => {
        inFlight = null;
      }, 0);
    }
  })();
  return inFlight;
}

export const isAuthResponse = (value: AuthResponse | AppError): value is AuthResponse =>
  'accessToken' in value;

const RETRY_WITH_REFRESH: string[] = [ERROR_CODES.TOKEN_EXPIRED, ERROR_CODES.INVALID_TOKEN];

export const baseQueryWithReauth: BaseQueryFn<
  RequestArgs,
  unknown,
  AppError,
  object,
  QueryMeta
> = async (args, api, extra) => {
  let result = await rawBaseQuery(args, api, extra);
  const hadSession = Boolean((api.getState() as StateWithAuth).auth.accessToken);

  if (
    result.error?.status === 401 &&
    hadSession &&
    RETRY_WITH_REFRESH.includes(result.error.code)
  ) {
    const refreshed = await refreshAccessToken();
    if (isAuthResponse(refreshed)) {
      api.dispatch(sessionStarted(refreshed));
      result = await rawBaseQuery(args, api, extra);
    } else {
      handleSessionError(refreshed, api.dispatch);
      return { error: refreshed };
    }
  }

  if (result.error) handleSessionError(result.error, api.dispatch);
  return result;
};

/** Account restrictions and dead sessions end the session wherever they surface. */
export function handleSessionError(error: AppError, dispatch: (action: unknown) => unknown) {
  if (ACCOUNT_BLOCKING_CODES.includes(error.code as never)) {
    dispatch(
      accountRestricted({
        code: error.code as never,
        message: error.message,
        reason: (error.meta.reason as string | null) ?? null,
        supportEmail: (error.meta.supportEmail as string | null) ?? null,
        expiredAt: (error.meta.expiredAt as string | null) ?? null,
      }),
    );
    dispatch(sessionEnded('restricted'));
    return;
  }
  if (
    error.status === 401 &&
    (error.code === ERROR_CODES.SESSION_EXPIRED || RETRY_WITH_REFRESH.includes(error.code))
  ) {
    dispatch(sessionEnded('expired'));
  }
}

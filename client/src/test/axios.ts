import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;

/** An Axios error as the HTTP client would reject with (status 0 = no response). */
export function axiosError(status: number, data?: unknown, code?: string) {
  const response = { status, data, headers: {}, config, statusText: '' } as AxiosResponse;
  return new AxiosError('Request failed', code, config, {}, status ? response : undefined);
}

/** The API's error body. */
export const apiError = (code: string, message = code, meta: Record<string, unknown> = {}) => ({
  success: false,
  error: { code, message, details: [], meta },
});

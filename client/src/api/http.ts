import {
  ENC_HEADERS,
  newNonce,
  open,
  requestAad,
  responseAad,
  seal,
} from '@planpilot/shared/crypto';
import axios, { isAxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import { encryptionEnabled, getCryptoSession } from './crypto-session';

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    /** Nonce of the sealed request; the response is bound to it. */
    encNonce?: string;
    /** The body before sealing, kept so a retry can seal it again. */
    plainData?: unknown;
    staleRetried?: boolean;
  }
}

/** Difference between server and device clocks, learnt from responses. */
let clockOffsetMs = 0;
const syncClock = (dateHeader: unknown) => {
  const serverTime = typeof dateHeader === 'string' ? Date.parse(dateHeader) : Number.NaN;
  if (Number.isNaN(serverTime)) return;
  const offset = serverTime - Date.now();
  // The Date header only has second precision, so ignore small differences.
  if (Math.abs(offset) > 30_000) clockOffsetMs = offset;
};

export const http = axios.create({
  baseURL: '/api',
  // Render's free tier can take ~50 s to wake up.
  timeout: 70_000,
  withCredentials: true,
  headers: { Accept: 'application/json', 'X-Requested-With': 'planpilot' },
});

// Seal the body and add the envelope headers.
http.interceptors.request.use(async (config) => {
  if (!encryptionEnabled) return config;
  const session = await getCryptoSession();
  const nonce = newNonce();
  const ts = String(Date.now() + clockOffsetMs);
  const method = (config.method ?? 'get').toUpperCase();
  const path = new URL(http.getUri(config), window.location.origin).pathname;

  config.headers.set(ENC_HEADERS.session, session.publicKey);
  config.headers.set(ENC_HEADERS.kid, session.kid);
  config.headers.set(ENC_HEADERS.ts, ts);
  config.headers.set(ENC_HEADERS.nonce, nonce);
  config.encNonce = nonce;

  const body = config.plainData !== undefined ? config.plainData : config.data;
  if (body !== undefined && body !== null && !(body instanceof FormData)) {
    config.plainData = body;
    config.data = await seal(session.key, body, requestAad(method, path, ts, nonce));
  }
  return config;
});

async function openResponse(response: AxiosResponse) {
  syncClock(response.headers.date);
  if (response.headers[ENC_HEADERS.response] === '1' && response.config.encNonce) {
    const session = await getCryptoSession();
    response.data = await open(
      session.key,
      response.data,
      responseAad(response.config.encNonce, response.status),
    );
  }
  return response;
}

// Open the sealed response (errors too), and fix a wrong device clock once.
http.interceptors.response.use(openResponse, async (error: unknown) => {
  if (isAxiosError(error) && error.response) {
    try {
      await openResponse(error.response);
    } catch {
      // An unreadable error body falls through as a generic server error.
    }
    const body = error.response.data as
      { error?: { code?: string; meta?: { serverTime?: number } } } | undefined;
    const config = error.config;
    if (body?.error?.code === 'STALE_REQUEST' && config && !config.staleRetried) {
      const serverTime = Number(body.error.meta?.serverTime);
      if (serverTime) clockOffsetMs = serverTime - Date.now();
      config.staleRetried = true;
      return http.request(config);
    }
  }
  throw error;
});

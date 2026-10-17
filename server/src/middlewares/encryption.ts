import { ERROR_CODES } from '@planpilot/shared';
import {
  ENC_HEADERS,
  EnvelopeError,
  MAX_CLOCK_SKEW_MS,
  deriveServerSessionKey,
  importServerPrivateKey,
  open,
  requestAad,
  responseAad,
  seal,
} from '@planpilot/shared/crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '../utils/api-error';
import { TtlCache } from '../utils/ttl-cache';

export interface EncryptionOptions {
  privateKey: string;
  publicKey: string;
  kid: string;
  /** When true, requests without an envelope session are refused. */
  required: boolean;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const NONCE_PATTERN = /^[A-Za-z0-9+/]{22}==$/; // 16 random bytes in base64
const SESSION_PATTERN = /^[A-Za-z0-9+/]{87}=$/; // 65-byte raw P-256 public key
const NONCE_TTL_MS = 2 * MAX_CLOCK_SKEW_MS + 60_000;

const hasBody = (req: Request) =>
  req.body !== undefined &&
  req.body !== null &&
  !(typeof req.body === 'object' && Object.keys(req.body).length === 0);

/**
 * Decrypts request bodies and encrypts every JSON response for clients that opened
 * an envelope session (X-Enc-Session header). Mounted after the body parser and
 * before input sanitising, so decrypted data still goes through every check.
 */
export function encryptedPayloads(options: EncryptionOptions): RequestHandler {
  let serverKey: Promise<CryptoKey> | undefined;
  const sessionKeys = new TtlCache<string, Promise<CryptoKey>>(30 * 60_000, 2_000);
  const seenNonces = new TtlCache<string, true>(NONCE_TTL_MS, 50_000);

  const keyFor = (clientPublicKey: string) => {
    let key = sessionKeys.get(clientPublicKey);
    if (!key) {
      serverKey ??= importServerPrivateKey(options.privateKey);
      key = serverKey.then((priv) =>
        deriveServerSessionKey(priv, options.publicKey, clientPublicKey),
      );
      // A bad key must not poison the cache for the next attempt.
      key.catch(() => sessionKeys.delete(clientPublicKey));
      sessionKeys.set(clientPublicKey, key);
    }
    return key;
  };

  return async (req: Request, res: Response, next: NextFunction) => {
    const session = req.get(ENC_HEADERS.session);
    if (!session) {
      if (options.required) {
        throw ApiError.badRequest(
          'This API only accepts encrypted requests',
          ERROR_CODES.ENCRYPTION_REQUIRED,
        );
      }
      return next();
    }

    const kid = req.get(ENC_HEADERS.kid);
    const ts = req.get(ENC_HEADERS.ts) ?? '';
    const nonce = req.get(ENC_HEADERS.nonce) ?? '';
    if (kid !== options.kid) {
      throw ApiError.badRequest(
        'Encryption key is out of date. Reload the page.',
        ERROR_CODES.UNKNOWN_KEY,
      );
    }
    if (!SESSION_PATTERN.test(session) || !NONCE_PATTERN.test(nonce) || !/^\d{13}$/.test(ts)) {
      throw ApiError.badRequest('The request could not be read', ERROR_CODES.INVALID_PAYLOAD);
    }

    let key: CryptoKey;
    try {
      key = await keyFor(session);
    } catch (error) {
      if (error instanceof EnvelopeError) {
        throw ApiError.badRequest('The request could not be read', ERROR_CODES.INVALID_PAYLOAD);
      }
      throw error;
    }

    // From here on every JSON response, errors included, is sealed for this request.
    const sendJson = res.json.bind(res);
    res.json = (body: unknown) => {
      seal(key, body, responseAad(nonce, res.statusCode))
        .then((envelope) => {
          res.setHeader(ENC_HEADERS.response, '1');
          // A sealed response only opens for the request that asked for it, so it must never be cached.
          res.setHeader('Cache-Control', 'no-store');
          sendJson(envelope);
        })
        .catch(next);
      return res;
    };

    if (Math.abs(Date.now() - Number(ts)) > MAX_CLOCK_SKEW_MS) {
      throw ApiError.badRequest(
        'Request expired. Check your device clock.',
        ERROR_CODES.STALE_REQUEST,
        {
          serverTime: Date.now(),
        },
      );
    }

    if (MUTATING.has(req.method)) {
      if (seenNonces.has(nonce)) {
        throw ApiError.conflict('This request was already processed', ERROR_CODES.REPLAYED_REQUEST);
      }
      seenNonces.set(nonce, true);
    }

    if (hasBody(req)) {
      const path = req.originalUrl.split('?')[0] ?? '';
      try {
        req.body = await open(key, req.body, requestAad(req.method, path, ts, nonce));
      } catch (error) {
        if (error instanceof EnvelopeError) {
          // One generic message for every failure, so nothing leaks about why.
          throw ApiError.badRequest('The request could not be read', ERROR_CODES.INVALID_PAYLOAD);
        }
        throw error;
      }
    }

    next();
  };
}

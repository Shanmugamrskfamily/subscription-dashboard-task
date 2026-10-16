import { beforeAll, describe, expect, it } from 'vitest';
import {
  EnvelopeError,
  createClientSession,
  deriveServerSessionKey,
  generateServerKeyPair,
  importPublicKey,
  importServerPrivateKey,
  isEnvelope,
  newNonce,
  open,
  requestAad,
  responseAad,
  seal,
} from '../src/crypto';
import { fromBase64, toBase64 } from '../src/crypto/encoding';

let server: { privateKey: string; publicKey: string };
let serverPrivate: CryptoKey;

beforeAll(async () => {
  server = await generateServerKeyPair();
  serverPrivate = await importServerPrivateKey(server.privateKey);
});

describe('key agreement', () => {
  it('derives the same AES key on both sides', async () => {
    const client = await createClientSession(server.publicKey, 'k1');
    const serverKey = await deriveServerSessionKey(
      serverPrivate,
      server.publicKey,
      client.publicKey,
    );
    const aad = requestAad('post', '/api/auth/login', '1700000000000', newNonce());

    const sealed = await seal(client.key, { email: 'a@b.co' }, aad);
    await expect(open(serverKey, sealed, aad)).resolves.toEqual({ email: 'a@b.co' });

    const reply = await seal(serverKey, { ok: true }, responseAad('n1', 200));
    await expect(open(client.key, reply, responseAad('n1', 200))).resolves.toEqual({ ok: true });
  });

  it('gives every tab its own key', async () => {
    const a = await createClientSession(server.publicKey, 'k1');
    const b = await createClientSession(server.publicKey, 'k1');
    expect(a.publicKey).not.toBe(b.publicKey);
    const sealed = await seal(a.key, { secret: 1 }, 'aad');
    await expect(open(b.key, sealed, 'aad')).rejects.toBeInstanceOf(EnvelopeError);
  });

  it('rejects public keys that are not uncompressed P-256 points', async () => {
    await expect(importPublicKey('not base64!!')).rejects.toThrow(EnvelopeError);
    await expect(importPublicKey(toBase64(new Uint8Array(65)))).rejects.toThrow(/uncompressed/);
    const offCurve = new Uint8Array(65);
    offCurve[0] = 4;
    offCurve.fill(7, 1);
    await expect(importPublicKey(toBase64(offCurve))).rejects.toThrow(/curve/);
  });
});

describe('seal and open', () => {
  let key: CryptoKey;
  beforeAll(async () => {
    key = (await createClientSession(server.publicKey, 'k1')).key;
  });

  it('uses a fresh IV every time, so equal payloads never look equal', async () => {
    const a = await seal(key, { same: true }, 'aad');
    const b = await seal(key, { same: true }, 'aad');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('detects a single flipped byte', async () => {
    const sealed = await seal(key, { amount: 79900 }, 'aad');
    const bytes = fromBase64(sealed.ct);
    bytes[0] = (bytes[0] ?? 0) ^ 0x01;
    await expect(open(key, { ...sealed, ct: toBase64(bytes) }, 'aad')).rejects.toThrow(
      'Envelope could not be decrypted',
    );
  });

  it('refuses a body moved onto a different request (AAD mismatch)', async () => {
    const sealed = await seal(
      key,
      { planId: 'x' },
      requestAad('POST', '/api/subscribe/a', '1', 'n1'),
    );
    await expect(
      open(key, sealed, requestAad('POST', '/api/subscribe/b', '1', 'n1')),
    ).rejects.toThrow(EnvelopeError);
  });

  it('round-trips undefined as null', async () => {
    await expect(open(key, await seal(key, undefined, 'a'), 'a')).resolves.toBeNull();
  });

  it('rejects malformed envelopes before touching the cipher', async () => {
    await expect(open(key, null, 'a')).rejects.toThrow('Body is not an envelope');
    await expect(open(key, { v: 1, iv: '!!', ct: '!!' }, 'a')).rejects.toThrow('base64');
    await expect(
      open(key, { v: 1, iv: toBase64(new Uint8Array(4)), ct: 'AAAA' }, 'a'),
    ).rejects.toThrow('wrong shape');
  });

  it('rejects ciphertext that decrypts to something other than JSON', async () => {
    const iv = new Uint8Array(12);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('a') },
      key,
      new TextEncoder().encode('not json'),
    );
    await expect(open(key, { v: 1, iv: toBase64(iv), ct: toBase64(ct) }, 'a')).rejects.toThrow(
      'not JSON',
    );
  });
});

describe('helpers', () => {
  it('recognises only exact envelopes', () => {
    expect(isEnvelope({ v: 1, iv: 'a', ct: 'b' })).toBe(true);
    expect(isEnvelope({ v: 1, iv: 'a', ct: 'b', extra: 1 })).toBe(false);
    expect(isEnvelope({ v: 2, iv: 'a', ct: 'b' })).toBe(false);
    expect(isEnvelope('x')).toBe(false);
  });

  it('builds AAD strings with an upper-case method', () => {
    expect(requestAad('patch', '/api/x', '5', 'n')).toBe('req|PATCH|/api/x|5|n');
    expect(responseAad('n', 201)).toBe('res|n|201');
  });

  it('creates 16-byte random nonces', () => {
    expect(fromBase64(newNonce())).toHaveLength(16);
    expect(newNonce()).not.toBe(newNonce());
  });
});

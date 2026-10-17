import {
  ENC_HEADERS,
  createClientSession,
  newNonce,
  open,
  requestAad,
  responseAad,
  seal,
} from '@planpilot/shared/crypto';
import type { ClientSession } from '@planpilot/shared/crypto';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env';
import { PASSWORD, makeApp, registerUser } from './helpers';

// The production setup: encryption switched on and required.
const app = makeApp({ config: loadConfig({ ...process.env, ENCRYPTION_REQUIRED: 'true' }) });

let session: ClientSession;
beforeAll(async () => {
  session = await createClientSession(process.env.PAYLOAD_PUBLIC_KEY as string, 'k1');
});

interface Call {
  method: 'get' | 'post';
  path: string;
  body?: unknown;
  token?: string;
  overrides?: Partial<Record<string, string>>;
  tamper?: (envelope: { v: 1; iv: string; ct: string }) => unknown;
  nonce?: string;
  ts?: string;
}

/** What the browser does: seal the body, send envelope headers, open the reply. */
async function call({
  method,
  path,
  body,
  token,
  overrides = {},
  tamper,
  nonce = newNonce(),
  ts = String(Date.now()),
}: Call) {
  const agent = request(app);
  let req = (method === 'get' ? agent.get(path) : agent.post(path))
    .set(ENC_HEADERS.session, session.publicKey)
    .set(ENC_HEADERS.kid, 'k1')
    .set(ENC_HEADERS.ts, ts)
    .set(ENC_HEADERS.nonce, nonce);
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) req = req.set(k, v);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) {
    const envelope = await seal(session.key, body, requestAad(method, path, ts, nonce));
    req = req.send((tamper ? tamper(envelope) : envelope) as object);
  }
  const res = await req;
  const encrypted = res.headers[ENC_HEADERS.response] === '1';
  const data = encrypted
    ? await open<Record<string, unknown>>(session.key, res.body, responseAad(nonce, res.status))
    : res.body;
  return {
    res,
    data: data as { success: boolean; data?: Record<string, unknown>; error?: { code: string } },
    encrypted,
    nonce,
  };
}

describe('encrypted API (encryption required)', () => {
  it('refuses plain requests', async () => {
    const res = await request(app).get('/api/plans').expect(400);
    expect(res.body.error.code).toBe('ENCRYPTION_REQUIRED');
  });

  it('still serves health and docs in plain JSON', async () => {
    await request(app).get('/api/health').expect(200);
  });

  it('round-trips an encrypted login and encrypts the response', async () => {
    const { user } = await registerUser({ email: 'enc@example.com' });
    const { res, data, encrypted } = await call({
      method: 'post',
      path: '/api/auth/login',
      body: { email: 'enc@example.com', password: PASSWORD },
    });
    expect(res.status).toBe(200);
    expect(encrypted).toBe(true);
    // On the wire there is only ciphertext.
    expect(Object.keys(res.body).sort()).toEqual(['ct', 'iv', 'v']);
    expect(JSON.stringify(res.body)).not.toContain('enc@example.com');
    expect(data.data?.user).toMatchObject({ id: user.id });
  });

  it('encrypts error responses too', async () => {
    const { res, data, encrypted } = await call({
      method: 'post',
      path: '/api/auth/login',
      body: { email: 'bad', password: 'x' },
    });
    expect(res.status).toBe(422);
    expect(encrypted).toBe(true);
    expect(data.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a tampered body with one generic error', async () => {
    const { res, data } = await call({
      method: 'post',
      path: '/api/auth/login',
      body: { email: 'a@b.co', password: PASSWORD },
      tamper: (env) => ({ ...env, ct: `A${env.ct.slice(1)}` }),
    });
    expect(res.status).toBe(400);
    expect(data.error?.code).toBe('INVALID_PAYLOAD');
  });

  it('rejects a body sealed for a different path', async () => {
    const nonce = newNonce();
    const ts = String(Date.now());
    const envelope = await seal(
      session.key,
      { email: 'a@b.co', password: PASSWORD },
      requestAad('post', '/api/auth/register', ts, nonce),
    );
    const res = await request(app)
      .post('/api/auth/login')
      .set(ENC_HEADERS.session, session.publicKey)
      .set(ENC_HEADERS.kid, 'k1')
      .set(ENC_HEADERS.ts, ts)
      .set(ENC_HEADERS.nonce, nonce)
      .send(envelope);
    expect(res.status).toBe(400);
  });

  it('refuses a replayed request', async () => {
    const nonce = newNonce();
    const first = await call({
      method: 'post',
      path: '/api/auth/login',
      body: { email: 'x@y.co', password: 'Nope12345' },
      nonce,
    });
    expect(first.res.status).toBe(401);
    const replay = await call({
      method: 'post',
      path: '/api/auth/login',
      body: { email: 'x@y.co', password: 'Nope12345' },
      nonce,
    });
    expect(replay.res.status).toBe(409);
    expect(replay.data.error?.code).toBe('REPLAYED_REQUEST');
  });

  it('refuses stale timestamps and unknown key ids', async () => {
    const stale = await call({
      method: 'get',
      path: '/api/plans',
      ts: String(Date.now() - 10 * 60_000),
    });
    expect(stale.data.error?.code).toBe('STALE_REQUEST');
    const wrongKid = await call({
      method: 'get',
      path: '/api/plans',
      overrides: { [ENC_HEADERS.kid]: 'k9' },
    });
    expect(wrongKid.res.status).toBe(400);
    expect(wrongKid.res.body.error.code).toBe('UNKNOWN_KEY');
  });

  it('binds each response to its own request', async () => {
    const { res, nonce } = await call({ method: 'get', path: '/api/plans' });
    expect(res.status).toBe(200);
    // Never cached: a stored copy could not be opened by any later request.
    expect(res.headers['cache-control']).toBe('no-store');
    await expect(
      open(session.key, res.body, responseAad(`${nonce.slice(0, -4)}AAA=`, 200)),
    ).rejects.toThrow();
    await expect(open(session.key, res.body, responseAad(nonce, 201))).rejects.toThrow();
  });

  it('rejects a malformed session header', async () => {
    const res = await request(app)
      .get('/api/plans')
      .set(ENC_HEADERS.session, 'not-a-key')
      .set(ENC_HEADERS.kid, 'k1')
      .set(ENC_HEADERS.ts, String(Date.now()))
      .set(ENC_HEADERS.nonce, newNonce())
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_PAYLOAD');
  });
});

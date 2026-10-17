import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { SessionModel } from '../src/modules/auth/session.model';
import { UserModel } from '../src/modules/users/user.model';
import { APP_HEADER, PASSWORD, api, login, registerUser } from './helpers';

describe('POST /api/auth/register', () => {
  it('creates the account, signs it in and sets an HttpOnly refresh cookie', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Priya Sharma', email: 'Priya@Example.com', password: PASSWORD })
      .expect(201);

    expect(res.body.data.user).toMatchObject({
      name: 'Priya Sharma',
      email: 'priya@example.com',
      role: 'user',
      status: 'active',
    });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|failedLogins/);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^pp_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it('never lets a client pick its own role', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Mallory', email: 'mallory@example.com', password: PASSWORD, role: 'admin' })
      .expect(201);
    expect(res.body.data.user.role).toBe('user');
  });

  it('rejects a duplicate email with a clear code', async () => {
    await registerUser({ email: 'dup@example.com' });
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Second', email: 'DUP@example.com', password: PASSWORD })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('returns every failing rule with the field it belongs to', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'x', email: 'nope', password: 'short' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
    expect(res.body.error.requestId).toEqual(expect.any(String));
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with the right password', async () => {
    const { user } = await registerUser({ email: 'login@example.com' });
    const res = await login('login@example.com').expect(200);
    expect(res.body.data.user.id).toBe(user.id);
  });

  it('answers a wrong password and an unknown email identically', async () => {
    await registerUser({ email: 'known@example.com' });
    const wrong = await login('known@example.com', 'Wrong1234').expect(401);
    const unknown = await login('nobody@example.com', 'Wrong1234').expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error).toMatchObject({
      code: wrong.body.error.code,
      message: wrong.body.error.message,
    });
    expect(unknown.body.error.meta).toEqual(wrong.body.error.meta);
  });

  it('locks the account for 15 minutes after five failures', async () => {
    await registerUser({ email: 'lock@example.com' });
    for (let i = 0; i < 4; i += 1) await login('lock@example.com', 'Wrong1234').expect(401);
    const locked = await login('lock@example.com', 'Wrong1234').expect(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(800);
    // Even the right password is refused while locked.
    await login('lock@example.com').expect(429);
  });

  it('locks unknown emails the same way, so lockouts reveal nothing', async () => {
    for (let i = 0; i < 4; i += 1) await login('ghost@example.com', 'Wrong1234').expect(401);
    const res = await login('ghost@example.com', 'Wrong1234').expect(429);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });
});

describe('refresh tokens', () => {
  const refresh = (cookie: string) =>
    api().post('/api/auth/refresh').set(APP_HEADER).set('Cookie', cookie);
  const newCookie = (res: { headers: Record<string, unknown> }) =>
    ((res.headers['set-cookie'] as string[] | undefined)?.[0] ?? '').split(';')[0] ?? '';

  it('rotates the refresh token and issues a new access token', async () => {
    const session = await registerUser();
    const res = await refresh(session.cookie).expect(200);
    expect(newCookie(res)).not.toBe(session.cookie);
    expect(res.body.data.accessToken).not.toBe(session.token);
  });

  it('asks a racing tab to retry instead of signing everyone out', async () => {
    const session = await registerUser();
    await refresh(session.cookie).expect(200);
    const race = await refresh(session.cookie).expect(401);
    expect(race.body.error).toMatchObject({ code: 'SESSION_EXPIRED', meta: { retry: true } });
  });

  it('treats an old token used later as theft and revokes the whole device session', async () => {
    const session = await registerUser();
    const first = await refresh(session.cookie).expect(200);
    // Age the rotation past the grace window.
    await SessionModel.updateMany(
      { revokedReason: 'rotated' },
      { revokedAt: new Date(Date.now() - 60_000) },
    );

    const reuse = await refresh(session.cookie).expect(401);
    expect(reuse.body.error.code).toBe('SESSION_EXPIRED');
    expect(reuse.body.error.meta).toBeUndefined();
    // The legitimate newer token is now dead too.
    await refresh(newCookie(first)).expect(401);
    // And so is the access token issued for that session.
    await api().get('/api/auth/me').set(session.auth).expect(401);
  });

  it('requires the app header (CSRF guard) and a cookie', async () => {
    const session = await registerUser();
    await api().post('/api/auth/refresh').set('Cookie', session.cookie).expect(403);
    await api().post('/api/auth/refresh').set(APP_HEADER).expect(401);
    await api()
      .post('/api/auth/refresh')
      .set(APP_HEADER)
      .set('Origin', 'https://evil.example')
      .set('Cookie', session.cookie)
      .expect(403);
  });

  it('logout revokes the session and clears the cookie', async () => {
    const session = await registerUser();
    const res = await api()
      .post('/api/auth/logout')
      .set(APP_HEADER)
      .set('Cookie', session.cookie)
      .expect(200);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/pp_rt=;/);
    await refresh(session.cookie).expect(401);
    await api().get('/api/auth/me').set(session.auth).expect(401);
  });
});

describe('access tokens', () => {
  it('rejects requests without a token', async () => {
    const res = await api().get('/api/auth/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects "alg: none" and tokens signed with another secret', async () => {
    const { user } = await registerUser();
    const unsigned = jwt.sign({ role: 'admin', sid: 'x' }, '', {
      algorithm: 'none',
      subject: user.id,
    });
    await api().get('/api/auth/me').set('Authorization', `Bearer ${unsigned}`).expect(401);
    const forged = jwt.sign({ role: 'admin', sid: 'x' }, 'some-other-secret', {
      subject: user.id,
      issuer: 'planpilot-api',
      audience: 'planpilot-web',
    });
    const res = await api()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('reports expired tokens with their own code so the client refreshes', async () => {
    const { user } = await registerUser();
    const expired = jwt.sign({ role: 'user', sid: 'x' }, process.env.JWT_ACCESS_SECRET as string, {
      subject: user.id,
      issuer: 'planpilot-api',
      audience: 'planpilot-web',
      expiresIn: -10,
    });
    const res = await api()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('reads the role from the database, not from the token', async () => {
    const session = await registerUser();
    await UserModel.updateOne({ _id: session.user.id }, { role: 'admin' });
    await api().get('/api/admin/plans').set(session.auth).expect(200);
  });
});

import { describe, expect, it } from 'vitest';
import { api, registerUser } from './helpers';

describe('injection and XSS defences', () => {
  it('rejects MongoDB operators in the body, query and nested fields', async () => {
    const body = await api()
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: 'x' })
      .expect(400);
    expect(body.body.error.message).toMatch(/\$gt/);
    await api()
      .post('/api/auth/login')
      .send({ email: 'a@b.co', password: 'x', nested: { 'a.b': 1 } })
      .expect(400);
    const query = await api().get('/api/plans?$where=1').expect(400);
    expect(query.body.error.code).toBe('BAD_REQUEST');
  });

  it('ignores bracket syntax in query strings (no nested objects)', async () => {
    const user = await registerUser();
    // With the simple parser "status[$ne]" is a literal key, which validation rejects.
    await api().get('/api/notifications?unread[$ne]=1').set(user.auth).expect(400);
  });

  it('stores names as plain text with markup stripped', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({
        name: '<img src=x onerror=alert(1)>Priya',
        email: 'xss@example.com',
        password: 'Secure123',
      })
      .expect(201);
    expect(res.body.data.user.name).toBe('Priya');
  });

  it('rejects names that are only markup after cleaning', async () => {
    await api()
      .post('/api/auth/register')
      .send({ name: '<script></script>', email: 'xss2@example.com', password: 'Secure123' })
      .expect(422);
  });
});

describe('transport and headers', () => {
  it('sends strict security headers on every response', async () => {
    const res = await api().get('/api/health').expect(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('only allows configured origins', async () => {
    await api().get('/api/plans').set('Origin', 'http://localhost:5173').expect(200);
    const res = await api().get('/api/plans').set('Origin', 'https://evil.example').expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('echoes a safe incoming request id and replaces an unsafe one', async () => {
    const good = await api().get('/api/health').set('X-Request-Id', 'abc12345-trace');
    expect(good.headers['x-request-id']).toBe('abc12345-trace');
    const bad = await api().get('/api/health').set('X-Request-Id', '<script>');
    expect(bad.headers['x-request-id']).not.toBe('<script>');
  });
});

describe('error handling', () => {
  it('answers malformed JSON with a 400, not a crash', async () => {
    const res = await api()
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400);
    expect(res.body).toMatchObject({ success: false, error: { code: 'INVALID_JSON' } });
  });

  it('refuses oversized bodies', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'x'.repeat(20_000), email: 'big@example.com', password: 'Secure123' })
      .expect(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('uses one JSON shape for unknown routes', async () => {
    const res = await api().get('/api/nope').expect(404);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route GET /api/nope does not exist',
        requestId: expect.any(String),
      },
    });
  });

  it('serves the API docs and health check without encryption', async () => {
    await api().get('/api/openapi.json').expect(200);
    const res = await api().get('/api/health').expect(200);
    expect(res.body.data).toMatchObject({ status: 'ok', database: 'up' });
  });
});

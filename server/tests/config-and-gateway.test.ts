import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigError, loadConfig } from '../src/config/env';
import {
  getGateway,
  setGateway,
  signPayment,
  signatureMatches,
} from '../src/modules/payments/gateway';
import { TtlCache } from '../src/utils/ttl-cache';
import { api, buyPlan, makeApp, registerUser, seedPlans } from './helpers';

describe('configuration', () => {
  it('lists every production problem at once', () => {
    let error: unknown;
    try {
      loadConfig({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'short' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).problems).toEqual(
      expect.arrayContaining([
        'MONGODB_URI is required in production',
        'JWT_ACCESS_SECRET must be at least 32 characters',
        expect.stringContaining('PAYLOAD_PRIVATE_KEY'),
      ]),
    );
  });

  it('allows only Razorpay test keys and requires both halves', () => {
    expect(() => loadConfig({ PAYMENTS_MODE: 'razorpay' })).toThrow(ConfigError);
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://x',
        JWT_ACCESS_SECRET: 'x'.repeat(40),
        PAYLOAD_PRIVATE_KEY: 'a',
        PAYLOAD_PUBLIC_KEY: 'b',
        RAZORPAY_KEY_ID: 'rzp_live_123',
        RAZORPAY_KEY_SECRET: 'secret',
      }),
    ).toThrow(/TEST keys/);
  });

  it('derives sensible defaults', () => {
    const config = loadConfig({
      CLIENT_ORIGINS: 'https://a.app/, http://localhost:5173',
      DNS_SERVERS: '8.8.8.8, 1.1.1.1',
    });
    expect(config.clientOrigins).toEqual(['https://a.app', 'http://localhost:5173']);
    expect(config.dnsServers).toEqual(['8.8.8.8', '1.1.1.1']);
    expect(config.payments.mode).toBe('simulated');
    expect(config.payload.required).toBe(false);
    expect(config.cookie).toEqual({ name: 'pp_rt', secure: false });
    const prod = loadConfig({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://x',
      JWT_ACCESS_SECRET: 'x'.repeat(40),
      PAYLOAD_PRIVATE_KEY: 'a',
      PAYLOAD_PUBLIC_KEY: 'b',
      PAYMENTS_MODE: 'simulated',
    });
    expect(prod.payload.required).toBe(true);
    expect(prod.cookie).toEqual({ name: '__Host-pp_rt', secure: true });
  });

  it('rejects malformed values', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(ConfigError);
    expect(() => loadConfig({ PAYLOAD_KID: 'Bad Kid!' })).toThrow(ConfigError);
  });
});

describe('rate limiting', () => {
  it('limits repeated failed sign-ins and says when to retry', async () => {
    const limited = makeApp({ rateLimits: true });
    let last: request.Response | undefined;
    for (let i = 0; i < 21; i += 1) {
      last = await request(limited)
        .post('/api/auth/login')
        .send({ email: `rl${i}@example.com`, password: 'Wrong1234' });
    }
    expect(last?.status).toBe(429);
    expect(last?.body.error.code).toBe('RATE_LIMITED');
    expect(last?.headers['retry-after']).toBe('900');
  });
});

describe('Razorpay gateway', () => {
  const realConfig = loadConfig({
    RAZORPAY_KEY_ID: 'rzp_test_abc',
    RAZORPAY_KEY_SECRET: 'shh',
    PAYMENTS_MODE: 'razorpay',
  });
  beforeEach(() => setGateway(undefined));
  afterEach(() => {
    vi.unstubAllGlobals();
    setGateway(undefined);
  });

  it('creates orders through the Razorpay API with basic auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'order_ABC123456', amount: 79_900 }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const gateway = getGateway(realConfig);
    expect(gateway.mode).toBe('razorpay');
    await expect(
      gateway.createOrder({ amount: 79_900, receipt: 'r1', notes: {} }),
    ).resolves.toEqual({
      id: 'order_ABC123456',
      amount: 79_900,
      currency: 'INR',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('rzp_test_abc:shh').toString('base64')}`,
    );
  });

  it('turns Razorpay outages and rejections into a 502 with a clear code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(
      getGateway(realConfig).createOrder({ amount: 1, receipt: 'r', notes: {} }),
    ).rejects.toMatchObject({
      status: 502,
      code: 'GATEWAY_ERROR',
    });
    setGateway(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 400 })));
    await expect(
      getGateway(realConfig).createOrder({ amount: 1, receipt: 'r', notes: {} }),
    ).rejects.toMatchObject({
      status: 502,
    });
  });

  it('verifies signatures in constant time and rejects wrong lengths', () => {
    const signature = signPayment('shh', 'order_1', 'pay_1');
    expect(signatureMatches('shh', 'order_1', 'pay_1', signature)).toBe(true);
    expect(signatureMatches('shh', 'order_1', 'pay_2', signature)).toBe(false);
    expect(signatureMatches('shh', 'order_1', 'pay_1', 'abcd')).toBe(false);
    expect(getGateway(realConfig).verifySignature('order_1', 'pay_1', signature)).toBe(true);
  });
});

describe('workspace edits', () => {
  it('renames projects and removes team members, read-only without a plan', async () => {
    const plans = await seedPlans();
    const user = await registerUser();
    await buyPlan(user, plans.pro._id.toString());
    const project = (
      await api().post('/api/projects').set(user.auth).send({ name: 'Website' }).expect(201)
    ).body.data;
    const renamed = await api()
      .patch(`/api/projects/${project.id}`)
      .set(user.auth)
      .send({ name: 'Website v2', color: 'emerald' })
      .expect(200);
    expect(renamed.body.data).toMatchObject({ name: 'Website v2', color: 'emerald' });
    await api()
      .patch('/api/projects/6a0000000000000000000000')
      .set(user.auth)
      .send({ name: 'Ghost' })
      .expect(404);

    const member = (
      await api()
        .post('/api/team')
        .set(user.auth)
        .send({ name: 'Asha Rao', email: 'asha@example.com' })
        .expect(201)
    ).body.data;
    expect((await api().get('/api/team').set(user.auth)).body.data).toHaveLength(1);
    await api().delete(`/api/team/${member.id}`).set(user.auth).expect(200);
    await api().delete(`/api/team/${member.id}`).set(user.auth).expect(404);

    await api().post('/api/my-subscription/cancel').set(user.auth).expect(200);
    const blocked = await api()
      .patch(`/api/projects/${project.id}`)
      .set(user.auth)
      .send({ name: 'Nope' })
      .expect(403);
    expect(blocked.body.error.code).toBe('READ_ONLY');
    // Deleting still works, so people can tidy up.
    await api().delete(`/api/projects/${project.id}`).set(user.auth).expect(200);
  });
});

describe('TtlCache', () => {
  it('expires entries and evicts the oldest past its size', () => {
    vi.useFakeTimers();
    const cache = new TtlCache<string, number>(1000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.has('a')).toBe(false);
    expect(cache.size).toBe(2);
    vi.advanceTimersByTime(1001);
    expect(cache.get('b')).toBeUndefined();
    cache.set('d', 4);
    cache.delete('d');
    expect(cache.has('d')).toBe(false);
    vi.useRealTimers();
  });
});

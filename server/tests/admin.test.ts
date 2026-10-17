import { DAY_MS } from '@planpilot/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { SubscriptionModel } from '../src/modules/subscriptions/subscription.model';
import { UserModel } from '../src/modules/users/user.model';
import { api, buyPlan, createAdmin, registerUser, seedPlans } from './helpers';
import type { Session } from './helpers';

let plans: Awaited<ReturnType<typeof seedPlans>>;
let admin: Session;
beforeEach(async () => {
  plans = await seedPlans();
  admin = await createAdmin();
});
const planId = (slug: keyof typeof plans) => plans[slug]._id.toString();

describe('admin access', () => {
  it('is refused to customers and to anonymous callers', async () => {
    const user = await registerUser();
    for (const path of [
      '/api/admin/stats',
      '/api/admin/subscriptions',
      '/api/admin/users',
      '/api/admin/plans',
    ]) {
      await api().get(path).expect(401);
      const res = await api().get(path).set(user.auth).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});

describe('GET /api/admin/stats', () => {
  it('returns KPIs, a series per range, plan mix and live users', async () => {
    const a = await registerUser({ name: 'Asha Rao' });
    const b = await registerUser({ name: 'Bala Iyer' });
    await buyPlan(a, planId('pro'));
    await buyPlan(b, planId('starter'));

    const res = await api().get('/api/admin/stats?range=7d').set(admin.auth).expect(200);
    const stats = res.body.data;
    expect(stats.series).toHaveLength(7);
    expect(stats.kpis).toMatchObject({
      totalUsers: 2,
      activeSubscribers: { value: 2 },
      revenue: { value: 79_900 + 29_900 },
      mrr: { value: 79_900 + 29_900 },
      newSubscriptions: { value: 2 },
    });
    expect(stats.kpis.onlineNow).toBeGreaterThanOrEqual(2);
    expect(stats.planMix.find((p: { slug: string }) => p.slug === 'pro')).toMatchObject({
      count: 1,
      revenue: 79_900,
    });
    expect(stats.statusBreakdown).toMatchObject({ active: 2, none: 0 });
    expect(stats.recentSubscriptions).toHaveLength(2);

    const year = await api().get('/api/admin/stats?range=12m').set(admin.auth).expect(200);
    expect(year.body.data.series).toHaveLength(12);
    await api().get('/api/admin/stats?range=forever').set(admin.auth).expect(422);
  });
});

describe('GET /api/admin/subscriptions', () => {
  beforeEach(async () => {
    const priya = await registerUser({ name: 'Priya Sharma', email: 'priya@example.com' });
    const rahul = await registerUser({ name: 'Rahul Verma', email: 'rahul@example.com' });
    await buyPlan(priya, planId('starter'));
    await buyPlan(priya, planId('pro'));
    await buyPlan(rahul, planId('business'));
  });

  it('paginates every subscription with user and plan', async () => {
    const res = await api().get('/api/admin/subscriptions?pageSize=10').set(admin.auth).expect(200);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
    expect(res.body.data[0]).toMatchObject({
      user: { email: expect.any(String) },
      plan: { name: expect.any(String) },
    });
  });

  it('filters by status, plan, change type and search', async () => {
    const q = (query: string) =>
      api().get(`/api/admin/subscriptions?${query}`).set(admin.auth).expect(200);
    expect((await q('status=active')).body.meta.total).toBe(2);
    expect((await q('status=cancelled')).body.meta.total).toBe(1);
    expect((await q(`planId=${planId('business')}`)).body.data[0].user.name).toBe('Rahul Verma');
    expect((await q('changeType=upgrade')).body.data[0].plan.name).toBe('Pro');
    expect((await q('search=PRIYA')).body.meta.total).toBe(2);
    // Regex characters are matched literally, not executed.
    expect((await q('search=.*')).body.meta.total).toBe(0);
  });

  it('sorts by amount', async () => {
    const res = await api()
      .get('/api/admin/subscriptions?sort=-amountPaid')
      .set(admin.auth)
      .expect(200);
    const amounts = res.body.data.map((r: { amountPaid: number }) => r.amountPaid);
    expect(amounts).toEqual([...amounts].sort((x: number, y: number) => y - x));
  });

  it('exports CSV with formula injection neutralised', async () => {
    await UserModel.updateOne(
      { email: 'rahul@example.com' },
      { name: '=HYPERLINK("http://evil")' },
    );
    const res = await api().get('/api/admin/subscriptions?format=csv').set(admin.auth).expect(200);
    const { filename, csv } = res.body.data;
    expect(filename).toMatch(/^planpilot-subscriptions-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('"Customer"');
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe('admin control of a user plan', () => {
  let user: Session;
  let subId: string;
  beforeEach(async () => {
    user = await registerUser();
    const result = await buyPlan(user, planId('starter'));
    subId = result.subscription.id;
  });

  it('extends by days and records who did it and why', async () => {
    const before = await SubscriptionModel.findById(subId).lean();
    const res = await api()
      .patch(`/api/admin/subscriptions/${subId}/extend`)
      .set(admin.auth)
      .send({ days: 7, reason: 'Goodwill for downtime' })
      .expect(200);
    expect(new Date(res.body.data.endDate).getTime() - before!.endDate.getTime()).toBe(7 * DAY_MS);
    expect(res.body.data.adjustments[0]).toMatchObject({
      type: 'extend',
      days: 7,
      reason: 'Goodwill for downtime',
    });
  });

  it('expires a plan now, and extending later revives it', async () => {
    await api()
      .patch(`/api/admin/subscriptions/${subId}/expire`)
      .set(admin.auth)
      .send({ reason: 'Trial abuse' })
      .expect(200);
    expect((await api().get('/api/my-subscription').set(user.auth)).body.data.status).toBe(
      'expired',
    );
    const until = new Date(Date.now() + 10 * DAY_MS).toISOString();
    await api()
      .patch(`/api/admin/subscriptions/${subId}/extend`)
      .set(admin.auth)
      .send({ endDate: until, reason: 'Reinstated after review' })
      .expect(200);
    expect((await api().get('/api/my-subscription').set(user.auth)).body.data.status).toBe(
      'active',
    );
  });

  it('assigns any plan without payment, replacing the current one', async () => {
    const res = await api()
      .post(`/api/admin/users/${user.user.id}/subscription`)
      .set(admin.auth)
      .send({ planId: planId('business'), reason: 'Enterprise pilot' })
      .expect(201);
    expect(res.body.data).toMatchObject({
      changeType: 'admin_assign',
      amountPaid: 0,
      plan: { name: 'Business' },
    });
    expect(await SubscriptionModel.countDocuments({ userId: user.user.id, status: 'active' })).toBe(
      1,
    );
    // Admin gifts never turn into refundable credit.
    const preview = await api()
      .get(`/api/subscribe/${planId('starter')}/preview`)
      .set(user.auth)
      .expect(200);
    expect(preview.body.data.credit).toBe(0);
  });

  it('validates admin input', async () => {
    await api()
      .patch(`/api/admin/subscriptions/${subId}/extend`)
      .set(admin.auth)
      .send({ reason: 'x' })
      .expect(422);
    await api()
      .patch(`/api/admin/subscriptions/${subId}/extend`)
      .set(admin.auth)
      .send({ days: 5, endDate: new Date().toISOString(), reason: 'Both given' })
      .expect(422);
    await api()
      .patch('/api/admin/subscriptions/nope/expire')
      .set(admin.auth)
      .send({ reason: 'Bad id here' })
      .expect(422);
  });

  it('shows the full user detail with history and sessions', async () => {
    const res = await api().get(`/api/admin/users/${user.user.id}`).set(admin.auth).expect(200);
    expect(res.body.data.user).toMatchObject({
      subscriptionStatus: 'active',
      currentPlan: { name: 'Starter' },
    });
    expect(res.body.data.history).toHaveLength(1);
    expect(res.body.data.sessions.length).toBeGreaterThan(0);
  });

  it('can sign a user out of every device', async () => {
    const res = await api()
      .delete(`/api/admin/users/${user.user.id}/sessions`)
      .set(admin.auth)
      .expect(200);
    expect(res.body.data.revoked).toBeGreaterThan(0);
    await api().get('/api/auth/me').set(user.auth).expect(401);
  });
});

describe('admin users list', () => {
  it('filters by subscription state and searches', async () => {
    const paid = await registerUser({ name: 'Kavya Sundaram' });
    await registerUser({ name: 'Neha Gupta' });
    await buyPlan(paid, planId('pro'));
    const q = (query: string) => api().get(`/api/admin/users?${query}`).set(admin.auth).expect(200);
    expect((await q('subscription=active')).body.data.map((u: { name: string }) => u.name)).toEqual(
      ['Kavya Sundaram'],
    );
    expect(
      (await q('subscription=none&role=user')).body.data.map((u: { name: string }) => u.name),
    ).toEqual(['Neha Gupta']);
    expect((await q('search=kavya')).body.data[0]).toMatchObject({
      currentPlan: { name: 'Pro' },
      online: true,
    });
  });
});

describe('admin plan management', () => {
  const body = {
    name: 'Team',
    description: 'For small teams',
    price: 49_900,
    durationDays: 30,
    features: ['10 projects'],
    limits: { projects: 10, teamMembers: 5 },
    tier: 2,
    isPopular: true,
  };

  it('creates, updates and keeps a single popular plan', async () => {
    const created = await api().post('/api/admin/plans').set(admin.auth).send(body).expect(201);
    expect(created.body.data).toMatchObject({ slug: 'team', isPopular: true });
    const all = await api().get('/api/admin/plans').set(admin.auth).expect(200);
    expect(all.body.data.filter((p: { isPopular: boolean }) => p.isPopular)).toHaveLength(1);

    const updated = await api()
      .patch(`/api/admin/plans/${created.body.data.id}`)
      .set(admin.auth)
      .send({ ...body, name: 'Team Plus', price: 59_900 })
      .expect(200);
    expect(updated.body.data).toMatchObject({ slug: 'team-plus', price: 59_900 });
  });

  it('cleans markup out of plan text', async () => {
    const res = await api()
      .post('/api/admin/plans')
      .set(admin.auth)
      .send({
        ...body,
        name: '<script>x</script>Team',
        features: ['<img src=x onerror=alert(1)>Fast support'],
      })
      .expect(201);
    expect(res.body.data.name).toBe('xTeam');
    expect(res.body.data.features).toEqual(['Fast support']);
  });

  it('archives plans with history instead of deleting them', async () => {
    const user = await registerUser();
    await buyPlan(user, planId('starter'));
    const archived = await api()
      .delete(`/api/admin/plans/${planId('starter')}`)
      .set(admin.auth)
      .expect(200);
    expect(archived.body.data).toEqual({ deleted: false, archived: true });
    const unused = await api()
      .delete(`/api/admin/plans/${planId('business')}`)
      .set(admin.auth)
      .expect(200);
    expect(unused.body.data).toEqual({ deleted: true, archived: false });
    const publicList = await api().get('/api/plans').expect(200);
    expect(publicList.body.data.map((p: { slug: string }) => p.slug)).not.toContain('starter');
  });

  it('shows the activity feed', async () => {
    await api().post('/api/admin/plans').set(admin.auth).send(body).expect(201);
    const res = await api().get('/api/admin/activity').set(admin.auth).expect(200);
    expect(res.body.data[0]).toMatchObject({
      action: 'admin.plan.created',
      actor: { name: 'Admin User' },
    });
  });
});

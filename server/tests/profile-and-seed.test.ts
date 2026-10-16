import { describe, expect, it } from 'vitest';
import { PlanModel } from '../src/modules/plans/plan.model';
import { SubscriptionModel } from '../src/modules/subscriptions/subscription.model';
import { UserModel } from '../src/modules/users/user.model';
import { ADMIN_PASSWORD, DEMO_ACCOUNTS, DEMO_PASSWORD, ensureSeedData } from '../src/seed/seed';
import { APP_HEADER, PASSWORD, api, createAdmin, login, registerUser } from './helpers';

describe('profile and sessions', () => {
  it('updates the name with the same cleaning as sign-up', async () => {
    const user = await registerUser();
    const res = await api()
      .patch('/api/me/profile')
      .set(user.auth)
      .send({ name: '  New   <b>Name</b> ' })
      .expect(200);
    expect(res.body.data.name).toBe('New Name');
  });

  it('changes the password and signs out every other device', async () => {
    const phone = await registerUser({ email: 'devices@example.com' });
    const laptop = (await login('devices@example.com').expect(200)).body.data;

    const wrong = await api()
      .post('/api/me/password')
      .set(phone.auth)
      .send({ currentPassword: 'Wrong1234', newPassword: 'Better456' })
      .expect(400);
    expect(wrong.body.error.details[0].field).toBe('currentPassword');

    const res = await api()
      .post('/api/me/password')
      .set(phone.auth)
      .send({ currentPassword: PASSWORD, newPassword: 'Better456' })
      .expect(200);
    expect(res.body.data.otherSessionsRevoked).toBe(1);

    await api().get('/api/auth/me').set(phone.auth).expect(200);
    await api()
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${laptop.accessToken}` })
      .expect(401);
    await login('devices@example.com', PASSWORD).expect(401);
    await login('devices@example.com', 'Better456').expect(200);
  });

  it('lists sessions and revokes one device or all of them', async () => {
    const first = await registerUser({ email: 'many@example.com' });
    await login('many@example.com').expect(200);
    const list = await api().get('/api/me/sessions').set(first.auth).expect(200);
    expect(list.body.data).toHaveLength(2);
    const other = list.body.data.find((s: { current: boolean }) => !s.current);
    await api().delete(`/api/me/sessions/${other.id}`).set(first.auth).expect(200);
    expect((await api().get('/api/me/sessions').set(first.auth)).body.data).toHaveLength(1);

    await api().delete('/api/me/sessions').set(first.auth).expect(200);
    await api().get('/api/auth/me').set(first.auth).expect(401);
    await api().post('/api/auth/refresh').set(APP_HEADER).set('Cookie', first.cookie).expect(401);
  });

  it('marks notifications read one by one or all at once', async () => {
    const user = await registerUser();
    const list = await api().get('/api/notifications').set(user.auth).expect(200);
    expect(list.body.data).toMatchObject({ unread: 1, items: [{ type: 'welcome', readAt: null }] });
    await api()
      .patch(`/api/notifications/${list.body.data.items[0].id}/read`)
      .set(user.auth)
      .expect(200);
    expect(
      (await api().get('/api/notifications?unread=true').set(user.auth)).body.data.items,
    ).toHaveLength(0);
    expect(
      (await api().patch('/api/notifications/read-all').set(user.auth)).body.data.updated,
    ).toBe(0);
  });
});

describe('demo database', () => {
  it('seeds plans, demo accounts and history once, and rebuilds on request', async () => {
    expect(await ensureSeedData()).toEqual({ seeded: true });
    expect(await PlanModel.countDocuments()).toBe(4);
    expect(await UserModel.countDocuments()).toBeGreaterThan(55);
    expect(await ensureSeedData()).toEqual({ seeded: false });

    await login(DEMO_ACCOUNTS.admin, ADMIN_PASSWORD).expect(200);
    const priya = (await login(DEMO_ACCOUNTS.active, DEMO_PASSWORD).expect(200)).body.data;
    const mine = await api()
      .get('/api/my-subscription')
      .set({ Authorization: `Bearer ${priya.accessToken}` })
      .expect(200);
    expect(mine.body.data).toMatchObject({
      status: 'active',
      subscription: { plan: { name: 'Pro' } },
      usage: { projects: 3 },
    });

    expect((await login(DEMO_ACCOUNTS.blocked, DEMO_PASSWORD).expect(403)).body.error.code).toBe(
      'ACCOUNT_BLOCKED',
    );
    expect((await login(DEMO_ACCOUNTS.inactive, DEMO_PASSWORD).expect(403)).body.error.code).toBe(
      'ACCOUNT_INACTIVE',
    );
    expect(
      (await login(DEMO_ACCOUNTS.accessExpired, DEMO_PASSWORD).expect(403)).body.error.code,
    ).toBe('ACCOUNT_ACCESS_EXPIRED');

    // One active plan per user holds across the generated history.
    const doubles = await SubscriptionModel.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$userId', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ]);
    expect(doubles).toHaveLength(0);

    const before = await SubscriptionModel.countDocuments();
    await ensureSeedData({ fresh: true });
    expect(await SubscriptionModel.countDocuments()).toBe(before);
  });

  it('lets an admin reset the demo data in demo mode', async () => {
    const admin = await createAdmin();
    await api().post('/api/admin/demo/reset').set(admin.auth).expect(200);
    expect(await UserModel.exists({ email: DEMO_ACCOUNTS.active })).toBeTruthy();
  });
});

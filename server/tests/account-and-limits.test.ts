import { beforeEach, describe, expect, it } from 'vitest';
import { UserModel } from '../src/modules/users/user.model';
import {
  APP_HEADER,
  PASSWORD,
  api,
  buyPlan,
  createAdmin,
  login,
  registerUser,
  seedPlans,
} from './helpers';
import type { Session } from './helpers';

let plans: Awaited<ReturnType<typeof seedPlans>>;
beforeEach(async () => {
  plans = await seedPlans();
});
const planId = (slug: keyof typeof plans) => plans[slug]._id.toString();

describe('account status at sign-in', () => {
  it.each([
    ['blocked', { status: 'blocked', statusReason: 'Chargeback' }, 'ACCOUNT_BLOCKED'],
    ['inactive', { status: 'inactive', statusReason: 'Paused' }, 'ACCOUNT_INACTIVE'],
    [
      'access-expired',
      { accessExpiresAt: new Date(Date.now() - 60_000) },
      'ACCOUNT_ACCESS_EXPIRED',
    ],
  ])('a %s account gets its own code and reason', async (_label, state, code) => {
    const { user } = await registerUser({ email: `${_label}@example.com` });
    await UserModel.updateOne({ _id: user.id }, state);
    const res = await login(`${_label}@example.com`).expect(403);
    expect(res.body.error.code).toBe(code);
    expect(res.body.error.meta.supportEmail).toEqual(expect.any(String));
  });

  it('reveals the status only to someone who knows the password', async () => {
    const { user } = await registerUser({ email: 'quiet@example.com' });
    await UserModel.updateOne(
      { _id: user.id },
      { status: 'blocked', statusReason: 'Fraud review' },
    );
    const res = await login('quiet@example.com', 'Wrong1234').expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(JSON.stringify(res.body)).not.toMatch(/Fraud review|blocked/i);
  });

  it('a future "access until" date still allows sign-in', async () => {
    const { user } = await registerUser({ email: 'future@example.com' });
    await UserModel.updateOne(
      { _id: user.id },
      { accessExpiresAt: new Date(Date.now() + 86_400_000) },
    );
    await login('future@example.com').expect(200);
  });
});

describe('an admin restricting a signed-in user', () => {
  it('takes effect on the very next request and kills the refresh session', async () => {
    const admin = await createAdmin();
    const victim = await registerUser();
    await api().get('/api/auth/me').set(victim.auth).expect(200);

    await api()
      .patch(`/api/admin/users/${victim.user.id}/status`)
      .set(admin.auth)
      .send({ status: 'blocked', reason: 'Payment dispute under review' })
      .expect(200);

    const next = await api().get('/api/auth/me').set(victim.auth).expect(403);
    expect(next.body.error).toMatchObject({
      code: 'ACCOUNT_BLOCKED',
      meta: { reason: 'Payment dispute under review' },
    });
    await api().post('/api/auth/refresh').set(APP_HEADER).set('Cookie', victim.cookie).expect(401);

    // Re-activating lets them sign in again with a notification waiting.
    await api()
      .patch(`/api/admin/users/${victim.user.id}/status`)
      .set(admin.auth)
      .send({ status: 'active', reason: 'Dispute resolved' })
      .expect(200);
    const back = await login(victim.user.email, PASSWORD).expect(200);
    const notes = await api()
      .get('/api/notifications')
      .set({ Authorization: `Bearer ${back.body.data.accessToken}` })
      .expect(200);
    expect(notes.body.data.items.map((n: { type: string }) => n.type)).toContain(
      'account_status_changed',
    );
  });

  it('protects admins from locking themselves or the last admin out', async () => {
    const admin = await createAdmin();
    const self = await api()
      .patch(`/api/admin/users/${admin.user.id}/status`)
      .set(admin.auth)
      .send({ status: 'blocked', reason: 'Testing myself' })
      .expect(403);
    expect(self.body.error.code).toBe('SELF_ACTION_FORBIDDEN');

    const other = await createAdmin('second-admin@example.com');
    await api()
      .patch(`/api/admin/users/${other.user.id}/role`)
      .set(admin.auth)
      .send({ role: 'user' })
      .expect(200);
    const last = await api()
      .patch(`/api/admin/users/${admin.user.id}/role`)
      .set(admin.auth)
      .send({ role: 'user' })
      .expect(403);
    expect(last.body.error.code).toBe('SELF_ACTION_FORBIDDEN');
  });
});

describe('usage limits', () => {
  let user: Session;
  beforeEach(async () => {
    user = await registerUser();
  });
  const createProject = (name = 'Website') =>
    api().post('/api/projects').set(user.auth).send({ name });

  it('makes the workspace read-only without a plan', async () => {
    const res = await createProject().expect(403);
    expect(res.body.error.code).toBe('READ_ONLY');
  });

  it('allows creating up to the plan limit, then explains the limit', async () => {
    await buyPlan(user, planId('starter'));
    for (const name of ['One', 'Two', 'Three']) await createProject(name).expect(201);
    const res = await createProject('Four').expect(403);
    expect(res.body.error).toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
      meta: { key: 'projects', limit: 3, used: 3, plan: 'Starter' },
    });
    const usage = await api().get('/api/me/usage').set(user.auth).expect(200);
    expect(usage.body.data).toEqual({ projects: 3, teamMembers: 0 });
  });

  it('never exceeds the limit when requests race for the last slot', async () => {
    await buyPlan(user, planId('starter'));
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => createProject(`P${i}`)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    const list = await api().get('/api/projects').set(user.auth).expect(200);
    expect(list.body.data).toHaveLength(3);
  });

  it('gives the slot back on delete', async () => {
    await buyPlan(user, planId('starter'));
    const ids: string[] = [];
    for (const name of ['Alpha', 'Bravo', 'Charlie'])
      ids.push((await createProject(name).expect(201)).body.data.id);
    await api().delete(`/api/projects/${ids[0]}`).set(user.auth).expect(200);
    await createProject('Delta').expect(201);
  });

  it('keeps existing items after a downgrade but blocks new ones until under the limit', async () => {
    await buyPlan(user, planId('pro'));
    for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta'])
      await createProject(name).expect(201);
    await api()
      .post(`/api/subscribe/${planId('starter')}`)
      .set(user.auth)
      .expect(201);
    expect((await api().get('/api/projects').set(user.auth)).body.data).toHaveLength(4);
    await createProject('Echo').expect(403);
  });

  it('applies team limits too and rejects duplicate members', async () => {
    await buyPlan(user, planId('starter'));
    const add = (email: string) =>
      api().post('/api/team').set(user.auth).send({ name: 'Asha Rao', email, role: 'editor' });
    await add('asha@example.com').expect(201);
    await add('asha@example.com').expect(409);
    await add('bala@example.com').expect(201);
    const res = await add('chitra@example.com').expect(403);
    expect(res.body.error.meta).toMatchObject({ key: 'teamMembers', limit: 2 });
  });

  it('treats a null limit as unlimited', async () => {
    await buyPlan(user, planId('business'));
    for (let i = 0; i < 30; i += 1) await createProject(`Project ${i}`).expect(201);
  });
});

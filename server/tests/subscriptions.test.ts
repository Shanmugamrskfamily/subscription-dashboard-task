import { DAY_MS } from '@planpilot/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { runSubscriptionLifecycle } from '../src/jobs/subscription-lifecycle';
import { NotificationModel } from '../src/modules/notifications/notification.model';
import { PaymentModel } from '../src/modules/payments/payment.model';
import { PlanModel } from '../src/modules/plans/plan.model';
import { SubscriptionModel } from '../src/modules/subscriptions/subscription.model';
import { api, buyPlan, createAdmin, registerUser, seedPlans } from './helpers';
import type { Session } from './helpers';

let plans: Awaited<ReturnType<typeof seedPlans>>;
let user: Session;

beforeEach(async () => {
  plans = await seedPlans();
  user = await registerUser();
});

const planId = (slug: keyof typeof plans) => plans[slug]._id.toString();

describe('GET /api/plans', () => {
  it('is public and lists active plans by tier', async () => {
    const res = await api().get('/api/plans').expect(200);
    expect(res.body.data.map((p: { slug: string }) => p.slug)).toEqual([
      'starter',
      'pro',
      'pro-annual',
      'business',
    ]);
    expect(res.body.data[1]).toMatchObject({
      name: 'Pro',
      price: 79_900,
      limits: { projects: 25, teamMembers: 10 },
    });
  });
});

describe('GET /api/my-subscription', () => {
  it('reports "none" with zero limits before any purchase', async () => {
    const res = await api().get('/api/my-subscription').set(user.auth).expect(200);
    expect(res.body.data).toMatchObject({
      status: 'none',
      subscription: null,
      readOnly: true,
      limits: { projects: 0 },
    });
  });

  it('is for customers only', async () => {
    const admin = await createAdmin();
    await api().get('/api/my-subscription').set(admin.auth).expect(403);
    await api().get('/api/my-subscription').expect(401);
  });
});

describe('subscribing with the simulated Razorpay checkout', () => {
  it('creates an order with the server-calculated amount, then activates on verify', async () => {
    const res = await api()
      .post(`/api/subscribe/${planId('starter')}`)
      .set(user.auth)
      .expect(200);
    const { checkout, quote } = res.body.data;
    expect(res.body.data.activated).toBe(false);
    expect(checkout).toMatchObject({
      amount: 29_900,
      currency: 'INR',
      mode: 'simulated',
      planName: 'Starter',
    });
    expect(quote).toMatchObject({ changeType: 'new', amountDue: 29_900, requiresPayment: true });

    // Nothing is active until the payment is verified.
    expect((await api().get('/api/my-subscription').set(user.auth)).body.data.status).toBe('none');

    const verified = await api()
      .post('/api/payments/verify')
      .set(user.auth)
      .send({
        razorpay_order_id: checkout.orderId,
        razorpay_payment_id: checkout.simulation.paymentId,
        razorpay_signature: checkout.simulation.signature,
      })
      .expect(200);
    expect(verified.body.data).toMatchObject({
      alreadyProcessed: false,
      subscription: { status: 'active', amountPaid: 29_900 },
    });

    const mine = await api().get('/api/my-subscription').set(user.auth).expect(200);
    expect(mine.body.data).toMatchObject({
      status: 'active',
      readOnly: false,
      limits: { projects: 3, teamMembers: 2 },
    });
    expect(mine.body.data.subscription.daysLeft).toBe(30);

    const payments = await api().get('/api/me/payments').set(user.auth).expect(200);
    expect(payments.body.data[0]).toMatchObject({
      status: 'paid',
      amount: 29_900,
      plan: { name: 'Starter' },
    });
    expect(
      await NotificationModel.countDocuments({ userId: user.user.id, type: 'payment_success' }),
    ).toBe(1);
  });

  it('is idempotent: verifying the same payment twice activates one plan', async () => {
    const res = await api()
      .post(`/api/subscribe/${planId('pro')}`)
      .set(user.auth)
      .expect(200);
    const { checkout } = res.body.data;
    const body = {
      razorpay_order_id: checkout.orderId,
      razorpay_payment_id: checkout.simulation.paymentId,
      razorpay_signature: checkout.simulation.signature,
    };
    const [a, b] = await Promise.all([
      api().post('/api/payments/verify').set(user.auth).send(body),
      api().post('/api/payments/verify').set(user.auth).send(body),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await SubscriptionModel.countDocuments({ userId: user.user.id })).toBe(1);
    expect([a.body.data.alreadyProcessed, b.body.data.alreadyProcessed].sort()).toEqual([
      false,
      true,
    ]);
  });

  it('rejects a forged signature and records the failed payment', async () => {
    const res = await api()
      .post(`/api/subscribe/${planId('pro')}`)
      .set(user.auth)
      .expect(200);
    const { checkout } = res.body.data;
    const bad = await api()
      .post('/api/payments/verify')
      .set(user.auth)
      .send({
        razorpay_order_id: checkout.orderId,
        razorpay_payment_id: checkout.simulation.paymentId,
        razorpay_signature: 'f'.repeat(64),
      })
      .expect(400);
    expect(bad.body.error.code).toBe('PAYMENT_VERIFICATION_FAILED');
    expect(await PaymentModel.findOne({ razorpayOrderId: checkout.orderId }).lean()).toMatchObject({
      status: 'failed',
    });
    expect(await SubscriptionModel.countDocuments()).toBe(0);
  });

  it("refuses another user's order", async () => {
    const res = await api()
      .post(`/api/subscribe/${planId('pro')}`)
      .set(user.auth)
      .expect(200);
    const { checkout } = res.body.data;
    const other = await registerUser();
    await api()
      .post('/api/payments/verify')
      .set(other.auth)
      .send({
        razorpay_order_id: checkout.orderId,
        razorpay_payment_id: checkout.simulation.paymentId,
        razorpay_signature: checkout.simulation.signature,
      })
      .expect(404);
  });

  it('records a dismissed checkout as failed', async () => {
    const res = await api()
      .post(`/api/subscribe/${planId('pro')}`)
      .set(user.auth)
      .expect(200);
    await api()
      .post(`/api/payments/${res.body.data.checkout.orderId}/fail`)
      .set(user.auth)
      .send({ reason: 'Checkout closed' })
      .expect(200);
    expect(await PaymentModel.findOne({}).lean()).toMatchObject({
      status: 'failed',
      failureReason: 'Checkout closed',
    });
  });
});

describe('plan changes', () => {
  it('previews and charges only the difference on an upgrade', async () => {
    await buyPlan(user, planId('starter'));
    // Pretend 28 of the 30 Starter days are used.
    await SubscriptionModel.updateOne(
      { userId: user.user.id, status: 'active' },
      { startDate: new Date(Date.now() - 28 * DAY_MS), endDate: new Date(Date.now() + 2 * DAY_MS) },
    );

    const preview = await api()
      .get(`/api/subscribe/${planId('pro')}/preview`)
      .set(user.auth)
      .expect(200);
    expect(preview.body.data).toMatchObject({
      changeType: 'upgrade',
      currentPlan: { name: 'Starter' },
    });
    expect(preview.body.data.credit).toBeGreaterThan(1900);
    expect(preview.body.data.amountDue).toBe(79_900 - preview.body.data.credit);

    const result = await buyPlan(user, planId('pro'));
    expect(result.subscription).toMatchObject({
      status: 'active',
      changeType: 'upgrade',
      plan: { name: 'Pro' },
    });
    const old = await SubscriptionModel.findOne({
      userId: user.user.id,
      status: 'cancelled',
    }).lean();
    expect(old).toMatchObject({ endReason: 'replaced' });
  });

  it('downgrades at once when credit covers the new plan', async () => {
    await buyPlan(user, planId('pro'));
    const res = await api()
      .post(`/api/subscribe/${planId('starter')}`)
      .set(user.auth)
      .expect(201);
    expect(res.body.data.activated).toBe(true);
    expect(res.body.data.quote).toMatchObject({ changeType: 'downgrade', amountDue: 0 });
    expect(res.body.data.quote.bonusDays).toBeGreaterThan(30);
    expect(res.body.data.subscription.daysLeft).toBeGreaterThan(60);
  });

  it('renews the current plan early, adding a full period after the current end date', async () => {
    const first = await buyPlan(user, planId('pro'));
    const firstEnd = new Date(first.subscription.endDate).getTime();

    const preview = await api()
      .get(`/api/subscribe/${planId('pro')}/preview`)
      .set(user.auth)
      .expect(200);
    expect(preview.body.data).toMatchObject({
      changeType: 'renewal',
      credit: 0,
      amountDue: 79_900,
    });
    expect(new Date(preview.body.data.endDate).getTime()).toBe(firstEnd + 30 * DAY_MS);

    const renewed = await buyPlan(user, planId('pro'));
    expect(renewed.subscription).toMatchObject({ changeType: 'renewal', plan: { name: 'Pro' } });
    expect(new Date(renewed.subscription.endDate).getTime()).toBe(firstEnd + 30 * DAY_MS);
    expect(await SubscriptionModel.countDocuments({ userId: user.user.id, status: 'active' })).toBe(
      1,
    );
  });

  it('allows one renewal ahead, not an endless stack', async () => {
    await buyPlan(user, planId('pro'));
    await buyPlan(user, planId('pro'));
    const res = await api()
      .post(`/api/subscribe/${planId('pro')}`)
      .set(user.auth)
      .expect(409);
    expect(res.body.error.code).toBe('ALREADY_SUBSCRIBED');
    expect(res.body.error.message).toMatch(/already renewed until/);
  });

  it('never ends up with two active plans, even under concurrent requests', async () => {
    await buyPlan(user, planId('pro'));
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        api()
          .post(`/api/subscribe/${planId('starter')}`)
          .set(user.auth),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.every((r) => [201, 409].includes(r.status))).toBe(true);
    expect(await SubscriptionModel.countDocuments({ userId: user.user.id, status: 'active' })).toBe(
      1,
    );
  });

  it('validates the plan id and refuses archived plans', async () => {
    await api().post('/api/subscribe/not-an-id').set(user.auth).expect(422);
    await api().post('/api/subscribe/6a0000000000000000000000').set(user.auth).expect(404);
    await PlanModel.updateOne({ slug: 'business' }, { isActive: false });
    const res = await api()
      .post(`/api/subscribe/${planId('business')}`)
      .set(user.auth)
      .expect(400);
    expect(res.body.error.code).toBe('PLAN_INACTIVE');
  });

  it('lets the customer cancel, which makes the workspace read-only', async () => {
    await buyPlan(user, planId('pro'));
    const res = await api().post('/api/my-subscription/cancel').set(user.auth).expect(200);
    expect(res.body.data).toMatchObject({ status: 'cancelled', readOnly: true });
    await api().post('/api/my-subscription/cancel').set(user.auth).expect(400);
  });
});

describe('expiry and reminders', () => {
  it('expires plans past their end date, even before the job runs', async () => {
    await buyPlan(user, planId('starter'));
    await SubscriptionModel.updateOne(
      { userId: user.user.id },
      { endDate: new Date(Date.now() - 1000) },
    );
    const res = await api().get('/api/my-subscription').set(user.auth).expect(200);
    expect(res.body.data.status).toBe('expired');
    expect(res.body.data.lastSubscription.plan.name).toBe('Starter');
  });

  it('sends each reminder once and expires due plans', async () => {
    await buyPlan(user, planId('pro'));
    await SubscriptionModel.updateOne(
      { userId: user.user.id },
      { endDate: new Date(Date.now() + 2 * DAY_MS) },
    );
    expect(await runSubscriptionLifecycle()).toEqual({ expired: 0, reminders: 1 });
    expect(await runSubscriptionLifecycle()).toEqual({ expired: 0, reminders: 0 });

    await SubscriptionModel.updateOne(
      { userId: user.user.id },
      { endDate: new Date(Date.now() + 12 * 60 * 60_000) },
    );
    expect((await runSubscriptionLifecycle()).reminders).toBe(1); // the final "tomorrow" reminder

    await SubscriptionModel.updateOne(
      { userId: user.user.id },
      { endDate: new Date(Date.now() - 1000) },
    );
    expect((await runSubscriptionLifecycle()).expired).toBe(1);
    const types = (await NotificationModel.find({ userId: user.user.id }).lean()).map(
      (n) => n.type,
    );
    expect(types.filter((t) => t === 'expiring_soon')).toHaveLength(2);
    expect(types).toContain('expired');
  });
});

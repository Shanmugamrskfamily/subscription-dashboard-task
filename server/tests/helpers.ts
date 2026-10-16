import type { AuthResponse, CheckoutOrder, SubscribeResponse } from '@planpilot/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app';
import type { AppOptions } from '../src/app';
import { PlanModel } from '../src/modules/plans/plan.model';
import { UserModel } from '../src/modules/users/user.model';
import { PLAN_SEED } from '../src/seed/plans.data';
import type { PlanSlug } from '../src/seed/plans.data';

export const PASSWORD = 'Secure123';

export const makeApp = (options: AppOptions = {}) => createApp(options);
export const app = makeApp();

/** Sends the header cookie routes require (the CSRF guard). */
export const APP_HEADER = { 'X-Requested-With': 'planpilot' };

export async function seedPlans() {
  await PlanModel.insertMany(
    PLAN_SEED.map((p) => ({ ...p, limits: { ...p.limits }, features: [...p.features] })),
  );
  const plans = await PlanModel.find().lean();
  return Object.fromEntries(plans.map((p) => [p.slug, p])) as Record<
    PlanSlug,
    (typeof plans)[number]
  >;
}

export interface Session {
  token: string;
  user: AuthResponse['user'];
  cookie: string;
  auth: { Authorization: string };
}

const toSession = (res: request.Response): Session => {
  const body = res.body.data as AuthResponse;
  const cookie =
    (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0]?.split(';')[0] ?? '';
  return {
    token: body.accessToken,
    user: body.user,
    cookie,
    auth: { Authorization: `Bearer ${body.accessToken}` },
  };
};

let counter = 0;
export async function registerUser(
  overrides: Partial<{ name: string; email: string; password: string }> = {},
) {
  counter += 1;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Test User',
      email: `user${counter}-${Date.now()}@example.com`,
      password: PASSWORD,
      ...overrides,
    })
    .expect(201);
  return toSession(res);
}

export const login = (email: string, password = PASSWORD) =>
  request(app).post('/api/auth/login').send({ email, password });

export async function createAdmin(email = `admin-${Date.now()}@example.com`) {
  await UserModel.create({
    name: 'Admin User',
    email,
    role: 'admin',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  });
  return toSession(await login(email).expect(200));
}

/** Subscribes and, when payment is due, completes the simulated checkout. */
export async function buyPlan(session: Session, planId: string) {
  const res = await request(app)
    .post(`/api/subscribe/${planId}`)
    .set(session.auth)
    .expect((r) => {
      if (![200, 201].includes(r.status))
        throw new Error(`subscribe failed: ${r.status} ${JSON.stringify(r.body)}`);
    });
  const data = res.body.data as SubscribeResponse;
  if (data.activated) return data;
  return completeCheckout(session, data.checkout);
}

export async function completeCheckout(session: Session, checkout: CheckoutOrder) {
  const res = await request(app)
    .post('/api/payments/verify')
    .set(session.auth)
    .send({
      razorpay_order_id: checkout.orderId,
      razorpay_payment_id: checkout.simulation?.paymentId,
      razorpay_signature: checkout.simulation?.signature,
    })
    .expect(200);
  return res.body.data;
}

export const api = () => request(app);

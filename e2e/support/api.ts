import { expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

/**
 * Plain (unencrypted) calls straight to the API for test setup. The E2E server allows
 * them (ENCRYPTION_REQUIRED=false); the browser itself always uses encrypted payloads.
 * When `request` is `page.request`, the refresh cookie set by sign-in lands in the
 * browser context, so the next page load restores that session.
 */

export const ADMIN = { email: 'admin@planpilot.demo', password: 'Admin@12345' };
export const DEMO_PASSWORD = 'Demo@12345';
export const demo = (name: string) => ({
  email: `${name}@planpilot.demo`,
  password: DEMO_PASSWORD,
});

export interface Session {
  accessToken: string;
  user: { id: string; name: string; email: string; role: 'user' | 'admin' };
}

export interface PlanSummary {
  id: string;
  slug: string;
  name: string;
  price: number;
}

const HEADERS = { 'X-Requested-With': 'planpilot' };

async function data<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  const body = await response.text();
  expect(response.ok(), `${response.url()} → ${response.status()} ${body}`).toBeTruthy();
  return (JSON.parse(body) as { data: T }).data;
}

export async function apiLogin(
  request: APIRequestContext,
  credentials: { email: string; password: string },
): Promise<Session> {
  return data<Session>(
    await request.post('/api/auth/login', { data: credentials, headers: HEADERS }),
  );
}

export async function apiRegister(
  request: APIRequestContext,
  user: { name: string; email: string; password: string },
): Promise<Session> {
  return data<Session>(await request.post('/api/auth/register', { data: user, headers: HEADERS }));
}

export async function apiPlans(request: APIRequestContext): Promise<PlanSummary[]> {
  return data<PlanSummary[]>(await request.get('/api/plans'));
}

const auth = (session: Session) => ({ ...HEADERS, Authorization: `Bearer ${session.accessToken}` });

/** Buys a plan through the simulated checkout, exactly as the browser would. */
export async function apiSubscribe(
  request: APIRequestContext,
  session: Session,
  slug: string,
): Promise<void> {
  const plan = (await apiPlans(request)).find((p) => p.slug === slug);
  if (!plan) throw new Error(`No plan with slug ${slug}`);
  const result = await data<{
    activated: boolean;
    checkout?: { orderId: string; simulation?: { paymentId: string; signature: string } };
  }>(await request.post(`/api/subscribe/${plan.id}`, { headers: auth(session) }));
  if (result.activated) return;
  const sim = result.checkout?.simulation;
  if (!result.checkout || !sim) throw new Error('Expected a simulated checkout order');
  await data(
    await request.post('/api/payments/verify', {
      headers: auth(session),
      data: {
        razorpay_order_id: result.checkout.orderId,
        razorpay_payment_id: sim.paymentId,
        razorpay_signature: sim.signature,
      },
    }),
  );
}

/** Puts every planpilot.demo account back to its seeded state. */
export async function apiResetDemo(request: APIRequestContext): Promise<void> {
  const admin = await apiLogin(request, ADMIN);
  await data(await request.post('/api/admin/demo/reset', { headers: auth(admin) }));
}

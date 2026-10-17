import { apiRegister } from './support/api';
import { expect, test } from './support/fixtures';
import { newUser, planCards, signInViaForm } from './support/ui';

const isEnvelope = (body: unknown) =>
  typeof body === 'object' &&
  body !== null &&
  Object.keys(body).sort().join(',') === 'ct,iv,v' &&
  (body as { v: unknown }).v === 1;

test('API responses are sealed on the wire and opened only in the page', async ({ page }) => {
  const sealed = page.waitForResponse(
    (r) => r.url().endsWith('/api/plans') && r.request().method() === 'GET',
  );
  await page.goto('/plans');
  const response = await sealed;

  expect(response.request().headers()['x-enc-session']).toMatch(/^[A-Za-z0-9+/]{87}=$/);
  expect(response.headers()['x-enc']).toBe('1');
  expect(response.headers()['cache-control']).toContain('no-store');
  const raw = await response.text();
  expect(isEnvelope(JSON.parse(raw))).toBe(true);
  for (const plaintext of ['Starter', 'Business', 'Pro Annual', '29900']) {
    expect(raw).not.toContain(plaintext);
  }

  // The page decrypted the same response and shows the plans.
  await expect(planCards(page)).toHaveCount(4);
  await expect(planCards(page).first()).toContainText('Starter');
});

test('sign-in credentials leave the browser encrypted', async ({ page, request }) => {
  const user = newUser('sealed');
  await apiRegister(request, user);
  await page.goto('/login');
  const login = page.waitForRequest((r) => r.url().endsWith('/api/auth/login'));
  await signInViaForm(page, user.email, user.password);
  const body = (await login).postData() ?? '';

  expect(isEnvelope(JSON.parse(body))).toBe(true);
  expect(body).not.toContain(user.email);
  expect(body).not.toContain(user.password);
  await expect(page).toHaveURL(/\/dashboard$/);
});

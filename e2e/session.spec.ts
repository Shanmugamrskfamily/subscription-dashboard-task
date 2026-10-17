import { apiRegister } from './support/api';
import { expect, test } from './support/fixtures';
import { newUser, signInViaForm, signOut } from './support/ui';

test('a session survives a reload, and signing out ends it', async ({ page, request }) => {
  const user = newUser('session');
  await apiRegister(request, user);
  await page.goto('/login');
  await signInViaForm(page, user.email, user.password);
  await expect(page).toHaveURL(/\/dashboard$/);
  const greeting = page.getByRole('heading', { level: 1, name: new RegExp(user.name) });
  await expect(greeting).toBeVisible();

  // The access token lives in memory only; the HttpOnly refresh cookie restores it.
  const cookies = await page.context().cookies();
  const refreshCookie = cookies.find((c) => c.name === 'pp_rt');
  expect(refreshCookie?.httpOnly).toBe(true);
  expect(refreshCookie?.sameSite).toBe('Strict');

  const restored = page.waitForResponse(
    (r) => r.url().endsWith('/api/auth/refresh') && r.request().method() === 'POST',
  );
  await page.reload();
  expect((await restored).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(greeting).toBeVisible();

  await signOut(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
  await page.goto('/workspace');
  await expect(page).toHaveURL(/\/login\?next=%2Fworkspace$/);
  await page.reload();
  await expect(page).toHaveURL(/\/login\?next=%2Fworkspace$/);
});

test.describe('theme', () => {
  test.use({ colorScheme: 'light' });

  test('the theme toggle switches to dark mode and remembers it', async ({ page }) => {
    await page.goto('/plans');
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/\bdark\b/);

    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('planpilot-theme'))).toBe('dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      background,
    );

    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(html).not.toHaveClass(/\bdark\b/);
  });
});

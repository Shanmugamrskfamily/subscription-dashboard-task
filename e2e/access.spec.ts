import { ADMIN, apiRegister } from './support/api';
import { expect, test } from './support/fixtures';
import { newUser, registerAs, signInAs, signInViaForm } from './support/ui';

test('a signed-out visitor is sent to sign in, keeping the address they wanted', async ({
  page,
}) => {
  await page.goto('/dashboard?x=1');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%3Fx%3D1$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
});

test('after signing in, the visitor is taken back to where they were going', async ({
  page,
  request,
}) => {
  const user = newUser('next');
  await apiRegister(request, user);
  await page.goto('/dashboard?x=1');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%3Fx%3D1$/);

  await signInViaForm(page, user.email, user.password);
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(user.name) })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\?x=1$/, { timeout: 3_000 });
});

test('a customer opening the admin area gets the 403 page', async ({ page }) => {
  await registerAs(page);
  await page.goto('/admin/users');
  await expect(
    page.getByRole('heading', { level: 1, name: 'This area is for admins' }),
  ).toBeVisible();
  await expect(page.getByText('403', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await page.getByRole('link', { name: 'Back to my dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('an admin opening a customer page is sent to the admin area', async ({ page }) => {
  await signInAs(page, ADMIN);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

test('an unknown address shows the 404 page', async ({ page }) => {
  await page.goto('/this/page/does-not-exist');
  await expect(
    page.getByRole('heading', { level: 1, name: 'This page went off course' }),
  ).toBeVisible();
  await expect(page.getByText('404', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/plans$/);
});

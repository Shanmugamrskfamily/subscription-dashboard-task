import { expect, test } from './support/fixtures';
import { newUser, planCard, planCards } from './support/ui';

test('a visitor compares the four plans, registers and lands without a plan', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/plans$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Pick the plan that fits your team' }),
  ).toBeVisible();
  await expect(planCards(page)).toHaveCount(4);
  for (const [name, price] of [
    ['Starter', '₹299'],
    ['Pro', '₹799'],
    ['Pro Annual', '₹7,999'],
    ['Business', '₹1,999'],
  ]) {
    await expect(planCard(page, name as string)).toContainText(price as string);
  }

  await planCard(page, 'Starter').getByRole('link', { name: 'Get started' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();

  const name = page.getByLabel('Full name');
  const email = page.getByLabel('Work email');
  const password = page.getByLabel('Password', { exact: true });
  const confirm = page.getByLabel('Confirm password');
  const submit = page.getByRole('button', { name: 'Create account' });

  // Empty form: every field explains itself.
  await submit.click();
  for (const message of [
    'Name is required',
    'Email is required',
    'Password is required',
    'Confirm your password',
  ]) {
    await expect(page.getByText(message, { exact: true })).toBeVisible();
  }
  await expect(name).toHaveAttribute('aria-invalid', 'true');

  // Bad values get specific messages, linked to their fields.
  await name.fill('J');
  await email.fill('not-an-email');
  await password.fill('short');
  await confirm.fill('different');
  await submit.click();
  await expect(name).toHaveAccessibleDescription('Name must be at least 2 characters');
  await expect(email).toHaveAccessibleDescription('Enter a valid email address');
  await expect(password).toHaveAccessibleDescription('Use at least 8 characters');
  await expect(confirm).toHaveAccessibleDescription('Passwords do not match');

  await password.fill('alllowercase1');
  await expect(password).toHaveAccessibleDescription('Add an uppercase letter');

  const user = newUser('visitor');
  await name.fill(user.name);
  await email.fill(user.email);
  await password.fill(user.password);
  await confirm.fill(user.password);
  await submit.click();

  // New accounts go to the plans page first, then the dashboard shows the "no plan" state.
  await expect(page).toHaveURL(/\/plans$/);
  await expect(page.getByText(/Welcome aboard, Test!/)).toBeVisible();
  await expect(
    page.getByText("You don't have an active plan yet.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Dashboard' })
    .click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(user.name) })).toBeVisible();
  await expect(
    page.getByText('Welcome to PlanPilot! Pick a plan to unlock projects'),
  ).toBeVisible();
  await expect(page.getByText('No plan yet', { exact: true })).toBeVisible();
  await expect(page.getByText('No plan', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Choose a plan' })).toBeVisible();
  await expect(page.getByText('No payments yet')).toBeVisible();
});

test('a new account lands on the plans page', async ({ page }) => {
  const user = newUser('landing');
  await page.goto('/register');
  await page.getByLabel('Full name').fill(user.name);
  await page.getByLabel('Work email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByLabel('Confirm password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText("You don't have an active plan yet.")).toBeVisible();
  await expect(page).toHaveURL(/\/plans$/);
});

test('the first failed submit moves focus to the first invalid field', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Name is required')).toBeVisible();
  await expect(page.getByLabel('Full name')).toBeFocused({ timeout: 3_000 });
});

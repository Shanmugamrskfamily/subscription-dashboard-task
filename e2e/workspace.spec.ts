import { apiSubscribe } from './support/api';
import { expect, test } from './support/fixtures';
import { registerAs } from './support/ui';

test('Starter stops at three projects and offers an upgrade', async ({ page }) => {
  const session = await registerAs(page);
  await apiSubscribe(page.request, session, 'starter');
  await page.goto('/workspace');
  await expect(page.getByRole('heading', { level: 1, name: 'Workspace' })).toBeVisible();
  const usage = page.getByRole('region', { name: 'Plan usage' });
  await expect(usage).toContainText('3 projects left on Starter');

  const names = ['Launch site', 'Hiring plan', 'Board deck'];
  for (const [i, name] of names.entries()) {
    await page.getByRole('button', { name: `New project · ${3 - i} left` }).click();
    const dialog = page.getByRole('dialog', { name: 'New project' });
    await dialog.getByLabel('Project name').fill(name);
    await dialog.getByRole('button', { name: 'Create project' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 3, name })).toBeVisible();
  }

  await expect(page.getByRole('tab', { name: 'Projects 3' })).toBeVisible();
  await expect(usage).toContainText('Limit reached. Upgrade for more room.');
  await expect(page.getByRole('progressbar', { name: 'Projects used' })).toBeVisible();

  // The fourth one is stopped before a form opens, with the way out.
  await page.getByRole('button', { name: 'New project · 0 left' }).click();
  const blocker = page.getByRole('dialog', { name: "You've reached your Starter limit" });
  await expect(blocker).toBeVisible();
  await expect(blocker).toContainText('Your Starter plan includes 3 projects');
  await expect(blocker).toContainText('With Pro');
  await expect(blocker).toContainText('25 projects');
  await expect(page.getByRole('dialog', { name: 'New project' })).toHaveCount(0);
  await blocker.getByRole('button', { name: 'See plans' }).click();
  await expect(page).toHaveURL(/\/plans$/);
});

test('without a plan the workspace is read-only', async ({ page }) => {
  await registerAs(page);
  await page.goto('/workspace');
  const banner = page.getByRole('status').filter({ hasText: 'Pick a plan to start building' });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('link', { name: 'Choose a plan' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Plan usage' })).toContainText(
    'Read-only until you pick a plan',
  );

  await page.getByRole('button', { name: 'New project', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Pick a plan to start building' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'New project' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Choose a plan' }).click();
  await expect(page).toHaveURL(/\/plans$/);
});

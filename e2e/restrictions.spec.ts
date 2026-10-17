import { ADMIN, apiRegister } from './support/api';
import { expect, test } from './support/fixtures';
import { newUser, signInAs, signInViaForm } from './support/ui';

test('an admin blocks a customer with a reason, and the customer sees why', async ({
  page,
  request,
  browser,
}) => {
  // The customer signs up in a separate context, so the admin page stays the admin's.
  const customer = newUser('blocked');
  await apiRegister(request, customer);

  await signInAs(page, ADMIN);
  await page.goto(`/admin/users?search=${encodeURIComponent(customer.email)}`);
  const row = page.getByRole('row', { name: new RegExp(customer.email.replace(/\./g, '\\.')) });
  await expect(row).toBeVisible();
  await row.click();

  const drawer = page.getByRole('dialog', { name: customer.name });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Set status' }).click();

  const dialog = page.getByRole('dialog', { name: "Set Test's account status" });
  await expect(dialog).toBeVisible();
  await dialog
    .locator('label')
    .filter({ hasText: /^Blocked/ })
    .click();
  await expect(dialog.getByRole('radio', { name: /^Blocked/ })).toBeChecked();
  const reason = 'Chargeback under investigation';
  await dialog.getByLabel('Reason').fill(reason);
  await dialog.getByRole('button', { name: 'Save status' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Test's account is now blocked.")).toBeVisible();
  await expect(drawer.getByText('Blocked', { exact: true }).first()).toBeVisible();

  // The customer, in their own browser, is told exactly why they can't get in.
  const theirs = await browser.newContext();
  const theirPage = await theirs.newPage();
  await theirPage.goto('/login');
  await signInViaForm(theirPage, customer.email, customer.password);
  const banner = theirPage.getByRole('alert').filter({ hasText: 'blocked' });
  await expect(banner).toContainText('Your access has been blocked by an administrator.');
  await expect(banner).toContainText(`Reason: ${reason}`);
  await expect(banner.getByRole('link', { name: 'support@planpilot.demo' })).toBeVisible();
  await expect(theirPage).toHaveURL(/\/login/);
  await theirs.close();
});

test('seeded restricted accounts each explain their own restriction', async ({ page }) => {
  await page.goto('/login');
  const restricted = (label: string) =>
    page.getByRole('button', { name: label, exact: true }).click();
  const banner = page.getByRole('alert');

  await restricted('Blocked');
  await expect(banner).toContainText('Your access has been blocked by an administrator.');
  await expect(banner).toContainText('Reason: Payment dispute under review');

  await restricted('Inactive');
  await expect(banner).toContainText('Your account is inactive.');
  await expect(banner).toContainText("Reason: Account paused at the customer's request");

  await restricted('Access expired');
  await expect(banner).toContainText(/Your access expired on \d{1,2} \w+ \d{4}\./);
  await expect(banner).toContainText('Reason: Contract access window ended');

  await expect(page).toHaveURL(/\/login$/);
});

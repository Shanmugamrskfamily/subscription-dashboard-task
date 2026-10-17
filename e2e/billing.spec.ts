import type { Locator, Page } from '@playwright/test';
import { apiSubscribe } from './support/api';
import { expect, test } from './support/fixtures';
import { daysFromNow, formatDate, paise, planCard, registerAs } from './support/ui';

/** The value next to a label in the checkout summary (a <dl> of label/value rows). */
const summaryValue = (dialog: Locator, label: string | RegExp) =>
  dialog.locator('dl > div').filter({ hasText: label }).locator('dd');

/** Cards have no landmark role, so find the card around its heading. */
const currentPlanCard = (page: Page) =>
  page
    .locator('.rounded-card')
    .filter({ has: page.getByRole('heading', { name: 'Current plan' }) });

/** Pays the simulated test checkout; returns the amount charged (paise) and the success screen. */
async function payTestCheckout(page: Page) {
  const checkout = page.getByRole('dialog', { name: 'Test checkout' });
  await expect(checkout).toBeVisible();
  const pay = checkout.getByRole('button', { name: /^Pay ₹[\d,.]+ \(test\)$/ });
  const charged = paise((await pay.textContent()) ?? '');
  await pay.click();
  const success = page.getByRole('dialog', { name: "You're all set!" });
  await expect(success).toBeVisible();
  return { charged, success };
}

test('subscribing to Starter through the test checkout activates it', async ({ page }) => {
  await registerAs(page);
  await page.goto('/plans');
  const bell = page.getByRole('button', { name: /^Notifications/ });
  await expect(bell).toHaveAccessibleName('Notifications, 1 unread');

  await planCard(page, 'Starter')
    .getByRole('button', { name: /^Subscribe · (pay )?₹299$/ })
    .click();
  const preview = page.getByRole('dialog', { name: 'Subscribe to Starter' });
  await expect(preview).toBeVisible();
  await expect(summaryValue(preview, 'Due today')).toHaveText('₹299');
  await preview.getByRole('button', { name: 'Pay ₹299' }).click();

  const { charged, success } = await payTestCheckout(page);
  expect(charged).toBe(29_900);
  const endDate = formatDate(daysFromNow(30));
  await expect(success).toContainText(`Starter is active until ${endDate}`);
  await expect(success).toContainText('₹299 paid');
  await success.getByRole('button', { name: 'Go to dashboard' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  const card = currentPlanCard(page);
  await expect(card.getByText('Active', { exact: true })).toBeVisible();
  await expect(card.getByText('Starter', { exact: true })).toBeVisible();
  await expect(card.getByRole('img', { name: '30 of 30 days left' })).toBeVisible();
  await expect(summaryValue(card, 'Ends')).toHaveText(endDate);
  await expect(page.getByRole('row', { name: /Starter New ₹299 .* Paid/ })).toBeVisible();

  // Activation and payment both notify.
  await expect(bell).toHaveAccessibleName('Notifications, 3 unread');
  await bell.click();
  const panel = page.getByRole('menu');
  await expect(panel.getByText('Starter is active')).toBeVisible();
  await expect(panel.getByText('Payment received')).toBeVisible();
});

test('upgrading charges only the difference, downgrading turns credit into bonus days', async ({
  page,
}) => {
  const session = await registerAs(page);
  await apiSubscribe(page.request, session, 'starter');
  await page.goto('/plans');
  await expect(page.getByText(/You're on\s*Starter/)).toBeVisible();

  // Upgrade: the unused Starter days are credited against Pro.
  await planCard(page, 'Pro')
    .getByRole('button', { name: /^Upgrade · pay ₹/ })
    .click();
  const upgrade = page.getByRole('dialog', { name: 'Upgrade to Pro' });
  await expect(upgrade).toBeVisible();
  await expect(upgrade).toContainText('Upgrade from Starter');
  await expect(summaryValue(upgrade, /^Pro · 30 days/)).toHaveText('₹799');
  const credit = paise(await summaryValue(upgrade, 'Credit for unused days').innerText());
  const due = paise(await summaryValue(upgrade, 'Due today').innerText());
  // Just bought, so nearly all of the ₹299 comes back.
  expect(credit).toBeGreaterThan(29_000);
  expect(credit).toBeLessThanOrEqual(29_900);
  expect(due).toBe(79_900 - credit);
  await upgrade.getByRole('button', { name: /^Pay ₹/ }).click();

  const { charged, success: upgraded } = await payTestCheckout(page);
  // The server prices the order again; a second later the credit can be a paisa smaller.
  expect(Math.abs(charged - due)).toBeLessThanOrEqual(1);
  await expect(upgraded).toContainText(`Pro is active until ${formatDate(daysFromNow(30))}`);
  await upgraded.getByRole('button', { name: 'Go to dashboard' }).click();
  const card = currentPlanCard(page);
  await expect(card.getByText('Pro', { exact: true })).toBeVisible();
  await expect(summaryValue(card, 'How it started')).toHaveText('Upgrade');

  // Downgrade: Pro's leftover value is more than Starter costs, so it's free and adds days.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plans' }).click();
  await planCard(page, 'Starter').getByRole('button', { name: 'Switch · ₹0 today' }).click();
  const downgrade = page.getByRole('dialog', { name: 'Switch to Starter' });
  await expect(downgrade).toBeVisible();
  await expect(downgrade).toContainText('Downgrade from Pro');
  await expect(summaryValue(downgrade, 'Due today')).toHaveText('₹0');
  const bonus = await summaryValue(downgrade, 'Leftover credit becomes').innerText();
  const bonusDays = Number(bonus.match(/(\d+) bonus days?/)?.[1]);
  // About ₹500 of Pro credit left over, at ₹299 per 30 days of Starter.
  expect(bonusDays).toBeGreaterThanOrEqual(49);
  expect(bonusDays).toBeLessThanOrEqual(50);
  await downgrade.getByRole('button', { name: 'Confirm switch' }).click();

  const switched = page.getByRole('dialog', { name: "You're all set!" });
  await expect(switched).toContainText(
    `Starter is active until ${formatDate(daysFromNow(30 + bonusDays))}`,
  );
  await expect(switched).toContainText('Your unused credit covered this change. Nothing to pay.');
  await switched.getByRole('button', { name: 'Go to dashboard' }).click();
  await expect(card.getByText('Starter', { exact: true })).toBeVisible();
  await expect(summaryValue(card, 'How it started')).toHaveText('Downgrade');
});

test('renewing early adds a full period after the current end date', async ({ page }) => {
  const session = await registerAs(page);
  await apiSubscribe(page.request, session, 'starter');
  await page.goto('/dashboard');

  await currentPlanCard(page).getByRole('button', { name: 'Renew' }).click();
  const preview = page.getByRole('dialog', { name: 'Renew Starter' });
  await expect(preview).toBeVisible();
  const newEnd = formatDate(daysFromNow(60));
  await expect(preview).toContainText(`your plan now runs until ${newEnd}`);
  await expect(summaryValue(preview, 'Due today')).toHaveText('₹299');
  await preview.getByRole('button', { name: 'Pay ₹299' }).click();

  const { charged, success } = await payTestCheckout(page);
  expect(charged).toBe(29_900);
  await expect(success).toContainText(`Starter is active until ${newEnd}`);
  await success.getByRole('button', { name: 'Go to dashboard' }).click();

  const card = currentPlanCard(page);
  await expect(summaryValue(card, 'Ends')).toHaveText(newEnd);
  // Renewed one period ahead: no second early renewal.
  await expect(card.getByRole('button', { name: 'Renew' })).toHaveCount(0);
  await page.goto('/plans');
  await expect(
    planCard(page, 'Starter').getByRole('button', { name: /^Renewed · \d+ days left$/ }),
  ).toBeDisabled();
});

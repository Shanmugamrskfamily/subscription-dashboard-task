import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { ADMIN } from './support/api';
import { expect, test } from './support/fixtures';
import { signInAs } from './support/ui';

test.beforeEach(async ({ page }) => {
  await signInAs(page, ADMIN);
});

test('overview shows KPIs and charts, and the range switch reloads them', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  const mrr = page.getByRole('region', { name: 'Monthly recurring revenue' });
  await expect(mrr).toContainText(/₹[\d,]+/);
  for (const kpi of ['Active subscribers', 'Online now', 'Expiring in 7 days']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${kpi} \\d`) })).toBeVisible();
  }
  await expect(page.getByText('Churn rate')).toBeVisible();
  await expect(page.getByText('Users at plan limit')).toBeVisible();

  // Both charts draw real SVG with data.
  await expect(page.getByRole('heading', { name: 'Revenue & new subscriptions' })).toBeVisible();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  await expect(page.locator('.recharts-area-area').first()).toBeVisible();
  await expect(page.locator('.recharts-pie-sector').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pro: \d+ active/ })).toBeVisible();

  const range = page.getByRole('radiogroup', { name: 'Date range' });
  await expect(range.getByRole('radio', { name: '30d' })).toBeChecked();
  await expect(page.getByText('Revenue (30d)')).toBeVisible();

  await range.getByRole('radio', { name: '7d' }).click();
  await expect(page).toHaveURL(/range=7d/);
  await expect(range.getByRole('radio', { name: '7d' })).toBeChecked();
  await expect(page.getByText('Revenue (7d)')).toBeVisible();
  await expect(page.getByText('Last 7 days · hover or tap the chart for details')).toBeVisible();

  await range.getByRole('radio', { name: '12m' }).click();
  await expect(page).toHaveURL(/range=12m/);
  await expect(page.getByText('Revenue (12m)')).toBeVisible();
  await expect(page.getByText('Last 12 months · hover or tap the chart for details')).toBeVisible();

  // Hovering the revenue chart shows the tooltip for that bucket.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const chart = page
    .locator('.rounded-card')
    .filter({ has: page.getByRole('heading', { name: 'Revenue & new subscriptions' }) })
    .locator('.recharts-wrapper');
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  if (!box) throw new Error('revenue chart has no size');
  const y = box.y + box.height * 0.5;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 12 });
  await expect(chart.locator('.recharts-tooltip-wrapper')).toContainText('New subscriptions');
});

/** Texts of one column (1-based) across the visible table rows. */
const column = (page: Page, index: number) =>
  page.locator(`table tbody tr td:nth-child(${index})`).allInnerTexts();

test('subscriptions table filters by status, plan and search, and exports CSV', async ({
  page,
}) => {
  await page.goto('/admin/subscriptions');
  await expect(page.getByRole('heading', { level: 1, name: 'Subscriptions' })).toBeVisible();
  const count = page.getByText(/^\d+ subscriptions?/);
  await expect(count).toBeVisible();
  const total = Number((await count.innerText()).match(/\d+/)?.[0]);

  await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Expired' });
  await expect(page).toHaveURL(/status=expired/);
  await expect(page.getByText(/subscriptions? match your filters/)).toBeVisible();
  await expect.poll(() => column(page, 3)).not.toHaveLength(0);
  await expect.poll(async () => new Set(await column(page, 3))).toEqual(new Set(['Expired']));
  await expect(page.getByRole('button', { name: 'Remove filter Status: Expired' })).toBeVisible();
  const expired = Number((await count.innerText()).match(/\d+/)?.[0]);
  expect(expired).toBeLessThan(total);

  await page.getByRole('button', { name: 'Remove filter Status: Expired' }).click();
  await page.getByLabel('Plan', { exact: true }).selectOption({ label: 'Business' });
  await expect(page).toHaveURL(/planId=[a-f\d]{24}/);
  await expect.poll(async () => new Set(await column(page, 2))).toEqual(new Set(['Business']));

  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.getByRole('searchbox', { name: 'Search' }).fill('priya@planpilot.demo');
  await expect(page).toHaveURL(/search=priya/);
  await expect
    .poll(async () => (await column(page, 1)).every((t) => t.includes('priya@planpilot.demo')))
    .toBe(true);
  await expect(page.getByText(/^2 subscriptions match your filters/)).toBeVisible();

  // The export honours the filters and downloads a real CSV file.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect(
    page.getByText(/Exported 2 subscriptions to planpilot-subscriptions-/),
  ).toBeVisible();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^planpilot-subscriptions-\d{4}-\d{2}-\d{2}\.csv$/);
  // The file starts with a byte-order mark so Excel reads it as UTF-8.
  const text = await readFile(await file.path(), 'utf8');
  const csv = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = csv.trim().split(/\r?\n/);
  expect(lines[0]).toMatch(/email/i);
  expect(lines).toHaveLength(3);
  expect(lines.slice(1).every((line) => line.includes('priya@planpilot.demo'))).toBe(true);
});

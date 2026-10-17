import type { Page } from '@playwright/test';
import { ADMIN, demo } from './support/api';
import { expect, test } from './support/fixtures';
import { settle, signInAs } from './support/ui';

/**
 * Runs in the "phone" project (touch, mobile user agent) and resizes through phone,
 * tablet and desktop widths. Every key page must fit without sideways scrolling, and the
 * phone layouts must show their own navigation.
 */
const WIDTHS = [360, 390, 768, 1024, 1440];

const CUSTOMER_PAGES = [
  ['/dashboard', /Priya Sharma/],
  ['/workspace', 'Workspace'],
  ['/plans', 'Pick the plan that fits your team'],
  ['/notifications', 'Notifications'],
  ['/profile', 'Profile and security'],
] as const;

const ADMIN_PAGES = [
  ['/admin', 'Overview'],
  ['/admin/subscriptions', 'Subscriptions'],
  ['/admin/users', 'Users'],
] as const;

const GUEST_PAGES = [
  ['/login', 'Welcome back'],
  ['/register', 'Create your account'],
  ['/plans', 'Pick the plan that fits your team'],
] as const;

/** Page width against the viewport, plus the elements that stick out (for the failure message). */
async function horizontalOverflow(page: Page, width: number) {
  return page.evaluate((viewport) => {
    const doc = document.documentElement;
    const scrollWidth = Math.max(doc.scrollWidth, document.body.scrollWidth);
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const overflowX = getComputedStyle(p).overflowX;
        if (overflowX !== 'visible') return true;
      }
      return false;
    };
    const offenders = [...document.body.querySelectorAll('*')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > viewport + 1 && !clipped(el);
      })
      .slice(0, 5)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const name = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].slice(0, 3).join('.')}`;
        return `${name} right=${Math.round(r.right)}`;
      });
    return { scrollWidth, innerWidth: window.innerWidth, offenders };
  }, width);
}

async function checkPage(page: Page, path: string, title: string | RegExp, width: number) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await settle(page, 200);
  const result = await horizontalOverflow(page, width);
  expect(
    result.scrollWidth,
    `${path} at ${width}px is ${result.scrollWidth}px wide; sticking out: ${result.offenders.join(', ')}`,
  ).toBeLessThanOrEqual(width);
  expect(result.scrollWidth).toBeLessThanOrEqual(result.innerWidth);
}

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.describe.configure({ mode: 'parallel' });
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    });

    test('public pages fit the screen', async ({ page }) => {
      for (const [path, title] of GUEST_PAGES) await checkPage(page, path, title, width);
    });

    test('customer pages fit, with a bottom tab bar on phones', async ({ page }) => {
      await signInAs(page, demo('priya'));
      for (const [path, title] of CUSTOMER_PAGES) await checkPage(page, path, title, width);

      // The tab bar replaces the top links below 768 px.
      const alerts = page.getByRole('link', { name: 'Alerts' });
      if (width < 768) {
        await expect(alerts).toBeVisible();
        await alerts.click();
        await expect(page).toHaveURL(/\/notifications$/);
      } else {
        await expect(alerts).toBeHidden();
        await expect(
          page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workspace' }),
        ).toBeVisible();
      }
    });

    test('admin pages fit, with a drawer menu below 1024 px', async ({ page }) => {
      await signInAs(page, ADMIN);
      for (const [path, title] of ADMIN_PAGES) await checkPage(page, path, title, width);

      const menu = page.getByRole('button', { name: 'Open navigation' });
      if (width < 1024) {
        await expect(menu).toBeVisible();
        await menu.click();
        const drawer = page.getByRole('dialog', { name: 'PlanPilot admin' });
        await expect(drawer.getByRole('navigation', { name: 'Admin' })).toBeVisible();
        await drawer.getByRole('link', { name: 'Users' }).click();
        await expect(drawer).toBeHidden();
        await expect(page).toHaveURL(/\/admin\/users$/);
      } else {
        await expect(menu).toBeHidden();
        await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible();
      }
    });
  });
}

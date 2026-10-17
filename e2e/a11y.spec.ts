import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { ADMIN, demo } from './support/api';
import { expect, test } from './support/fixtures';
import { settle, signInAs } from './support/ui';

/**
 * WCAG 2.1 A/AA scan of every main screen, in light and dark mode. Serious and critical
 * findings fail the test; the full axe results are attached to the report either way.
 */
type Who = 'guest' | 'customer' | 'admin';
const PAGES: { name: string; path: string; who: Who; ready: (page: Page) => Promise<void> }[] = [
  { name: 'login', path: '/login', who: 'guest', ready: heading('Welcome back') },
  { name: 'register', path: '/register', who: 'guest', ready: heading('Create your account') },
  {
    name: 'plans',
    path: '/plans',
    who: 'customer',
    ready: heading('Pick the plan that fits your team'),
  },
  { name: 'dashboard', path: '/dashboard', who: 'customer', ready: heading(/Priya Sharma/) },
  { name: 'workspace', path: '/workspace', who: 'customer', ready: heading('Workspace') },
  { name: 'profile', path: '/profile', who: 'customer', ready: heading('Profile and security') },
  {
    name: 'notifications',
    path: '/notifications',
    who: 'customer',
    ready: heading('Notifications'),
  },
  { name: 'admin overview', path: '/admin', who: 'admin', ready: heading('Overview') },
  {
    name: 'admin subscriptions',
    path: '/admin/subscriptions',
    who: 'admin',
    ready: heading('Subscriptions'),
  },
  { name: 'admin users', path: '/admin/users', who: 'admin', ready: heading('Users') },
  { name: '404', path: '/no-such-page', who: 'guest', ready: heading('This page went off course') },
];

function heading(name: string | RegExp) {
  return async (page: Page) => {
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  };
}

const BLOCKING = new Set(['serious', 'critical']);

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.describe.configure({ mode: 'parallel' });
    // Reduced motion: the scan sees finished states, not elements mid-fade.
    test.use({ colorScheme: scheme, reducedMotion: 'reduce' });

    for (const target of PAGES) {
      test(`${target.name} has no serious WCAG 2.1 AA violations`, async ({ page }, testInfo) => {
        if (target.who === 'customer') await signInAs(page, demo('priya'));
        if (target.who === 'admin') await signInAs(page, ADMIN);
        await page.goto(target.path);
        await target.ready(page);
        await settle(page);
        await expect(page.locator('html')).toHaveClass(
          scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/,
        );

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        await testInfo.attach(`axe-${target.name}-${scheme}.json`, {
          body: JSON.stringify(results, null, 2),
          contentType: 'application/json',
        });

        const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ''));
        const summary = blocking.map(
          (v) =>
            `${v.impact} ${v.id}: ${v.help}\n${v.nodes
              .slice(0, 8)
              .map(
                (n) =>
                  `    ${n.target.join(' ')}\n      ${n.failureSummary?.split('\n').join(' ')}`,
              )
              .join('\n')}`,
        );
        expect(summary, `axe found ${blocking.length} serious/critical issue(s)`).toEqual([]);
      });
    }
  });
}

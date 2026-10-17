import { expect } from '@playwright/test';
import type { Page, Request, Response } from '@playwright/test';
import { apiLogin, apiRegister } from './api';
import type { Session } from './api';

/** The app restores a session on load only when this browser has signed in before. */
const SESSION_HINT = 'planpilot-session';

const letters = (n: number) =>
  Array.from(
    { length: n },
    () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)],
  ).join('');

/** A brand-new customer (names allow letters only, so the random part is letters). */
export function newUser(prefix = 'flow') {
  const tag = `${Date.now().toString(36)}${letters(4)}`;
  const surname = letters(6);
  return {
    name: `Test ${surname[0]?.toUpperCase()}${surname.slice(1)}`,
    email: `e2e.${prefix}.${tag}@example.com`,
    password: 'Flow@12345',
  };
}

/** Marks the tab as "signed in before", once, so the next load restores the cookie session. */
async function hintSession(page: Page) {
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('e2e-hinted')) return;
    sessionStorage.setItem('e2e-hinted', '1');
    localStorage.setItem(key, '1');
  }, SESSION_HINT);
}

/** Signs in through the API (fast) and lets the next page load restore that session. */
export async function signInAs(page: Page, credentials: { email: string; password: string }) {
  const session = await apiLogin(page.request, credentials);
  await hintSession(page);
  return session;
}

/** Registers a new customer through the API and signs this page in as them. */
export async function registerAs(
  page: Page,
  user = newUser(),
): Promise<Session & { password: string }> {
  const session = await apiRegister(page.request, user);
  await hintSession(page);
  return { ...session, password: user.password };
}

/** Sign-in through the real form. */
export async function signInViaForm(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/**
 * Waits until no request has been in flight for `idleMs`. Playwright's "networkidle"
 * never settles here: the client's health ping leaves its response body unread, so
 * Chromium keeps that request open. A response arriving counts as done.
 */
export async function waitForQuiet(page: Page, idleMs = 500, timeout = 15_000) {
  const inflight = new Set<Request>();
  let last = Date.now();
  const start = (request: Request) => {
    inflight.add(request);
    last = Date.now();
  };
  const finish = (request: Request) => {
    inflight.delete(request);
    last = Date.now();
  };
  const onResponse = (response: Response) => finish(response.request());
  page.on('request', start);
  page.on('response', onResponse);
  page.on('requestfailed', finish);
  try {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (inflight.size === 0 && Date.now() - last >= idleMs) return;
      await page.waitForTimeout(100);
    }
  } finally {
    page.off('request', start);
    page.off('response', onResponse);
    page.off('requestfailed', finish);
  }
}

/**
 * Network quiet, then every finite animation finished (entrance fades, count-ups,
 * chart draw-in). Endless decorative loops (floating art, live dots) are ignored.
 */
export async function settle(page: Page, extraMs = 300) {
  await waitForQuiet(page);
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every(
            (a) =>
              a.playState !== 'running' ||
              (a.effect?.getComputedTiming().iterations ?? 1) === Infinity,
          ),
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(extraMs);
}

/** Dates as the app shows them ("16 Nov 2026"), in Indian time. */
export const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);

export const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

/** "₹500.01" → 50001 paise. */
export const paise = (text: string) => Math.round(Number(text.replace(/[^\d.]/g, '')) * 100);

/** Opens the account menu in the header. */
export async function openAccountMenu(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  return page.getByRole('menu');
}

export async function signOut(page: Page) {
  const menu = await openAccountMenu(page);
  await menu.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Toasts can cover content in screenshots; close any that are showing. */
export async function dismissToasts(page: Page) {
  const toasts = page.locator('[data-sonner-toast]');
  for (const close of await page.locator('[data-sonner-toast] [data-close-button]').all()) {
    await close.click({ force: true }).catch(() => undefined);
  }
  await expect(toasts)
    .toHaveCount(0, { timeout: 5_000 })
    .catch(() => undefined);
}

/** The plan cards on /plans (top-level items only, not their feature lists). */
export const planCards = (page: Page) =>
  page.getByRole('region', { name: 'Plans' }).locator(':scope > ul > li');

export const planCard = (page: Page, name: string) =>
  planCards(page).filter({ has: page.getByText(name, { exact: true }) });

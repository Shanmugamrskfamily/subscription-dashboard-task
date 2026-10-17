// Re-captures the README screenshots and the demo GIF into docs/media/.
//
//   npm run capture             start a fresh API (5100) and web app (5174), capture, stop them
//   npm run capture -- --reuse  use an E2E stack that is already running on those ports
//   npm run capture -- --gif    only re-record the demo GIF
//
// The stack is the same hermetic one the end-to-end tests use (in-memory MongoDB, simulated
// payments, secrets made for this run only). Needs ffmpeg on PATH for the GIF.
/* global document, addEventListener */
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, request as playwrightRequest } from '@playwright/test';
import {
  API_ARGS,
  API_CWD,
  HEALTH_URL,
  ROOT,
  WEB_ARGS,
  WEB_CWD,
  WEB_URL,
  apiEnv,
  webEnv,
} from '../e2e/support/stack.mjs';

const OUT = resolve(ROOT, 'docs/media');
const REUSE = process.argv.includes('--reuse');
const GIF_ONLY = process.argv.includes('--gif');
const MAX_PNG_BYTES = 500 * 1024;
const MAX_GIF_BYTES = 8 * 1024 * 1024;
const ADMIN = { email: 'admin@planpilot.demo', password: 'Admin@12345' };
const demo = (name) => ({ email: `${name}@planpilot.demo`, password: 'Demo@12345' });
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const log = (message) => console.log(`[capture] ${message}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- the stack ----------

const children = [];

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(url, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp(url)) return;
    await sleep(500);
  }
  throw new Error(`${label} did not come up at ${url} within ${timeoutMs / 1000}s`);
}

function start(label, args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-4_000);
  });
  child.on('exit', (code) => {
    if (code && !child.stopping) console.error(`[capture] ${label} exited (${code})\n${stderr}`);
  });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    child.stopping = true;
    if (child.exitCode === null) child.kill();
  }
}

async function startStack() {
  const [apiUp, webUp] = await Promise.all([isUp(HEALTH_URL), isUp(WEB_URL)]);
  if (REUSE) {
    if (!apiUp || !webUp) throw new Error('--reuse needs the E2E stack running on 5100 and 5174');
    log('reusing the running E2E stack');
    return;
  }
  if (apiUp || webUp) {
    throw new Error(
      'Ports 5100/5174 are already in use. Stop that stack first (a stale API would show old seed data), or pass --reuse.',
    );
  }
  log('starting the API (in-memory MongoDB) and the web app');
  start('api', API_ARGS, API_CWD, apiEnv());
  start('web', WEB_ARGS, WEB_CWD, webEnv());
  await Promise.all([
    waitFor(HEALTH_URL, 'The API', 180_000),
    waitFor(WEB_URL, 'The web app', 120_000),
  ]);
}

// ---------- browser helpers ----------

async function api() {
  return playwrightRequest.newContext({
    baseURL: WEB_URL,
    extraHTTPHeaders: { 'X-Requested-With': 'planpilot' },
  });
}

async function resetDemo() {
  const ctx = await api();
  const login = await ctx.post('/api/auth/login', { data: ADMIN });
  const { accessToken } = (await login.json()).data;
  const res = await ctx.post('/api/admin/demo/reset', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) throw new Error(`Demo reset failed: ${res.status()}`);
  await ctx.dispose();
}

/** A page in its own context: theme, size, and optionally signed in as someone. */
async function openPage(browser, { theme = 'light', phone = false, as, video } = {}) {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    viewport: phone ? PHONE : (video?.size ?? DESKTOP),
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    colorScheme: theme,
    ...(video ? { recordVideo: video } : {}),
  });
  // Theme and "signed in before" hint once per tab, so later toggles in the tab stick.
  await context.addInitScript(
    ({ theme, signedIn }) => {
      if (sessionStorage.getItem('capture-init')) return;
      sessionStorage.setItem('capture-init', '1');
      localStorage.setItem('planpilot-theme', theme);
      if (signedIn) localStorage.setItem('planpilot-session', '1');
    },
    { theme, signedIn: Boolean(as) },
  );
  if (as) {
    const res = await context.request.post('/api/auth/login', {
      data: as,
      headers: { 'X-Requested-With': 'planpilot' },
    });
    if (!res.ok()) throw new Error(`Sign-in as ${as.email} failed: ${res.status()}`);
  }
  const page = await context.newPage();
  return { context, page };
}

/** Network quiet (the health ping never "finishes", so responses count as done). */
async function waitForQuiet(page, idleMs = 600, timeoutMs = 20_000) {
  const inflight = new Set();
  let last = Date.now();
  const onRequest = (r) => {
    inflight.add(r);
    last = Date.now();
  };
  const onDone = (r) => {
    inflight.delete(r);
    last = Date.now();
  };
  const onResponse = (r) => onDone(r.request());
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onDone);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !(inflight.size === 0 && Date.now() - last >= idleMs)) {
    await sleep(100);
  }
  page.off('request', onRequest);
  page.off('response', onResponse);
  page.off('requestfailed', onDone);
}

/** Quiet network, finished entrance animations and count-ups, no toasts, mouse out of the way. */
async function settle(page, extraMs = 1_200) {
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
  await page
    .locator('[data-sonner-toast]')
    .first()
    .waitFor({ state: 'detached', timeout: 8_000 })
    .catch(() => undefined);
}

const heading = (page, name) => page.getByRole('heading', { level: 1, name });

/** Re-encodes a PNG with a 256-colour palette when it is over the size budget. */
function shrinkPng(file) {
  const tmp = `${file}.tmp.png`;
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      file,
      '-vf',
      'split[a][b];[a]palettegen=max_colors=256:stats_mode=single[p];[b][p]paletteuse=dither=sierra2_4a',
      tmp,
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error(`ffmpeg could not shrink ${file}`);
  return rename(tmp, file);
}

const written = [];

async function shoot(page, name) {
  await page.mouse.move(0, 0);
  const file = join(OUT, name);
  await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' });
  let { size } = await stat(file);
  if (size > MAX_PNG_BYTES) {
    await shrinkPng(file);
    size = (await stat(file)).size;
  }
  written.push([name, size]);
  log(`${name.padEnd(26)} ${(size / 1024).toFixed(0).padStart(5)} KB`);
}

// ---------- screenshots ----------

async function screenshots(browser) {
  // Sign-in page.
  {
    const { context, page } = await openPage(browser);
    await page.goto('/login');
    await heading(page, 'Welcome back').waitFor();
    await settle(page);
    await shoot(page, 'login.png');

    // A blocked account, told why after the correct password.
    await page.getByRole('button', { name: 'Blocked', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'blocked' }).waitFor();
    await settle(page, 800);
    await shoot(page, 'blocked-login.png');
    await context.close();
  }

  // Customer: plans, dashboard (light and dark), upgrade preview.
  for (const theme of ['light', 'dark']) {
    const { context, page } = await openPage(browser, { theme, as: demo('priya') });
    await page.goto('/dashboard');
    await heading(page, /Priya Sharma/).waitFor();
    await page.getByRole('row', { name: /Paid/ }).first().waitFor();
    await settle(page);
    await shoot(page, `dashboard-${theme}.png`);

    if (theme === 'light') {
      await page.goto('/plans');
      await page
        .getByRole('button', { name: /^Upgrade · pay ₹/ })
        .first()
        .waitFor();
      await settle(page);
      await shoot(page, 'plans.png');

      await page.getByRole('button', { name: /^Upgrade · pay ₹1,/ }).click();
      await page.getByRole('dialog', { name: 'Upgrade to Business' }).waitFor();
      await settle(page, 900);
      await shoot(page, 'checkout-preview.png');
    }
    await context.close();
  }

  // Starter at its project limit: the upgrade dialog.
  {
    const { context, page } = await openPage(browser, { as: demo('dev') });
    await page.goto('/workspace');
    await heading(page, 'Workspace').waitFor();
    await settle(page, 600);
    await page.getByRole('button', { name: 'New project · 0 left' }).click();
    await page.getByRole('dialog', { name: /reached your Starter limit/ }).waitFor();
    await settle(page, 900);
    await shoot(page, 'workspace-limit.png');
    await context.close();
  }

  // Admin: overview (light and dark), subscriptions, user drawer.
  for (const theme of ['light', 'dark']) {
    const { context, page } = await openPage(browser, { theme, as: ADMIN });
    await page.goto('/admin');
    await heading(page, 'Overview').waitFor();
    await page.locator('.recharts-area-area').first().waitFor();
    await settle(page, 1_500);
    await shoot(page, `admin-overview-${theme}.png`);

    if (theme === 'light') {
      await page.goto('/admin/subscriptions');
      await heading(page, 'Subscriptions').waitFor();
      await page.locator('table tbody tr').first().waitFor();
      await settle(page);
      await shoot(page, 'admin-subscriptions.png');

      await page.goto('/admin/users?search=priya%40planpilot.demo');
      await page.getByRole('row', { name: /priya@planpilot\.demo/ }).click();
      const drawer = page.getByRole('dialog', { name: 'Priya Sharma' });
      await drawer.getByRole('button', { name: 'Set status' }).waitFor();
      await settle(page, 900);
      // The drawer focuses its close button on open; a still image doesn't need the ring.
      await page.evaluate(() => document.activeElement?.blur());
      await shoot(page, 'admin-user-drawer.png');
    }
    await context.close();
  }

  // Phones.
  {
    const { context, page } = await openPage(browser, { phone: true, as: demo('priya') });
    await page.goto('/dashboard');
    await heading(page, /Priya Sharma/).waitFor();
    await settle(page);
    await shoot(page, 'mobile-dashboard.png');
    await context.close();
  }
  {
    const { context, page } = await openPage(browser, { phone: true, as: ADMIN });
    await page.goto('/admin');
    await heading(page, 'Overview').waitFor();
    await settle(page, 1_500);
    await shoot(page, 'mobile-admin.png');
    await context.close();
  }
}

// ---------- demo GIF ----------

/** A visible pointer for the recording (Playwright videos don't show the mouse). */
function installCursor() {
  const add = () => {
    if (document.getElementById('capture-cursor')) return;
    const dot = document.createElement('div');
    dot.id = 'capture-cursor';
    Object.assign(dot.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '22px',
      height: '22px',
      margin: '-11px 0 0 -11px',
      borderRadius: '50%',
      background: 'rgba(79, 70, 229, 0.35)',
      border: '2px solid rgba(79, 70, 229, 0.9)',
      boxShadow: '0 0 0 3px rgba(255,255,255,0.7)',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transform: 'translate(-100px, -100px)',
      transition: 'scale 120ms ease',
    });
    document.documentElement.append(dot);
    const at = (e) => (dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`);
    addEventListener('mousemove', at, true);
    addEventListener('mousedown', () => (dot.style.scale = '0.7'), true);
    addEventListener('mouseup', () => (dot.style.scale = '1'), true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', add);
  else add();
}

let pointer = { x: 640, y: 400 };

async function moveTo(page, locator) {
  await locator.waitFor();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Nothing to point at');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const steps = Math.max(8, Math.round(Math.hypot(x - pointer.x, y - pointer.y) / 40));
  await page.mouse.move(x, y, { steps });
  pointer = { x, y };
}

async function clickOn(page, locator, pause = 250) {
  await moveTo(page, locator);
  await page.waitForTimeout(pause);
  await page.mouse.down();
  await page.mouse.up();
}

async function recordDemo(browser, workDir) {
  const size = { width: 1280, height: 800 };
  const { context, page } = await openPage(browser, { video: { dir: workDir, size } });
  await context.addInitScript(installCursor);
  const t0 = Date.now();

  await page.goto('/login');
  await heading(page, 'Welcome back').waitFor();
  await settle(page, 300);
  await page.mouse.move(pointer.x, pointer.y);
  const startAt = (Date.now() - t0) / 1000;
  await page.waitForTimeout(900);

  // A customer from the demo cards.
  await clickOn(page, page.getByRole('button', { name: /^Pro · active/ }));
  await heading(page, /Priya Sharma/).waitFor();
  await settle(page, 1_600);

  // Plans and an upgrade preview, paid through the test checkout.
  await clickOn(
    page,
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plans' }),
  );
  const business = page.getByRole('button', { name: /^Upgrade · pay ₹1,/ });
  await business.waitFor();
  await settle(page, 700);
  await clickOn(page, business);
  const preview = page.getByRole('dialog', { name: 'Upgrade to Business' });
  await preview.waitFor();
  await page.waitForTimeout(2_200);
  await clickOn(page, preview.getByRole('button', { name: /^Pay ₹/ }));
  const checkout = page.getByRole('dialog', { name: 'Test checkout' });
  await checkout.waitFor();
  await page.waitForTimeout(1_200);
  await clickOn(page, checkout.getByRole('button', { name: /\(test\)$/ }));
  const success = page.getByRole('dialog', { name: "You're all set!" });
  await success.waitFor();
  await page.waitForTimeout(2_000);

  // Workspace, then dark mode.
  await clickOn(page, success.getByRole('button', { name: 'Open workspace' }));
  await heading(page, 'Workspace').waitFor();
  await settle(page, 1_200);
  await clickOn(page, page.getByRole('button', { name: 'Switch to dark mode' }));
  await page.waitForTimeout(1_400);

  // Sign out, sign in as the admin.
  await clickOn(page, page.getByRole('button', { name: 'Account menu' }));
  await clickOn(page, page.getByRole('menuitem', { name: 'Sign out' }));
  await heading(page, 'Welcome back').waitFor();
  await page.waitForTimeout(700);
  await clickOn(page, page.getByRole('button', { name: /^Admin Analytics/ }));
  await heading(page, 'Overview').waitFor();
  await page.locator('.recharts-area-area').first().waitFor();
  await settle(page, 1_000);

  // Hover across the revenue chart.
  const chart = page
    .locator('.rounded-card')
    .filter({ has: page.getByRole('heading', { name: 'Revenue & new subscriptions' }) })
    .locator('.recharts-wrapper');
  await moveTo(page, chart);
  await page.waitForTimeout(400);
  const box = await chart.boundingBox();
  if (box) {
    const y = box.y + box.height * 0.45;
    await page.mouse.move(box.x + box.width * 0.25, y, { steps: 12 });
    await page.mouse.move(box.x + box.width * 0.8, y, { steps: 40 });
    pointer = { x: box.x + box.width * 0.8, y };
  }
  await page.waitForTimeout(900);

  // Subscriptions, then a customer's drawer and the block dialog.
  await clickOn(
    page,
    page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Subscriptions' }),
  );
  await heading(page, 'Subscriptions').waitFor();
  await page.locator('table tbody tr').first().waitFor();
  await settle(page, 1_400);
  await clickOn(
    page,
    page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Users' }),
  );
  await heading(page, 'Users').waitFor();
  const search = page.getByRole('searchbox', { name: 'Search' });
  await clickOn(page, search);
  await search.pressSequentially('kavya', { delay: 90 });
  const row = page.getByRole('row', { name: /kavya@planpilot\.demo/ });
  await row.waitFor();
  await settle(page, 500);
  await clickOn(page, row);
  const drawer = page.getByRole('dialog', { name: 'Kavya Sundaram' });
  await drawer.getByRole('button', { name: 'Set status' }).waitFor();
  await page.waitForTimeout(1_200);
  await clickOn(page, drawer.getByRole('button', { name: 'Set status' }));
  const statusDialog = page.getByRole('dialog', { name: "Set Kavya's account status" });
  await statusDialog.waitFor();
  await clickOn(page, statusDialog.locator('label').filter({ hasText: /^Blocked/ }));
  await page.waitForTimeout(2_200);
  const endAt = (Date.now() - t0) / 1000;

  const video = page.video();
  await context.close();
  return { webm: await video.path(), start: Math.max(0, startAt - 0.2), duration: endAt - startAt };
}

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ffmpeg ${args.join(' ')}`);
}

async function makeGif({ webm, start, duration }, workDir) {
  const target = join(OUT, 'demo.gif');
  // Keep it around half a minute: speed up a slow recording rather than cut steps.
  const speed = Math.max(1, duration / 34);
  // Flat UI compresses best without dithering; repeated frames are dropped (a still
  // moment becomes one long frame), so the size goes on what actually moves.
  for (const [fps, width, colors] of [
    [11, 960, 256],
    [10, 960, 192],
    [10, 900, 128],
    [8, 840, 128],
  ]) {
    const filters = `setpts=PTS/${speed.toFixed(3)},fps=${fps},scale=${width}:-1:flags=lanczos`;
    const palette = join(workDir, 'palette.png');
    const input = ['-ss', start.toFixed(2), '-t', duration.toFixed(2), '-i', webm];
    ffmpeg([
      ...input,
      '-vf',
      `${filters},palettegen=stats_mode=full:max_colors=${colors}`,
      palette,
    ]);
    ffmpeg([
      ...input,
      '-i',
      palette,
      '-lavfi',
      `${filters},mpdecimate=hi=768:lo=320:frac=0.33[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`,
      '-fps_mode',
      'vfr',
      '-loop',
      '0',
      target,
    ]);
    const { size } = await stat(target);
    log(
      `demo.gif ${(size / 1024 / 1024).toFixed(1)} MB, ${(duration / speed).toFixed(0)} s, ${fps} fps, ${width} px, ${colors} colours`,
    );
    if (size <= MAX_GIF_BYTES) {
      written.push(['demo.gif', size]);
      return;
    }
  }
  throw new Error(`demo.gif is still over 8 MB (the recording is kept at ${webm})`);
}

// ---------- main ----------

async function main() {
  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (probe.status !== 0) throw new Error('ffmpeg was not found on PATH');

  await mkdir(OUT, { recursive: true });
  const workDir = await mkdtemp(join(tmpdir(), 'planpilot-capture-'));
  process.on('SIGINT', () => {
    stopAll();
    process.exit(130);
  });

  let finished = false;
  try {
    await startStack();
    await resetDemo();
    const browser = await chromium.launch();
    try {
      if (!GIF_ONLY) await screenshots(browser);
      log('recording the walkthrough');
      const recording = await recordDemo(browser, workDir);
      await makeGif(recording, workDir);
    } finally {
      await browser.close();
    }
    // The walkthrough upgraded a demo customer; leave the data as seeded.
    await resetDemo();
    log(`done: ${written.length} files in docs/media`);
    finished = true;
  } finally {
    stopAll();
    // A failed run keeps its recording for a look; a good one cleans up.
    if (finished) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`[capture] ${error.message}`);
  stopAll();
  process.exit(1);
});

import { defineConfig, devices } from '@playwright/test';
import {
  API_ARGS,
  API_CWD,
  HEALTH_URL,
  WEB_ARGS,
  WEB_CWD,
  WEB_URL,
  apiEnv,
  webEnv,
} from './e2e/support/stack.mjs';

const CI = Boolean(process.env.CI);

/**
 * End-to-end tests against the real stack: the Express API on 5100 with an in-memory
 * MongoDB and simulated payments, and the Vite client on 5174. Hermetic: no .env files
 * are read, and every secret is generated for this run only (see e2e/support/stack.mjs).
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // One API and one dev server serve every worker; more than two mostly adds contention.
  workers: 2,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: WEB_URL,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [
    // Resets the demo data once, so every run starts from the same seeded state.
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'desktop',
      dependencies: ['setup'],
      testIgnore: /responsive\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'phone',
      dependencies: ['setup'],
      testMatch: /responsive\.spec\.ts/,
      use: {
        browserName: 'chromium',
        userAgent: devices['Pixel 7'].userAgent,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      name: 'api',
      command: `node ${API_ARGS.join(' ')}`,
      cwd: API_CWD,
      url: HEALTH_URL,
      env: apiEnv(),
      reuseExistingServer: !CI,
      // The first run may download the MongoDB binary for the in-memory database.
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      name: 'web',
      command: `node ${WEB_ARGS.join(' ')}`,
      cwd: WEB_CWD,
      url: WEB_URL,
      env: webEnv(),
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});

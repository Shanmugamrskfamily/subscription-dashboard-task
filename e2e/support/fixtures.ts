import { test as base, expect } from '@playwright/test';

/**
 * The base test for every spec: fails a test when the page throws an uncaught error,
 * so a crash in a code path we didn't assert on still shows up.
 */
export const test = base.extend<{ pageErrors: Error[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: Error[] = [];
      page.on('pageerror', (error) => errors.push(error));
      await use(errors);
      expect(
        errors.map((e) => e.message),
        'uncaught errors in the page',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

import { expect, test as setup } from '@playwright/test';
import { ADMIN, apiLogin, apiResetDemo } from './support/api';

// A reused server may hold state from an earlier run; start every run from the seed.
setup('reset demo data', async ({ request }) => {
  await apiResetDemo(request);
  const admin = await apiLogin(request, ADMIN);
  expect(admin.user.role).toBe('admin');
});

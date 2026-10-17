import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Each file gets its own process and its own in-memory MongoDB.
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      // Never read a developer's real database or secrets during tests.
      MONGODB_URI: '',
      BCRYPT_ROUNDS: '4',
      JWT_ACCESS_SECRET: 'test-secret-that-is-definitely-longer-than-32-chars',
      PAYMENTS_MODE: 'simulated',
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      CLIENT_ORIGINS: 'http://localhost:5173',
      SEED_ON_BOOT: 'false',
      DEMO_MODE: 'true',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/seed/run.ts', 'src/types/**', 'src/docs/openapi.ts'],
      thresholds: { lines: 85, functions: 85, branches: 75, statements: 85 },
    },
  },
});

/**
 * Seeded demo accounts (see server/src/seed/seed.ts). These are test credentials
 * for reviewers, not secrets: they only exist in the demo database.
 */
export const DEMO_PASSWORD = 'Demo@12345';
export const ADMIN_PASSWORD = 'Admin@12345';

export interface DemoAccount {
  label: string;
  shows: string;
  email: string;
  password: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: 'Admin',
    shows: 'Analytics and controls',
    email: 'admin@planpilot.demo',
    password: ADMIN_PASSWORD,
  },
  {
    label: 'Pro · active',
    shows: 'Upgrade, usage, billing',
    email: 'priya@planpilot.demo',
    password: DEMO_PASSWORD,
  },
  {
    label: 'Expiring soon',
    shows: 'Renew pop-up',
    email: 'kavya@planpilot.demo',
    password: DEMO_PASSWORD,
  },
  {
    label: 'Expired plan',
    shows: 'Read-only, renewal',
    email: 'arjun@planpilot.demo',
    password: DEMO_PASSWORD,
  },
  {
    label: 'New user',
    shows: 'First purchase',
    email: 'neha@planpilot.demo',
    password: DEMO_PASSWORD,
  },
  {
    label: 'Starter at limit',
    shows: 'Upgrade pop-up',
    email: 'dev@planpilot.demo',
    password: DEMO_PASSWORD,
  },
];

export const RESTRICTED_ACCOUNTS: DemoAccount[] = [
  {
    label: 'Blocked',
    shows: 'Blocked by an admin',
    email: 'rohan@planpilot.demo',
    password: DEMO_PASSWORD,
  },
  {
    label: 'Inactive',
    shows: 'Account paused',
    email: 'sneha@planpilot.demo',
    password: DEMO_PASSWORD,
  },
  {
    label: 'Access expired',
    shows: 'Access window ended',
    email: 'vikram@planpilot.demo',
    password: DEMO_PASSWORD,
  },
];

import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the Super Admin E2E suite.
 *
 * Usage:
 *   npx playwright test e2e-tests/super-admin.spec.ts
 *
 * Environment variables:
 *   SUPER_ADMIN_BASE_URL - frontend URL (default http://localhost:3002)
 *   SUPER_ADMIN_API_URL  - backend URL (default http://localhost:3000)
 *   SUPER_ADMIN_EMAIL    - login email (default admin@abtaxi.com)
 *   SUPER_ADMIN_PASSWORD - login password (default admin123)
 */
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { outputFolder: 'playwright-report-super-admin', open: 'never' }]],
  use: {
    baseURL: process.env.SUPER_ADMIN_BASE_URL || 'http://localhost:3002',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

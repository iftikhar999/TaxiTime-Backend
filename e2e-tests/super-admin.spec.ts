import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@abtaxi.com';
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'admin123';

async function login(page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  // If already logged in, a redirect to dashboard will occur quickly.
  if (page.url().includes('/dashboard')) {
    return;
  }

  await expect(page.getByRole('heading', { name: 'Super Admin Login' })).toBeVisible();

  await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await expect(page.getByText('Total Companies')).toBeVisible();
}

async function navigateTo(page, menuLabel: string) {
  await page.getByRole('link', { name: menuLabel }).click();
}

test.describe('Super Admin E2E', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard smoke test', async ({ page }) => {
    await expect(page.getByText('Total Companies')).toBeVisible();
    await expect(page.getByText('Active Jobs')).toBeVisible();
    await expect(page.getByText('Total Revenue')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Last 30 Days' })).toBeVisible();
  });

  test('companies management smoke test', async ({ page }) => {
    await navigateTo(page, 'Companies');
    await expect(page.getByRole('heading', { name: 'Company Management' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Company' })).toBeVisible();

    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      const firstRow = rows.first();

      await expect(firstRow).toBeVisible();
      await expect(firstRow.getByText(/KYC:/i)).toBeVisible({ timeout: 5_000 });

      await firstRow.getByRole('button', { name: 'View Details' }).click();
      await expect(page.getByText('KYC Status')).toBeVisible();
      await page.getByRole('button', { name: '×' }).click();
    } else {
      test.skip('No companies available to validate table interactions');
    }
  });

  test('users management smoke test', async ({ page }) => {
    await navigateTo(page, 'Users');
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add User' })).toBeVisible();
    await expect(page.getByPlaceholder('Search users...')).toBeVisible();
    await expect(page.getByText('All Roles')).toBeVisible();
  });

  test('subscription plans smoke test', async ({ page }) => {
    await navigateTo(page, 'Subscription Plans');
    await expect(page.getByRole('heading', { name: 'Subscription Plans' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Plan' })).toBeVisible();
  });

  test('configuration smoke test', async ({ page }) => {
    await navigateTo(page, 'Master Entries');
    await expect(page.getByRole('heading', { name: 'Master Data Management' })).toBeVisible();
  });

  test('reports smoke test', async ({ page }) => {
    await navigateTo(page, 'Reports');
    await expect(page.getByRole('heading', { name: 'Reports & Analytics' })).toBeVisible();
  });

  test('payments smoke test', async ({ page }) => {
    await navigateTo(page, 'Payments');
    await expect(page.getByRole('heading', { name: 'Payment Management' })).toBeVisible();
  });

  test('settings smoke test', async ({ page }) => {
    await navigateTo(page, 'Settings');
    await expect(page.getByRole('heading', { name: 'System Settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Save.*General/i })).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import { ADMIN, gotoAndReady } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';

test.describe('Command Center villager tracker', () => {
  test.beforeEach(async ({ page }) => {
    await ensureOnPage(page, '/admin/villagers', ADMIN);
    await gotoAndReady(page, '/admin/villagers');
  });

  test('AVIL-001: tracker loads with search and register', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Villager tracker|ग्रामीण/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder(/Search name or mobile|नाम या मोबाइल|नाव किंवा मोबाइल/i)).toBeVisible();
    await expect(page.getByTestId('admin-villagers-register')).toBeVisible();
  });

  test('AVIL-002: register modal opens', async ({ page }) => {
    await page.getByTestId('admin-villagers-register').click();
    await expect(page.getByTestId('villager-form')).toBeVisible({ timeout: 10_000 });
  });
});

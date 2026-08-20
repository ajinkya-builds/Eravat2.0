import { test, expect } from '@playwright/test';
import { FIELD_STAFF, gotoAndReady } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';

test.describe('Field villager management', () => {
  test('VIL-001: home shows My Villagers for onboarders', async ({ page }) => {
    await ensureOnPage(page, '/', FIELD_STAFF);
    await gotoAndReady(page, '/');
    const tile = page.getByTestId('dashboard-my-villagers');
    await expect(tile).toBeVisible({ timeout: 30_000 });
    await expect(tile).toContainText(/My Villagers|मेरे ग्रामीण|माझे ग्रामीण/i);
  });

  test('VIL-002: my villagers list supports search and edit rows', async ({ page }) => {
    await ensureOnPage(page, '/villagers', FIELD_STAFF);
    await gotoAndReady(page, '/villagers');
    await expect(page.getByPlaceholder(/Search by name or mobile|नाम या मोबाइल|नाव किंवा मोबाइल/i)).toBeVisible({ timeout: 20_000 });
    const row = page.getByTestId('villager-row').first();
    if (await row.count()) {
      await row.click();
      await expect(page.getByTestId('villager-form')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: /Save changes|परिवर्तन|जतन/i })).toBeVisible();
    } else {
      await expect(page.locator('body')).toContainText(/not registered|पंजीकृत नहीं|नोंदवला नाही|No villagers/i);
    }
  });
});

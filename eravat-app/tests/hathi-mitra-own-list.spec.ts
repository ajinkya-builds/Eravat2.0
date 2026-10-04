import { test, expect } from '@playwright/test';
import { FIELD_STAFF, gotoAndReady } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';

test.describe('My Hathi Mitra', () => {
  test('HM-001: home shows My Hathi Mitra for roles allowed to add them', async ({ page }) => {
    await ensureOnPage(page, '/', FIELD_STAFF);
    await gotoAndReady(page, '/');
    const tile = page.getByTestId('dashboard-my-hathi-mitra');
    await expect(tile).toBeVisible({ timeout: 30_000 });
    await expect(tile).toContainText(/My Hathi Mitra|मेरे हाथी मित्र|माझे हत्ती मित्र/i);
  });

  test('HM-002: personal list is view only and searches by name or mobile', async ({ page }) => {
    await ensureOnPage(page, '/volunteers', FIELD_STAFF);
    await gotoAndReady(page, '/volunteers');
    await expect(page.getByRole('heading', { name: /My Hathi Mitra|मेरे हाथी मित्र|माझे हत्ती मित्र/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder(/Search by name or mobile|नाम या मोबाइल|नाव किंवा मोबाइल/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Save changes|परिवर्तन|जतन/i })).toHaveCount(0);
  });
});

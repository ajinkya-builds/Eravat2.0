import { test, expect } from '@playwright/test';
import { ensureOnPage } from './fixtures/auth.fixture';
import { ADMIN } from './fixtures/test-constants';

test.describe('Notification Settings – Radius Slider', () => {
  test.beforeEach(async ({ page }) => {
    // Radius UI is DB-gated to region-agnostic roles (admin enabled first).
    await ensureOnPage(page, '/settings', ADMIN);
  });

  test('Settings page renders the proximity alert radius slider', async ({ page }) => {
    await expect(page.getByTestId('language-select')).toBeVisible();
    await expect(page.locator('#radius-slider')).toBeVisible({ timeout: 10_000 });
  });

  test('Radius slider updates the displayed km value', async ({ page }) => {
    const slider = page.locator('#radius-slider');
    await slider.waitFor({ state: 'visible' });

    await slider.fill('25');
    await expect(page.locator('text=25 km').first()).toBeVisible({ timeout: 5_000 });
  });
});

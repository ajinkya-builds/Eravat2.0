import { test, expect } from '@playwright/test';
import { ensureOnPage } from './fixtures/auth.fixture';

/**
 * Runs under chromium-admin (admin storageState).
 * Radius slider is DB-gated to roles with can_configure_alert_radius (admin).
 */
test.describe('Notification Settings – Radius Slider', () => {
  test.beforeEach(async ({ page }) => {
    await ensureOnPage(page, '/settings');
    // Wait for can_configure_alert_radius RPC + bounds fetch
    await page.locator('#radius-slider').waitFor({ state: 'visible', timeout: 15_000 });
  });

  test('Settings page renders the proximity alert radius slider', async ({ page }) => {
    await expect(page.getByTestId('language-select')).toBeVisible();
    await expect(page.locator('#radius-slider')).toBeVisible();
  });

  test('Radius slider updates the displayed km value', async ({ page }) => {
    const slider = page.locator('#radius-slider');
    await slider.fill('25');
    await expect(page.locator('text=25 km').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Radius slider clamps to 1–1000 bounds from alert_radius_bounds', async ({ page }) => {
    const slider = page.locator('#radius-slider');
    const min = Number(await slider.getAttribute('min'));
    const max = Number(await slider.getAttribute('max'));
    expect(min).toBe(1);
    expect(max).toBe(1000);

    await slider.fill('1');
    await expect(page.locator('text=1 km').first()).toBeVisible({ timeout: 5_000 });

    await slider.fill('1000');
    await expect(page.locator('text=1000 km').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Radius save persists on reload', async ({ page }) => {
    const slider = page.locator('#radius-slider');
    await slider.fill('42');
    await expect(page.locator('text=42 km').first()).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1500);

    await page.reload();
    await ensureOnPage(page, '/settings');
    await page.locator('#radius-slider').waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.locator('#radius-slider')).toHaveValue('42', { timeout: 10_000 });
  });
});

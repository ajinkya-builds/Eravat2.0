import { test, expect } from '@playwright/test';
declare const process: any;

// ─────────────────────────────────────────────────────────────────────────────
// Notification Settings – E2E Tests
// Tests the /settings page proximity radius slider and Notification UI
// NOTE: These tests do not require authentication; the settings page is
// verified to be accessible via the protected route. We navigate to the
// login page and check the public-facing elements first.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Notification Settings – Radius Slider', () => {
  test('Settings page renders the proximity alert radius slider', async ({ page }) => {
    // Navigate to root — unauthenticated users should see the LoginPage
    await page.goto('/');

    // The login page should be visible
    await expect(page.locator('text=जंगली हाथी निगरानी प्रणाली (2025)')).toBeVisible({ timeout: 30000 });

    // Fill credentials for a test user (env-driven or hardcoded for CI)
    // We use the existing test credentials; if not available skip gracefully
    const phoneInput = page.getByPlaceholder('+91 98765 43210');
    const testPhone = process.env.TEST_PHONE ?? '';
    const testPassword = process.env.TEST_PASSWORD ?? '';

    if (!testPhone || !testPassword) {
      test.skip();
      return;
    }

    await phoneInput.fill(testPhone);
    await page.locator('button[type="submit"]').click();

    // After phone submit, a PIN/password step may appear
    const pinInput = page.locator('input[type="password"]').first();
    await pinInput.waitFor({ state: 'visible', timeout: 10000 });
    await pinInput.fill(testPassword);
    await page.locator('button[type="submit"]').click();

    // Wait for dashboard
    await page.waitForURL('/', { timeout: 20000 });

    // Navigate to settings
    await page.goto('/settings');

    // The proximity alert radius section must be visible
    await expect(page.locator('text=Proximity Alert Radius')).toBeVisible({ timeout: 10000 });

    // The slider element must exist with the correct id
    const slider = page.locator('#radius-slider');
    await expect(slider).toBeVisible();

    // Default value should be within 1–100 range
    const sliderValue = await slider.inputValue();
    const numVal = Number(sliderValue);
    expect(numVal).toBeGreaterThanOrEqual(1);
    expect(numVal).toBeLessThanOrEqual(100);
  });

  test('Changing the radius slider updates the displayed numeric value', async ({ page }) => {
    await page.goto('/');
    const testPhone = process.env.TEST_PHONE ?? '';
    const testPassword = process.env.TEST_PASSWORD ?? '';
    if (!testPhone || !testPassword) { test.skip(); return; }

    await page.getByPlaceholder('+91 98765 43210').fill(testPhone);
    await page.locator('button[type="submit"]').click();
    const pinInput = page.locator('input[type="password"]').first();
    await pinInput.waitFor({ state: 'visible', timeout: 10000 });
    await pinInput.fill(testPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('/', { timeout: 20000 });

    await page.goto('/settings');
    await expect(page.locator('#radius-slider')).toBeVisible({ timeout: 10000 });

    // Set the slider to value 50 via fill
    const slider = page.locator('#radius-slider');
    await slider.fill('50');
    await slider.dispatchEvent('input');

    // The aria-label number input should reflect the new value
    const numericInput = page.locator('input[aria-label="Alert radius value"]');
    await expect(numericInput).toHaveValue('50');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Activity History – E2E Tests
// Tests the /history page renders and shows the source badge
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Activity History – Source Badges', () => {
  test('History page loads and shows Territory or Radius badges when activities exist', async ({ page }) => {
    await page.goto('/');
    const testPhone = process.env.TEST_PHONE ?? '';
    const testPassword = process.env.TEST_PASSWORD ?? '';
    if (!testPhone || !testPassword) { test.skip(); return; }

    await page.getByPlaceholder('+91 98765 43210').fill(testPhone);
    await page.locator('button[type="submit"]').click();
    const pinInput = page.locator('input[type="password"]').first();
    await pinInput.waitFor({ state: 'visible', timeout: 10000 });
    await pinInput.fill(testPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('/', { timeout: 20000 });

    await page.goto('/history');

    // Heading must be visible
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });

    // Either "No activities" empty state OR at least one item with a badge
    const emptyState = page.locator('text=/No Activity|No activity/i');
    const territoryBadge = page.locator('text=Territory').first();
    const radiusBadge = page.locator('text=Radius').first();

    const hasEmpty    = await emptyState.isVisible().catch(() => false);
    const hasTerritory = await territoryBadge.isVisible().catch(() => false);
    const hasRadius   = await radiusBadge.isVisible().catch(() => false);

    // At least one of these must be true
    expect(hasEmpty || hasTerritory || hasRadius).toBe(true);
  });
});

import { test, expect } from '@playwright/test';
import { ADMIN, gotoAndReady } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';

test.describe('Privacy & Security Module', () => {

    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/privacy', ADMIN);
        await gotoAndReady(page, '/privacy');
    });

    test('PRIV-001: Privacy page loads', async ({ page }) => {
        await expect(page.locator('text=/Privacy|Security|सुरक्षा/i').first()).toBeVisible();
    });

    test('PRIV-006: Sign out from all devices is not shown', async ({ page }) => {
        await expect(page.getByText(/Sign out from all devices/i)).toHaveCount(0);
        await expect(page.getByText(/Coming soon — use Profile/i)).toHaveCount(0);
    });
});

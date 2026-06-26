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

    test('PRIV-006: Sign out all devices button visible', async ({ page }) => {
        const signOutBtn = page.locator('button:has(.lucide-log-out)').or(
            page.locator('button').filter({ hasText: /Sign out|sign out|साइन आउट/i })
        ).first();
        await expect(signOutBtn).toBeVisible({ timeout: 10_000 });
    });
});

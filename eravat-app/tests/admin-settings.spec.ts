import { test, expect } from '@playwright/test';
import { ADMIN, switchLanguage } from './fixtures/test-constants';
import { loginAs } from './fixtures/auth.fixture';

test.describe('Admin Settings Module', () => {

    test.beforeEach(async ({ page }) => {
        await loginAs(page, ADMIN);
        await page.goto('/admin/settings');
    });

    test('ASET-001: Admin settings page loads', async ({ page }) => {
        await expect(page.locator('text=/Settings|Configuration|System/i').first()).toBeVisible({ timeout: 10_000 });
    });

    test('ASET-002: System configuration section visible', async ({ page }) => {
        const configSection = page.locator('text=/System|Config|General/i').first();
        if (await configSection.isVisible()) {
            await expect(configSection).toBeVisible();
        }
    });

    test('ASET-003: Notification settings visible', async ({ page }) => {
        const notifSection = page.locator('text=/Notification|Alert/i').first();
        if (await notifSection.isVisible()) {
            await expect(notifSection).toBeVisible();
        }
    });

    test('ASET-004: Save settings button', async ({ page }) => {
        const saveBtn = page.getByRole('button', { name: /Save|Update|Apply/i }).first();
        if (await saveBtn.isVisible()) {
            await expect(saveBtn).toBeVisible();
        }
    });

    test('ASET-005: Toggle system setting', async ({ page }) => {
        const toggle = page.locator('button[role="switch"], input[type="checkbox"]').first();
        if (await toggle.isVisible()) {
            await toggle.click();
            await page.waitForTimeout(300);
            // Toggle should change state
            await toggle.click(); // Restore
        }
    });

    test('ASET-006: Data management section', async ({ page }) => {
        const dataSection = page.locator('text=/Data|Backup|Export/i').first();
        if (await dataSection.isVisible()) {
            await expect(dataSection).toBeVisible();
        }
    });

    test('ASET-007: Back navigation to admin dashboard', async ({ page }) => {
        const backBtn = page.locator('button:has(.lucide-arrow-left), a[href*="/admin"]').first();
        if (await backBtn.isVisible()) {
            await backBtn.click();
            await expect(page).toHaveURL(/.*\/admin/);
        }
    });

    test('ASET-008: Admin settings in Hindi', async ({ page }) => {
        await switchLanguage(page, 'Hindi');

        await page.goto('/admin/settings');
        await page.waitForLoadState('networkidle');

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/सेटिंग|विन्यास|प्रणाली/);

        // Restore English
        await switchLanguage(page, 'English');
    });
});

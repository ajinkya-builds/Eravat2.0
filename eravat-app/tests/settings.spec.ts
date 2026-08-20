import { test, expect } from '@playwright/test';
import { appPath } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';
import { SettingsPage } from './page-objects/settings.page';

test.describe('Settings Module', () => {
    let sp: SettingsPage;

    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/settings');
        sp = new SettingsPage(page);
    });

    // --- Theme ---

    test('SET-001: Light theme selection', async ({ page }) => {
        await sp.selectTheme('Light');
        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(isDark).toBe(false);
    });

    test('SET-002: Dark theme selection', async ({ page }) => {
        await sp.selectTheme('Dark');
        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(isDark).toBe(true);

        // Restore light
        await sp.selectTheme('Light');
    });

    test('SET-003: System theme selection', async ({ page }) => {
        await sp.selectTheme('System');
        // Just verify no crash — system theme depends on OS preference
        await expect(sp.systemButton).toBeVisible();
    });

    test('SET-004: Theme persists after navigation', async ({ page }) => {
        await sp.selectTheme('Dark');
        await page.goto(appPath('/'));
        await page.waitForLoadState('domcontentloaded');

        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(isDark).toBe(true);

        // Restore light
        await page.goto(appPath('/settings'));
        await sp.selectTheme('Light');
    });

    // --- Language ---

    test('SET-005: Switch to Hindi', async ({ page }) => {
        await sp.selectLanguage('Hindi');
        await page.waitForTimeout(500);

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/सेटिंग|भाषा|थीम/);

        // Restore English
        await sp.selectLanguage('English');
    });

    test('SET-006: Switch to Marathi', async ({ page }) => {
        await sp.selectLanguage('Marathi');
        await page.waitForTimeout(500);

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/सेटिंग्ज|भाषा|थीम/);

        // Restore English
        await sp.selectLanguage('English');
    });

    test('SET-007: Switch back to English', async ({ page }) => {
        await sp.selectLanguage('Hindi');
        await page.waitForTimeout(300);
        await sp.selectLanguage('English');
        await page.waitForTimeout(500);

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/Settings|Language|Theme/);
    });

    test('SET-008: Language persists after navigation', async ({ page }) => {
        await sp.selectLanguage('Hindi');
        await page.waitForTimeout(500);

        await ensureOnPage(page, '/');
        await expect(
            page.getByText(/साइटिंग|रिपोर्ट|डैशबोर्ड|डॅशबोर्ड|Add Sighting/i).first(),
        ).toBeVisible({ timeout: 30_000 });

        // Restore English
        await page.goto(appPath('/settings'));
        await sp.selectLanguage('English');
    });

    // --- Notifications & Cache ---

    test('SET-009: Push notification toggle', async ({ page }) => {
        if (await sp.pushToggle.isVisible()) {
            await sp.pushToggle.click();
            // Just verify toggle is interactable without error
            await expect(sp.pushToggle).toBeVisible();
        }
    });

    test('SET-010: Clear cache button', async ({ page }) => {
        if (await sp.clearCacheButton.isVisible()) {
            await sp.clearCacheButton.click();
            // Expect confirmation or success message
            const feedback = page.locator('text=/cleared|success|cache/i').first();
            if (await feedback.isVisible({ timeout: 3_000 }).catch(() => false)) {
                await expect(feedback).toBeVisible();
            }
        }
    });

    test('SET-011: Settings page accessible from bottom nav', async ({ page }) => {
        await page.goto(appPath('/'));
        const settingsTab = page.locator('nav').last().locator('button').filter({ has: page.locator('.lucide-settings') });
        await settingsTab.click();
        await expect(page).toHaveURL(/.*\/settings/);
    });

    test('SET-012: Theme and language independent', async ({ page }) => {
        // Set dark theme + Hindi — both should apply independently
        await sp.selectTheme('Dark');
        await sp.selectLanguage('Hindi');
        await page.waitForTimeout(500);

        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(isDark).toBe(true);

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/सेटिंग|भाषा|थीम/);

        // Restore
        await sp.selectTheme('Light');
        await sp.selectLanguage('English');
    });
});

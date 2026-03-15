import { test, expect } from '@playwright/test';
import { FIELD_STAFF } from './fixtures/test-constants';
import { loginAs } from './fixtures/auth.fixture';

test.describe('Theme Module', () => {
    // Use icon-based selectors — locale-independent
    const lightBtn = (page: import('@playwright/test').Page) => page.locator('button:has(.lucide-sun)').first();
    const darkBtn = (page: import('@playwright/test').Page) => page.locator('button:has(.lucide-moon)').first();
    const systemBtn = (page: import('@playwright/test').Page) => page.locator('button:has(.lucide-monitor)').first();

    test.beforeEach(async ({ page }) => {
        await loginAs(page, FIELD_STAFF);
        await page.goto('/settings');
    });

    test.afterEach(async ({ page }) => {
        await page.goto('/settings');
        await lightBtn(page).click();
    });

    test('THM-001: Dark theme applies dark class to html', async ({ page }) => {
        await darkBtn(page).click();
        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(isDark).toBe(true);
    });

    test('THM-002: Light theme removes dark class', async ({ page }) => {
        await darkBtn(page).click();
        await lightBtn(page).click();
        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(isDark).toBe(false);
    });

    test('THM-003: Theme persists across page navigation', async ({ page }) => {
        await darkBtn(page).click();

        await page.goto('/');
        await page.waitForLoadState('networkidle');
        let isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(isDark).toBe(true);

        await page.goto('/profile');
        await page.waitForLoadState('networkidle');
        isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(isDark).toBe(true);
    });

    test('THM-004: Theme persists after page reload', async ({ page }) => {
        await darkBtn(page).click();
        await page.reload();
        await page.waitForLoadState('networkidle');
        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(isDark).toBe(true);
    });

    test('THM-005: System theme respects OS preference', async ({ page }) => {
        await systemBtn(page).click();
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.waitForTimeout(500);
        let isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(isDark).toBe(true);

        await page.emulateMedia({ colorScheme: 'light' });
        await page.waitForTimeout(500);
        isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(isDark).toBe(false);
    });
});

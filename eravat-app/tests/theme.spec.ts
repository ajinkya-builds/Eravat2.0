import { test, expect } from '@playwright/test';
import { ensureOnPage } from './fixtures/auth.fixture';
import { gotoAndReady } from './fixtures/test-constants';

test.describe('Theme Module', () => {
    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/settings');
        await expect(page.getByTestId('theme-light')).toBeVisible({ timeout: 30_000 });
    });

    test('THM-001: Dark theme applies dark class to html', async ({ page }) => {
        await page.getByTestId('theme-dark').click();
        await expect.poll(() =>
            page.evaluate(() => document.documentElement.classList.contains('dark')),
        ).toBe(true);
    });

    test('THM-002: Light theme removes dark class', async ({ page }) => {
        await page.getByTestId('theme-dark').click();
        await page.getByTestId('theme-light').click();
        await expect.poll(() =>
            page.evaluate(() => document.documentElement.classList.contains('dark')),
        ).toBe(false);
    });

    test('THM-003: Theme persists across page navigation', async ({ page }) => {
        await page.getByTestId('theme-dark').click();
        await gotoAndReady(page, '/');
        expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);

        await gotoAndReady(page, '/profile');
        expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
    });

    test('THM-004: Theme persists after page reload', async ({ page }) => {
        await page.getByTestId('theme-dark').click();
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
    });

    test('THM-005: System theme respects OS preference', async ({ page }) => {
        await page.getByTestId('theme-system').click();
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);

        await page.emulateMedia({ colorScheme: 'light' });
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);
    });
});

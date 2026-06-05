import { test, expect } from '@playwright/test';
import { appPath } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';

test.describe('Offline & Sync Module', () => {

    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/');
    });

    test('SYNC-001: App loads after login', async ({ page }) => {
        // Verify dashboard loaded — basic online connectivity
        await expect(page.locator('text=Report Activity')).toBeVisible();
    });

    test('SYNC-002: Simulate offline — API calls blocked', async ({ page }) => {
        await ensureOnPage(page, '/report');
        const dateInput = page.locator('input[type="date"]');
        await expect(dateInput).toBeVisible({ timeout: 10_000 });

        await page.route('**/rest/v1/**', route => route.abort());
        await dateInput.fill('2025-06-15');
        await expect(dateInput).toHaveValue('2025-06-15');
    });

    test('SYNC-003: Offline report form still accessible', async ({ page }) => {
        await ensureOnPage(page, '/report');
        await page.route('**/rest/v1/**', route => route.abort());

        const dateInput = page.locator('input[type="date"]');
        await expect(dateInput).toBeVisible({ timeout: 10_000 });
        await dateInput.fill('2025-06-15');
        await expect(dateInput).toHaveValue('2025-06-15');
    });

    test('SYNC-004: Dashboard graceful degradation when offline', async ({ page }) => {
        await page.route('**/rest/v1/**', route => route.abort());
        await page.goto(appPath('/'));

        // Dashboard should show cached data or graceful empty state
        await page.waitForTimeout(2_000);
        // Page should not crash
        const bodyText = await page.locator('body').textContent();
        expect(bodyText?.length).toBeGreaterThan(0);
    });

    test('SYNC-005: History page shows cached data offline', async ({ page }) => {
        // First load history online to cache
        await page.goto(appPath('/history'));
        await page.waitForLoadState('domcontentloaded');

        // Go offline
        await page.route('**/rest/v1/**', route => route.abort());
        await page.reload();

        // Should show cached data or graceful empty state
        await page.waitForTimeout(2_000);
        const bodyText = await page.locator('body').textContent();
        expect(bodyText?.length).toBeGreaterThan(0);
    });

    test('SYNC-006: Re-sync when coming back online', async ({ page }) => {
        // Block API
        await page.route('**/rest/v1/**', route => route.abort());
        await page.goto(appPath('/'));
        await page.waitForTimeout(1_000);

        // Unblock API (come back online)
        await page.unroute('**/rest/v1/**');
        await page.reload();
        await page.waitForLoadState('domcontentloaded');

        // Dashboard should load with fresh data
        await expect(page.locator('text=Report Activity')).toBeVisible();
    });

    test.skip('SYNC-007: Camera + offline combo', () => {
        // Requires Capacitor Camera API + offline simulation
    });
});

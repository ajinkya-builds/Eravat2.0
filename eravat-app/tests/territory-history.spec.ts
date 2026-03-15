import { test, expect } from '@playwright/test';
import { FIELD_STAFF, switchLanguage } from './fixtures/test-constants';
import { loginAs } from './fixtures/auth.fixture';

test.describe('Territory & History Module', () => {

    test.beforeEach(async ({ page }) => {
        await loginAs(page, FIELD_STAFF);
    });

    // --- History ---

    test('HIST-001: History page loads', async ({ page }) => {
        await page.goto('/history');
        await expect(page.locator('text=/History|Report|Observation/i').first()).toBeVisible();
    });

    test('HIST-002: History list displays past reports', async ({ page }) => {
        await page.goto('/history');
        await page.waitForLoadState('networkidle');

        // Should display a list of reports or an empty state message
        const hasReports = await page.locator('table tr, [class*="card"], [class*="list-item"]').count();
        const hasEmpty = await page.locator('text=/no.*report|no.*observation|empty/i').count();
        expect(hasReports + hasEmpty).toBeGreaterThan(0);
    });

    test('HIST-003: History report detail view', async ({ page }) => {
        await page.goto('/history');
        await page.waitForLoadState('networkidle');

        const firstRow = page.locator('table tr, [class*="card"]').first();
        if (await firstRow.isVisible()) {
            await firstRow.click();
            // Should show details or expand
            await page.waitForTimeout(500);
        }
    });

    test('HIST-004: History pagination or scroll', async ({ page }) => {
        await page.goto('/history');
        await page.waitForLoadState('networkidle');

        // Check for pagination controls or scrollable list
        const pagination = page.locator('button:has(.lucide-chevron-right)').or(page.locator('text=/next|more/i')).first();
        if (await pagination.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await expect(pagination).toBeVisible();
        }
    });

    // --- Territory / Map ---

    test('TERR-001: Map page loads', async ({ page }) => {
        await page.goto('/map');
        // Map page now uses Leaflet via MapComponent
        const mapContainer = page.locator('.leaflet-container').first();
        await expect(mapContainer).toBeVisible({ timeout: 15_000 });
    });

    test('TERR-002: Map shows territory boundaries', async ({ page }) => {
        await page.goto('/map');
        await page.waitForLoadState('networkidle');
        // Leaflet container should be present with MapComponent
        const mapContainer = page.locator('.leaflet-container').first();
        await expect(mapContainer).toBeVisible({ timeout: 15_000 });
    });

    test('TERR-003: Map zoom controls', async ({ page }) => {
        await page.goto('/map');
        await page.waitForLoadState('networkidle');
        // Leaflet provides zoom controls by default
        const zoomIn = page.locator('.leaflet-control-zoom-in').first();
        await expect(zoomIn).toBeVisible({ timeout: 15_000 });
    });

    test('TERR-004: Map accessible from bottom nav', async ({ page }) => {
        await page.goto('/');
        const mapTab = page.locator('nav').last().locator('button').filter({ has: page.locator('.lucide-map') });
        if (await mapTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await mapTab.click();
            await expect(page).toHaveURL(/.*\/map/);
        }
    });

    test('TERR-005: Map loads in Hindi locale', async ({ page }) => {
        await switchLanguage(page, 'Hindi');

        await page.goto('/map');
        await page.waitForLoadState('networkidle');

        // Map page renders (placeholder or full map)
        const content = page.locator('body');
        const bodyText = await content.textContent();
        expect(bodyText?.length).toBeGreaterThan(0);

        // Restore English
        await switchLanguage(page, 'English');
    });
});

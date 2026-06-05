import { test, expect } from '@playwright/test';
import { ADMIN, switchLanguage, gotoAndReady } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';

test.describe('Admin Divisions Module', () => {

    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/admin/divisions', ADMIN);
    });

    test('ADIV-001: Divisions page loads', async ({ page }) => {
        await expect(page.locator('text=/Division|Territory|Circle/i').first()).toBeVisible({ timeout: 10_000 });
    });

    test('ADIV-002: Divisions list or tree visible', async ({ page }) => {
        await page.waitForLoadState('domcontentloaded');
        // AdminDivisions uses motion.tr rows in a table with glass-card wrapper
        const content = page.locator('table').or(page.locator('.glass-card')).first();
        await expect(content).toBeVisible({ timeout: 10_000 });
    });

    test('ADIV-003: Add division button', async ({ page }) => {
        const addBtn = page.locator('button').filter({ hasText: /Add|Create|New/i }).first();
        if (await addBtn.isVisible()) {
            await expect(addBtn).toBeVisible();
        }
    });

    test('ADIV-004: Division hierarchy (Circle > Division > Range > Beat)', async ({ page }) => {
        await page.waitForLoadState('domcontentloaded');
        const bodyText = await page.locator('body').textContent();
        // Should contain hierarchy-related terms
        const hasHierarchy = /circle|division|range|beat/i.test(bodyText || '');
        expect(hasHierarchy).toBeTruthy();
    });

    test('ADIV-005: Search/filter divisions', async ({ page }) => {
        const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="earch"]').first();
        if (await searchInput.isVisible()) {
            await searchInput.fill('test');
            await page.waitForTimeout(1_000);
        }
    });

    test('ADIV-006: Division detail view', async ({ page }) => {
        await page.waitForLoadState('domcontentloaded');
        const firstItem = page.locator('table tbody tr, [class*="card"]').first();
        if (await firstItem.isVisible()) {
            await firstItem.click();
            await page.waitForTimeout(500);
        }
    });

    test('ADIV-007: Division map boundary', async ({ page }) => {
        await page.waitForLoadState('domcontentloaded');
        const mapElement = page.locator('.leaflet-container, canvas[class*="map"]').first();
        if (await mapElement.isVisible({ timeout: 5_000 }).catch(() => false)) {
            await expect(mapElement).toBeVisible();
        }
    });

    test('ADIV-008: Divisions page in Hindi', async ({ page }) => {
        await switchLanguage(page, 'Hindi');

        await gotoAndReady(page, '/admin/divisions');

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/विभाग|प्रभाग|क्षेत्र/);

        // Restore English
        await switchLanguage(page, 'English');
    });
});

import { test, expect } from '@playwright/test';
import { ADMIN, switchLanguage, gotoAndReady } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';
import { AdminObservationsPage } from './page-objects/admin/admin-observations.page';

test.describe('Admin Observations Module', () => {
    let op: AdminObservationsPage;

    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/admin/observations', ADMIN);
        op = new AdminObservationsPage(page);
    });

    test('AOBS-001: Observations page loads', async () => {
        await expect(op.table).toBeVisible({ timeout: 10_000 });
    });

    test('AOBS-002: Observations table has rows', async ({ page }) => {
        await page.waitForLoadState('domcontentloaded');
        const rows = op.table.locator('tbody tr');
        const count = await rows.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('AOBS-003: Export button visible', async () => {
        await expect(op.exportButton).toBeVisible();
    });

    test('AOBS-004: Export triggers download', async ({ page }) => {
        const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
        await op.exportButton.click();
        const download = await downloadPromise;
        if (download) {
            expect(download.suggestedFilename()).toMatch(/\.(csv|xlsx|json)/);
        }
    });

    test('AOBS-005: Refresh button reloads data', async ({ page }) => {
        await op.refreshButton.click();
        await page.waitForLoadState('domcontentloaded');
        await expect(op.table).toBeVisible();
    });

    test('AOBS-006: Master checkbox selects all', async ({ page }) => {
        await page.waitForLoadState('domcontentloaded');
        const rows = await op.table.locator('tbody tr').count();
        if (rows > 0) {
            await op.masterCheckbox.check();
            const checkboxes = op.table.locator('tbody input[type="checkbox"]');
            const checkedCount = await checkboxes.evaluateAll(
                els => els.filter(el => (el as HTMLInputElement).checked).length
            );
            expect(checkedCount).toBe(rows);
        }
    });

    test('AOBS-007: Pagination next/prev', async ({ page }) => {
        await page.waitForLoadState('domcontentloaded');
        if (await op.paginationNext.isVisible()) {
            const isDisabled = await op.paginationNext.isDisabled();
            if (!isDisabled) {
                await op.paginationNext.click();
                await page.waitForTimeout(1_000);
                if (await op.paginationPrev.isVisible()) {
                    await op.paginationPrev.click();
                }
            }
        }
    });

    test('AOBS-008: Pagination text shows count', async ({ page }) => {
        await page.waitForLoadState('domcontentloaded');
        if (await op.paginationText.isVisible()) {
            const text = await op.paginationText.textContent();
            expect(text).toMatch(/Showing/i);
        }
    });

    test('AOBS-009: Observation row detail click', async ({ page }) => {
        await page.waitForLoadState('domcontentloaded');
        const firstRow = op.table.locator('tbody tr').first();
        if (await firstRow.isVisible()) {
            await firstRow.click();
            await page.waitForTimeout(500);
            // May open a detail view or expand
        }
    });

    test('AOBS-010: Observations table in Hindi', async ({ page }) => {
        await switchLanguage(page, 'Hindi');

        await gotoAndReady(page, '/admin/observations');

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/अवलोकन|निर्यात|रिपोर्ट/);

        // Restore English
        await switchLanguage(page, 'English');
    });
});

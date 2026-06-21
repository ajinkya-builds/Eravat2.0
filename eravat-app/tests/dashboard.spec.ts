import { test, expect } from '@playwright/test';
import { ADMIN, switchLanguage, gotoAndReady } from './fixtures/test-constants';
import { ensureOnPage, loginAs } from './fixtures/auth.fixture';

test.describe('Dashboard Module - Field Staff', () => {

    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/');
    });

    test('DASH-001: Dashboard loads with greeting', async ({ page }) => {
        await expect(page.locator('h1').first()).toBeVisible();
        await expect(page.locator('img[alt="ERAVAT Logo"]').first()).toBeVisible();
    });

    test('DASH-002: Report Activity quick action', async ({ page }) => {
        await page.click('button:has(.lucide-activity)');
        await expect(page).toHaveURL(/.*\/report/);
    });

    test('DASH-003: View Profile quick action', async ({ page }) => {
        await page.click('button:has(.lucide-user)');
        await expect(page).toHaveURL(/.*\/profile/);
    });

    test('DASH-004: View History quick action', async ({ page }) => {
        await page.click('button:has(.lucide-history)');
        await expect(page).toHaveURL(/.*\/history/);
    });

    test('DASH-006: Command Center hidden for field staff', async ({ page }) => {
        const commandCenterIcon = page.locator('.lucide-shield-check');
        await expect(commandCenterIcon).toHaveCount(0);
    });

    test.skip('DASH-008: Pending sync count badge visible', async () => {
        // Requires IndexedDB manipulation to stage pending reports
        // Cannot reliably test without offline-first setup
    });

    test.skip('DASH-009: Sync triggers on reconnect', async () => {
        // Requires IndexedDB manipulation + network toggling
    });

    test('DASH-010: No pending reports shows clean state', async ({ page }) => {
        // Verify no sync badge or pending indicator visible on fresh login
        const syncBadge = page.locator('text=/pending/i');
        await expect(syncBadge).toHaveCount(0);
    });

    test('DASH-011: Dashboard greeting in Hindi', async ({ page }) => {
        // Switch to Hindi first
        await switchLanguage(page, 'Hindi');

        // Go back to dashboard
        await gotoAndReady(page, '/');

        // Verify Hindi text is present
        await expect(page.locator('h1').first()).toBeVisible();
        // Check for Hindi greeting or action card text
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/गतिविधि|रिपोर्ट|डैशबोर्ड/);

        // Restore English
        await switchLanguage(page, 'English');
    });

    test('DASH-012: Dashboard greeting in Marathi', async ({ page }) => {
        await switchLanguage(page, 'Marathi');

        await gotoAndReady(page, '/');

        await expect(page.locator('h1').first()).toBeVisible();
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/क्रियाकलाप|अहवाल|डॅशबोर्ड/);

        // Restore English
        await switchLanguage(page, 'English');
    });
});

test.describe('Dashboard Module - Admin Tests', () => {

    test.beforeEach(async ({ page }) => {
        await loginAs(page, ADMIN);
    });

    test('DASH-005 & DASH-007: Command Center visible for admin and navigates', async ({ page }) => {
        const commandCenterIcon = page.locator('.lucide-shield-check');
        await expect(commandCenterIcon).toBeVisible();

        await page.click('button:has(.lucide-shield-check)');
        await expect(page).toHaveURL(/.*\/admin/);
    });
});


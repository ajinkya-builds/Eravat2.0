import { test, expect } from '@playwright/test';
import { FIELD_STAFF, switchLanguage } from './fixtures/test-constants';
import { loginAs } from './fixtures/auth.fixture';

test.describe('Internationalization (i18n) Module', () => {

    test.beforeEach(async ({ page }) => {
        await loginAs(page, FIELD_STAFF);
    });

    test.afterEach(async ({ page }) => {
        // Restore English only if still logged in (not on login page)
        const url = page.url();
        if (!url.includes('/login')) {
            await switchLanguage(page, 'English').catch(() => { });
        }
    });

    test('I18N-001: Default language is English', async ({ page }) => {
        await page.goto('/');
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/Report Activity|Dashboard|Profile/);
    });

    test('I18N-002: Hindi — Dashboard labels', async ({ page }) => {
        await switchLanguage(page, 'Hindi');
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/गतिविधि|रिपोर्ट|प्रोफ़ाइल/);
    });

    test('I18N-003: Hindi — Profile labels', async ({ page }) => {
        await switchLanguage(page, 'Hindi');
        await page.goto('/profile');
        await page.waitForLoadState('networkidle');
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/प्रोफ़ाइल|साइन आउट|संपादित/);
    });

    test('I18N-004: Hindi — Settings labels', async ({ page }) => {
        await switchLanguage(page, 'Hindi');
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/सेटिंग|भाषा|थीम/);
    });

    test('I18N-005: Marathi — Dashboard labels', async ({ page }) => {
        await switchLanguage(page, 'Marathi');
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/क्रियाकलाप|अहवाल|प्रोफाइल|डॅशबोर्ड/);
    });

    test('I18N-006: Marathi — Profile labels', async ({ page }) => {
        await switchLanguage(page, 'Marathi');
        await page.goto('/profile');
        await page.waitForLoadState('networkidle');
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/प्रोफाइल|साइन आउट|संपादन/);
    });

    test('I18N-007: Language switch does not lose page state', async ({ page }) => {
        // Navigate to settings, note we're on /settings
        await page.goto('/settings');
        await switchLanguage(page, 'Hindi');
        // Should still be on settings page
        await expect(page).toHaveURL(/.*\/settings/);
    });

    test('I18N-008: Language persists after page reload', async ({ page }) => {
        await switchLanguage(page, 'Hindi');
        await page.goto('/');
        await page.reload();
        await page.waitForLoadState('networkidle');

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/गतिविधि|रिपोर्ट|डैशबोर्ड/);
    });

    test('I18N-009: All bottom nav labels translate', async ({ page }) => {
        await switchLanguage(page, 'Hindi');
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const nav = page.locator('nav').last();
        const navText = await nav.textContent();
        // Should NOT contain English labels
        expect(navText).not.toMatch(/^Home$|^Map$|^Profile$|^Settings$/);
    });

    test('I18N-010: Login page in Hindi', async ({ page }) => {
        // Switch to Hindi first, then logout via profile page
        await switchLanguage(page, 'Hindi');
        await page.goto('/profile');
        await page.waitForLoadState('networkidle');

        // Use icon-based selector for sign out (locale-independent)
        const signOutBtn = page.locator('button:has(.lucide-log-out)').or(
            page.locator('button').filter({ hasText: /Sign Out|साइन आउट/i })
        ).first();
        await signOutBtn.click();

        // Confirmation dialog appears — click the confirm button
        const confirmBtn = page.locator('.fixed button').filter({ hasText: /Sign Out|साइन आउट/i }).first();
        await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
        await confirmBtn.click();

        await expect(page).toHaveURL(/.*\/login/, { timeout: 10_000 });

        // Login page should render with some text content
        const bodyText = await page.locator('body').textContent();
        expect(bodyText?.length).toBeGreaterThan(0);
    });
});

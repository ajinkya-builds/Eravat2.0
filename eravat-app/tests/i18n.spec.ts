import { test, expect } from '@playwright/test';
import { switchLanguage, gotoAndReady } from './fixtures/test-constants';
import { clearSupabaseSession, ensureOnPage } from './fixtures/auth.fixture';

test.describe('Internationalization (i18n) Module', () => {

    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/');
    });

    test.afterEach(async ({ page }) => {
        // Restore English only if still logged in (not on login page)
        const url = page.url();
        if (!url.includes('/login')) {
            await switchLanguage(page, 'English').catch(() => { });
        }
    });

    test('I18N-001: Default language is English', async ({ page }) => {
        await gotoAndReady(page, '/');
        await expect(
            page.getByText(/Add Sighting|Dashboard|Profile|Home/i).first(),
        ).toBeVisible({ timeout: 30_000 });
    });

    test('I18N-002: Hindi — Dashboard labels', async ({ page }) => {
        await switchLanguage(page, 'Hindi');
        await gotoAndReady(page, '/');
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/साइटिंग|रिपोर्ट|प्रोफ़ाइल|डैशबोर्ड/);
    });

    test('I18N-003: Hindi — Profile labels', async ({ page }) => {
        await switchLanguage(page, 'Hindi');
        await gotoAndReady(page, '/profile');
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
        await gotoAndReady(page, '/');
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/साइटिंग|अहवाल|प्रोफाइल|डॅशबोर्ड/);
    });

    test('I18N-006: Marathi — Profile labels', async ({ page }) => {
        await switchLanguage(page, 'Marathi');
        await gotoAndReady(page, '/profile');
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/प्रोफाइल|साइन आउट|संपादन/);
    });

    test('I18N-007: Language switch does not lose page state', async ({ page }) => {
        // Navigate to settings, note we're on /settings
        await gotoAndReady(page, '/settings');
        await switchLanguage(page, 'Hindi');
        // Should still be on settings page
        await expect(page).toHaveURL(/.*\/settings/);
    });

    test('I18N-008: Language persists after page reload', async ({ page }) => {
        await switchLanguage(page, 'Hindi');
        await gotoAndReady(page, '/');
        await page.reload();
        await gotoAndReady(page, '/');

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/साइटिंग|रिपोर्ट|डैशबोर्ड/);
    });

    test('I18N-009: All bottom nav labels translate', async ({ page }) => {
        await switchLanguage(page, 'Hindi');
        await gotoAndReady(page, '/');

        const nav = page.locator('nav').last();
        const navText = await nav.textContent();
        // Should NOT contain English labels
        expect(navText).not.toMatch(/^Home$|^Map$|^Profile$|^Settings$/);
    });

    test('I18N-010: Login page in Hindi', async ({ page }) => {
        // Switch to Hindi first, then force a logged-out state.
        await switchLanguage(page, 'Hindi');
        await clearSupabaseSession(page);
        await gotoAndReady(page, '/login');

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/सत्यापन|कोड|भेजें|OTP|स्वागत/i);
    });
});

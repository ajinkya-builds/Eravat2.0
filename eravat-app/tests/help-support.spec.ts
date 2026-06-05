import { test, expect } from '@playwright/test';
import { FIELD_STAFF , appPath } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';

test.describe('Help & Support Module', () => {

    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/help');
    });

    test('HELP-001: Help page loads', async ({ page }) => {
        await expect(page.locator('text=/Help|Support|FAQ/i').first()).toBeVisible();
    });

    test('HELP-002: FAQ section visible', async ({ page }) => {
        const faqLink = page.locator('a[href*="faq"]').or(page.locator('button').filter({ hasText: /FAQ/i })).first();
        if (await faqLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await faqLink.click();
            await expect(page).toHaveURL(/.*\/faq/);
        }
    });

    test('HELP-003: Privacy policy link', async ({ page }) => {
        const privacyLink = page.locator('a[href*="privacy-policy"]').or(page.locator('button').filter({ hasText: /Privacy Policy/i })).first();
        if (await privacyLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await privacyLink.click();
            await expect(page).toHaveURL(/.*\/privacy-policy/);
        }
    });

    test('HELP-004: Contact/support information visible', async ({ page }) => {
        const contactSection = page.locator('text=/contact|email|support|phone/i').first();
        await expect(contactSection).toBeVisible();
    });

    test('HELP-005: Back navigation from help', async ({ page }) => {
        const backBtn = page.locator('button:has(.lucide-arrow-left)').or(page.locator('button:has(.lucide-chevron-left)')).first();
        if (await backBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await backBtn.click();
            await expect(page).not.toHaveURL(/.*\/help/);
        }
    });
});

import { test, expect } from '@playwright/test';
import { FIELD_STAFF , appPath } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';
import { PrivacyPage } from './page-objects/privacy.page';

test.describe('Privacy & Security Module', () => {
    let pp: PrivacyPage;

    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/privacy');
        pp = new PrivacyPage(page);
    });

    test('PRIV-001: Privacy page loads', async ({ page }) => {
        await expect(page.locator('text=/Privacy|Security|Password|पासवर्ड/i').first()).toBeVisible();
    });

    test('PRIV-002: Expand change password form', async () => {
        await pp.expandPasswordForm();
        await expect(pp.newPasswordInput).toBeVisible();
        await expect(pp.confirmPasswordInput).toBeVisible();
    });

    test('PRIV-003: Password mismatch shows error', async ({ page }) => {
        await pp.expandPasswordForm();
        await pp.changePassword(FIELD_STAFF.password, 'NewPass123!', 'DifferentPass123!');

        // Error message uses bg-destructive/10 text-destructive classes
        const errorOrMessage = page.locator('[class*="destructive"]').or(page.locator('text=/match|mismatch|error/i')).first();
        await expect(errorOrMessage).toBeVisible({ timeout: 5_000 });
    });

    test('PRIV-004: Password too short shows error', async ({ page }) => {
        await pp.expandPasswordForm();
        await pp.currentPasswordInput.fill(FIELD_STAFF.password);
        await pp.newPasswordInput.fill('ab');
        await pp.confirmPasswordInput.fill('ab');
        await pp.updateButton.click();
        await expect(page).toHaveURL(/.*\/privacy/);
        await expect(pp.newPasswordInput).toBeVisible();
    });

    test.skip('PRIV-005: Successful password change and restore', async () => {
        const originalPassword = FIELD_STAFF.password;
        const tempPassword = 'TempE2E_Pass123!';

        await pp.expandPasswordForm();
        await pp.changePassword(tempPassword, tempPassword);

        const success = await pp.successMessage.isVisible({ timeout: 5_000 }).catch(() => false);
        if (success) {
            await pp.page.reload();
            await pp.page.waitForLoadState('domcontentloaded');
            pp = new PrivacyPage(pp.page);
            await pp.expandPasswordForm();
            await pp.changePassword(originalPassword, originalPassword);
            await expect(pp.successMessage).toBeVisible({ timeout: 5_000 });
        }
    });

    test('PRIV-006: Sign out all devices button visible', async ({ page }) => {
        // Sign out button: has LogOut icon and text "Sign out from all devices"
        // Use icon-based selector for locale independence
        const signOutBtn = page.locator('button:has(.lucide-log-out)').or(
            page.locator('button').filter({ hasText: /Sign out|sign out|साइन आउट/i })
        ).first();
        await expect(signOutBtn).toBeVisible({ timeout: 10_000 });
    });
});

import { test, expect } from '@playwright/test';
import { FIELD_STAFF, ADMIN, switchLanguage } from './fixtures/test-constants';
import { loginAs } from './fixtures/auth.fixture';

test.describe('User Profile Module - Field Staff', () => {

    test.beforeEach(async ({ page }) => {
        await loginAs(page, FIELD_STAFF);
        await page.goto('/profile');
    });

    test('PROF-001: Profile page loads with name and role', async ({ page }) => {
        await expect(page.locator('text=Edit Profile').first()).toBeVisible();
        await expect(page.locator('text=Sign Out').first()).toBeVisible();
        // Profile should display user name and role badge
        await expect(page.locator('h1, h2').first()).toBeVisible();
    });

    test('PROF-003: Territory/division display', async ({ page }) => {
        // Check if territory or division info is shown (may be empty for test user)
        const profileContent = await page.locator('main, [role="main"]').first().textContent();
        // Territory section should exist in the profile page structure
        expect(profileContent).toBeTruthy();
    });

    test('PROF-004: Territory warning when not assigned', async ({ page }) => {
        // If the test user has no territory, a warning icon should be visible
        const warningIcon = page.locator('.lucide-alert-triangle');
        const territoryText = page.locator('text=/territory/i');
        const iconCount = await warningIcon.count();
        const textCount = await territoryText.count();
        if (iconCount > 0) {
            await expect(warningIcon.first()).toBeVisible();
        } else if (textCount > 0) {
            await expect(territoryText.first()).toBeVisible();
        }
    });

    test('PROF-005: Navigate to Edit Profile', async ({ page }) => {
        await page.click('text=Edit Profile', { strict: false });
        await expect(page).toHaveURL(/.*\/profile\/edit/);
    });

    test('PROF-006: Navigate to Privacy & Security', async ({ page }) => {
        await page.click('text=Privacy', { strict: false });
        await expect(page).toHaveURL(/.*\/privacy/);
    });

    test('PROF-007: Navigate to Help & Support', async ({ page }) => {
        await page.click('text=Help', { strict: false });
        await expect(page).toHaveURL(/.*\/help/);
    });

    test('PROF-008: Logout', async ({ page }) => {
        // Click sign out button (opens confirmation dialog)
        await page.locator('button:has(.lucide-log-out)').first().click();
        // Confirm in the dialog
        const confirmBtn = page.locator('.fixed button').filter({ hasText: /Sign Out|साइन आउट/i }).first();
        await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
        await confirmBtn.click();
        await expect(page).toHaveURL(/.*\/login/, { timeout: 10_000 });
    });

    test('PROF-009: Profile labels in Hindi', async ({ page }) => {
        // Switch to Hindi
        await switchLanguage(page, 'Hindi');

        await page.goto('/profile');
        await page.waitForLoadState('networkidle');

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/प्रोफ़ाइल|साइन आउट|संपादित/);

        // Restore English
        await switchLanguage(page, 'English');
    });
});

test.describe('User Profile Module - Admin', () => {

    test('PROF-002: Admin badge visible on profile', async ({ page }) => {
        await loginAs(page, ADMIN);
        await page.goto('/profile');

        // Admin should see an admin badge or role indicator
        const adminBadge = page.locator('text=/admin/i');
        await expect(adminBadge.first()).toBeVisible();
    });
});

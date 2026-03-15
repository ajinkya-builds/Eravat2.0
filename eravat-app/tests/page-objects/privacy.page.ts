import { type Page, type Locator, expect } from '@playwright/test';

export class PrivacyPage {
    readonly page: Page;
    readonly changePasswordSection: Locator;
    readonly newPasswordInput: Locator;
    readonly confirmPasswordInput: Locator;
    readonly updateButton: Locator;
    readonly successMessage: Locator;
    readonly errorMessage: Locator;
    readonly signOutAllButton: Locator;

    constructor(page: Page) {
        this.page = page;
        // The toggle button text comes from t('privacy.changePassword')
        this.changePasswordSection = page.locator('button').filter({ hasText: /Change Password|Password|पासवर्ड/i }).first();
        this.newPasswordInput = page.locator('input[placeholder="New Password"]');
        this.confirmPasswordInput = page.locator('input[placeholder="Confirm New Password"]');
        // Submit button inside the password form (not the toggle)
        this.updateButton = page.locator('form button[type="submit"]').first();
        this.successMessage = page.locator('[class*="emerald"]').or(page.locator('text=/updated|success/i')).first();
        this.errorMessage = page.locator('[class*="destructive"]');
        // Sign out uses LogOut icon
        this.signOutAllButton = page.locator('button:has(.lucide-log-out)').or(
            page.locator('button').filter({ hasText: /Sign out|साइन आउट/i })
        ).first();
    }

    async goto() {
        await this.page.goto('/privacy');
    }

    async expandPasswordForm() {
        await this.changePasswordSection.click();
        // Wait for AnimatePresence to reveal the form
        await this.newPasswordInput.waitFor({ state: 'visible', timeout: 5_000 });
    }

    async changePassword(newPwd: string, confirmPwd: string) {
        await this.newPasswordInput.fill(newPwd);
        await this.confirmPasswordInput.fill(confirmPwd);
        await this.updateButton.click();
    }
}

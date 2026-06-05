import { type Page, type Locator } from '@playwright/test';
import { appPath } from '../fixtures/test-constants';

export class PrivacyPage {
    readonly page: Page;
    readonly changePasswordSection: Locator;
    readonly currentPasswordInput: Locator;
    readonly newPasswordInput: Locator;
    readonly confirmPasswordInput: Locator;
    readonly updateButton: Locator;
    readonly successMessage: Locator;
    readonly errorMessage: Locator;
    readonly signOutAllButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.changePasswordSection = page.locator('button').filter({ hasText: /Change Password|Password|पासवर्ड/i }).first();
        this.currentPasswordInput = page.getByPlaceholder('Current Password', { exact: true });
        this.newPasswordInput = page.getByPlaceholder('New Password', { exact: true });
        this.confirmPasswordInput = page.getByPlaceholder('Confirm New Password', { exact: true });
        this.updateButton = page.locator('form button[type="submit"]').first();
        this.successMessage = page.locator('[class*="emerald"]').or(page.locator('text=/updated|success/i')).first();
        this.errorMessage = page.locator('[class*="destructive"]');
        this.signOutAllButton = page.locator('button:has(.lucide-log-out)').or(
            page.locator('button').filter({ hasText: /Sign out|साइन आउट/i }),
        ).first();
    }

    async goto() {
        await this.page.goto(appPath('/privacy'));
    }

    async expandPasswordForm() {
        await this.changePasswordSection.click();
        await this.currentPasswordInput.waitFor({ state: 'visible', timeout: 10_000 });
    }

    async changePassword(currentPwd: string, newPwd: string, confirmPwd: string) {
        await this.currentPasswordInput.fill(currentPwd);
        await this.newPasswordInput.fill(newPwd);
        await this.confirmPasswordInput.fill(confirmPwd);
        await this.updateButton.click();
    }
}

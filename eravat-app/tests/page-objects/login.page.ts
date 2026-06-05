import { type Page, type Locator, expect } from '@playwright/test';
import { appPath } from '../fixtures/test-constants';

export class LoginPage {
    readonly page: Page;
    readonly phoneInput: Locator;
    readonly passwordInput: Locator;
    readonly submitButton: Locator;
    readonly errorMessage: Locator;

    constructor(page: Page) {
        this.page = page;
        this.phoneInput = page.locator('input[type="tel"]');
        this.passwordInput = page.locator('input[type="password"]');
        this.submitButton = page.locator('button[type="submit"]');
        this.errorMessage = page.locator('.text-destructive');
    }

    async goto() {
        await this.page.goto(appPath('/login'));
    }

    async login(phone: string, password: string) {
        await this.phoneInput.fill(phone);
        await this.passwordInput.fill(password);
        await this.submitButton.click();
    }

    async expectErrorVisible() {
        await expect(this.errorMessage).toBeVisible({ timeout: 10_000 });
    }

    async expectOnLoginPage() {
        await expect(this.page).toHaveURL(/\/login/);
    }
}

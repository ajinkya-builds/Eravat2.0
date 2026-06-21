import { type Page, type Locator } from '@playwright/test';
import { appPath } from '../../fixtures/test-constants';

export class AdminUsersPage {
    readonly page: Page;
    readonly registerButton: Locator;
    readonly searchInput: Locator;
    readonly userTable: Locator;
    readonly noPersonnelText: Locator;

    // Modal — located by the fixed overlay div
    readonly emailInput: Locator;
    readonly passwordInput: Locator;
    readonly phoneInput: Locator;
    readonly roleSelect: Locator;
    readonly cancelButton: Locator;
    readonly submitButton: Locator;
    readonly deleteConfirmButton: Locator;
    readonly successMessage: Locator;

    constructor(page: Page) {
        this.page = page;
        this.registerButton = page.locator('button').filter({ hasText: /Register|Personnel/i }).first();
        this.searchInput = page.locator('input[placeholder*="earch"]').or(page.locator('input[type="text"]')).first();
        this.userTable = page.locator('table').first();
        this.noPersonnelText = page.locator('text=/No personnel|no.*found/i');

        // Modal form fields — use global selectors since modal is rendered as fixed overlay
        // These are only visible when modal is open
        this.emailInput = page.locator('input[type="email"]');
        this.passwordInput = page.locator('input[type="password"]');
        this.phoneInput = page.locator('input[type="tel"]').last();
        this.roleSelect = page.locator('select').first();
        this.cancelButton = page.locator('button[type="button"]').filter({ hasText: /Cancel/i }).first();
        this.submitButton = page.locator('button[type="submit"]').last();
        this.deleteConfirmButton = page.getByRole('button', { name: /Delete|Confirm/i }).last();
        this.successMessage = page.locator('text=/success/i');
    }

    /** Get the first name input (first text input in the modal form) */
    get firstNameInput(): Locator {
        return this.page.locator('.fixed.inset-0 input').first();
    }

    /** Get the last name input (second text input in the modal form) */
    get lastNameInput(): Locator {
        return this.page.locator('.fixed.inset-0 input').nth(1);
    }

    async goto() {
        await this.page.goto(appPath('/admin/users'));
    }
}

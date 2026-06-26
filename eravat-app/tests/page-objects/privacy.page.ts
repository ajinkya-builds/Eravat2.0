import { type Page, type Locator } from '@playwright/test';
import { appPath } from '../fixtures/test-constants';

export class PrivacyPage {
    readonly page: Page;
    readonly signOutAllButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.signOutAllButton = page.locator('button:has(.lucide-log-out)').or(
            page.locator('button').filter({ hasText: /Sign out|साइन आउट/i }),
        ).first();
    }

    async goto() {
        await this.page.goto(appPath('/privacy'));
    }
}

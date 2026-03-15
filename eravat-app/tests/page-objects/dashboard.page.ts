import { type Page, type Locator, expect } from '@playwright/test';

export class DashboardPage {
    readonly page: Page;
    readonly logo: Locator;
    readonly welcomeHeading: Locator;
    readonly reportActivityCard: Locator;
    readonly profileCard: Locator;
    readonly historyCard: Locator;
    readonly commandCenterCard: Locator;
    readonly commandCenterIcon: Locator;

    constructor(page: Page) {
        this.page = page;
        this.logo = page.locator('img[alt="ERAVAT Logo"]').first();
        this.welcomeHeading = page.locator('h1').first();
        this.reportActivityCard = page.locator('button:has(.lucide-activity)');
        this.profileCard = page.locator('button:has(.lucide-user)');
        this.historyCard = page.locator('button:has(.lucide-history)');
        this.commandCenterCard = page.locator('button:has(.lucide-shield-check)');
        this.commandCenterIcon = page.locator('.lucide-shield-check');
    }

    async expectLoaded() {
        await expect(this.logo).toBeVisible();
        await expect(this.welcomeHeading).toBeVisible();
    }
}

import { type Page, type Locator } from '@playwright/test';

export class BottomNav {
    readonly page: Page;
    readonly homeTab: Locator;
    readonly mapTab: Locator;
    readonly reportButton: Locator;
    readonly profileTab: Locator;
    readonly settingsTab: Locator;
    readonly navContainer: Locator;

    constructor(page: Page) {
        this.page = page;
        const nav = page.locator('nav').last();
        this.navContainer = nav;
        this.homeTab = nav.locator('button').filter({ has: page.locator('.lucide-house') });
        this.mapTab = nav.locator('button').filter({ has: page.locator('.lucide-map') });
        this.reportButton = nav.locator('button').filter({ has: page.locator('.lucide-plus') });
        this.profileTab = nav.locator('button').filter({ has: page.locator('.lucide-user') });
        this.settingsTab = nav.locator('button').filter({ has: page.locator('.lucide-settings') });
    }
}

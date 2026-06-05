import { type Page, type Locator } from '@playwright/test';
import { appPath } from '../../fixtures/test-constants';

export class AdminObservationsPage {
    readonly page: Page;
    readonly exportButton: Locator;
    readonly refreshButton: Locator;
    readonly table: Locator;
    readonly masterCheckbox: Locator;
    readonly paginationNext: Locator;
    readonly paginationPrev: Locator;
    readonly paginationText: Locator;

    constructor(page: Page) {
        this.page = page;
        this.exportButton = page.locator('button').filter({ hasText: /Export/i }).first();
        this.refreshButton = page.locator('button').filter({ has: page.locator('.lucide-refresh-cw') }).first();
        this.table = page.locator('table').first();
        this.masterCheckbox = page.locator('input[type="checkbox"]').first();
        this.paginationNext = page.locator('button').filter({ has: page.locator('.lucide-chevron-right') }).last();
        this.paginationPrev = page.locator('button').filter({ has: page.locator('.lucide-chevron-left') }).last();
        this.paginationText = page.locator('text=/Showing/i');
    }

    async goto() {
        await this.page.goto(appPath('/admin/observations'));
    }
}

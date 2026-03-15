import { type Page, type Locator, expect } from '@playwright/test';

export class SettingsPage {
    readonly page: Page;
    readonly lightButton: Locator;
    readonly darkButton: Locator;
    readonly systemButton: Locator;
    readonly languageDropdown: Locator;
    readonly pushToggle: Locator;
    readonly clearCacheButton: Locator;

    constructor(page: Page) {
        this.page = page;
        // Theme buttons use lucide icons: Sun, Moon, Monitor — locale-independent
        this.lightButton = page.locator('button:has(.lucide-sun)').first();
        this.darkButton = page.locator('button:has(.lucide-moon)').first();
        this.systemButton = page.locator('button:has(.lucide-monitor)').first();
        // Language dropdown — match any known language label (works in any locale)
        this.languageDropdown = page.locator('button').filter({ hasText: /English|Hindi|Marathi|अंग्रेज़ी|हिन्दी|मराठी|इंग्रजी/ }).first();
        this.pushToggle = page.locator('button').filter({ has: page.locator('.rounded-full') }).last();
        this.clearCacheButton = page.getByRole('button', { name: /Clear/i }).first();
    }

    async goto() {
        await this.page.goto('/settings');
    }

    async selectLanguage(lang: 'English' | 'Hindi' | 'Marathi') {
        await this.languageDropdown.click();
        await this.page.locator('button').filter({ hasText: new RegExp(lang) }).last().click();
    }

    async selectTheme(theme: 'Light' | 'Dark' | 'System') {
        const btn = theme === 'Light' ? this.lightButton
            : theme === 'Dark' ? this.darkButton
            : this.systemButton;
        await btn.click();
    }
}

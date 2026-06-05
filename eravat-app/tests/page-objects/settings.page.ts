import { type Page, type Locator } from '@playwright/test';
import { appPath } from '../fixtures/test-constants';

const LANG_VALUE: Record<'English' | 'Hindi' | 'Marathi', string> = {
    English: 'en',
    Hindi: 'hi',
    Marathi: 'mr',
};

export class SettingsPage {
    readonly page: Page;
    readonly lightButton: Locator;
    readonly darkButton: Locator;
    readonly systemButton: Locator;
    readonly languageSelect: Locator;
    readonly pushToggle: Locator;
    readonly clearCacheButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.lightButton = page.getByTestId('theme-light');
        this.darkButton = page.getByTestId('theme-dark');
        this.systemButton = page.getByTestId('theme-system');
        this.languageSelect = page.getByTestId('language-select');
        this.pushToggle = page.locator('input.toggle-checkbox').first();
        this.clearCacheButton = page.getByRole('button', { name: /Clear|साफ/i }).first();
    }

    async goto() {
        await this.page.goto(appPath('/settings'));
    }

    async selectLanguage(lang: 'English' | 'Hindi' | 'Marathi') {
        await this.languageSelect.selectOption(LANG_VALUE[lang]);
        await this.page.waitForTimeout(300);
    }

    async selectTheme(theme: 'Light' | 'Dark' | 'System') {
        const btn = theme === 'Light' ? this.lightButton
            : theme === 'Dark' ? this.darkButton
            : this.systemButton;
        await btn.click();
        await this.page.waitForTimeout(200);
    }
}

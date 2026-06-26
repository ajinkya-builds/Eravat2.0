/**
 * global-setup.ts
 * Runs ONCE before the entire test suite (if configured).
 * Logs in as each role using Phone OTP and saves the browser storage state to disk.
 */

import { chromium, FullConfig } from '@playwright/test';
import { mkdir } from 'fs/promises';
import { FIELD_STAFF, ADMIN, appPath } from './fixtures/test-constants';

const BASE = 'http://localhost:5173';

async function loginAndSave(
    phone: string,
    savePath: string,
) {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto(`${BASE}${appPath('/login')}`);
    await page.waitForLoadState('domcontentloaded');
    
    // Fill phone number (placeholder is '9876543210')
    await page.getByPlaceholder('9876543210').fill(phone);
    await page.locator('button[type="submit"]').click();

    // Fill OTP (sandbox code is 123456)
    await page.getByPlaceholder('Enter 6-digit code').fill('123456');
    await page.locator('button[type="submit"]').click();

    // PIN Setup: type '1111' using keypad buttons
    const keyOne = page.getByRole('button', { name: '1', exact: true });
    await keyOne.waitFor({ state: 'visible', timeout: 10000 });
    for (let i = 0; i < 4; i++) {
        await keyOne.click();
    }

    // PIN Confirm: type '1111' using keypad buttons
    await page.waitForTimeout(1000);
    for (let i = 0; i < 4; i++) {
        await keyOne.click();
    }

    await page.waitForURL(
        (url) => !url.pathname.endsWith('/login'),
        { timeout: 60_000 },
    );

    // Bypass pin lock for tests
    await page.evaluate(() => {
        localStorage.setItem('eravat-language', 'en');
        localStorage.setItem('eravat-theme', 'light');
        localStorage.setItem('eravat_bypass_pin_lock', 'true');
    });

    await page.context().storageState({ path: savePath });
    await browser.close();
    console.log(`[global-setup] Session saved → ${savePath}`);
}

export default async function globalSetup(_config: FullConfig) {
    await mkdir('playwright/.auth', { recursive: true });
    await loginAndSave(FIELD_STAFF.phone, 'playwright/.auth/field-staff.json');
    await loginAndSave(ADMIN.phone, 'playwright/.auth/admin.json');
}

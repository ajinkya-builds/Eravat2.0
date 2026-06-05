/**
 * global-setup.ts
 * Runs ONCE before the entire test suite.
 * Logs in as each role and saves the browser storage state to disk.
 */

import { chromium, FullConfig } from '@playwright/test';
import { mkdir } from 'fs/promises';
import { FIELD_STAFF, ADMIN, appPath } from './fixtures/test-constants';

const BASE = 'http://localhost:5173';

async function loginAndSave(
    phone: string,
    password: string,
    savePath: string,
) {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto(`${BASE}${appPath('/login')}`);
    await page.waitForLoadState('domcontentloaded');
    const passwordTab = page.getByRole('button', { name: /Login with Password|पासवर्ड/i });
    if (await passwordTab.isVisible().catch(() => false)) {
        await passwordTab.click();
    }
    await page.getByPlaceholder('+91 98765 43210').fill(phone);
    await page.getByPlaceholder('••••••••').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(
        (url) => !url.pathname.endsWith('/login'),
        { timeout: 60_000 },
    );

    await page.context().storageState({ path: savePath });
    await browser.close();
    console.log(`[global-setup] Session saved → ${savePath}`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function globalSetup(_config: FullConfig) {
    await mkdir('playwright/.auth', { recursive: true });
    await loginAndSave(FIELD_STAFF.phone, FIELD_STAFF.password, 'playwright/.auth/field-staff.json');
    await loginAndSave(ADMIN.phone, ADMIN.password, 'playwright/.auth/admin.json');
}

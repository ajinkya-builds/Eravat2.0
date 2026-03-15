/**
 * global-setup.ts
 * Runs ONCE before the entire test suite.
 * Logs in as each role and saves the browser storage state to disk.
 * All tests then reuse these saved sessions — no live Supabase auth calls per test.
 */

import { chromium, FullConfig } from '@playwright/test';
import { FIELD_STAFF, ADMIN } from './fixtures/test-constants';

async function loginAndSave(
    email: string,
    password: string,
    savePath: string,
) {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('input[type="tel"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    // Wait until the dashboard renders — confirms auth completed
    await page.locator('text=/Report Activity|What would you like|Command Center/i')
        .first()
        .waitFor({ state: 'visible', timeout: 60_000 });

    // Persist cookies + localStorage so workers can reuse without logging in
    await page.context().storageState({ path: savePath });
    await browser.close();
    console.log(`[global-setup] Session saved → ${savePath}`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function globalSetup(_config: FullConfig) {
    await loginAndSave(FIELD_STAFF.phone, FIELD_STAFF.password, 'playwright/.auth/field-staff.json');
    await loginAndSave(ADMIN.phone, ADMIN.password, 'playwright/.auth/admin.json');
}

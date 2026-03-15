import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import { FIELD_STAFF, ADMIN } from './test-constants';

/**
 * Direct login utility — used ONLY by global-setup.ts to create stored sessions.
 * Individual tests should NOT call this; they use the storageState fixtures below.
 */
export async function loginAs(
    page: Page,
    credentials: { phone: string; password: string },
) {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('input[type="tel"]').fill(credentials.phone);
    await page.locator('input[type="password"]').fill(credentials.password);
    await page.locator('button[type="submit"]').click();
    // Wait for dashboard to confirm auth success (up to 60s for global-setup)
    await page.locator('text=/Report Activity|What would you like|Command Center/i')
        .first()
        .waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForLoadState('networkidle');
}

type AuthFixtures = {
    fieldStaffPage: Page;
    adminPage: Page;
    fieldStaffContext: BrowserContext;
    adminContext: BrowserContext;
};

/**
 * storageState-based fixtures.
 * These restore a pre-saved browser session (cookies + localStorage) from disk,
 * so NO live Supabase auth call is made per test — eliminating all auth flakiness.
 * Sessions are created once by global-setup.ts before the suite runs.
 */
export const test = base.extend<AuthFixtures>({
    fieldStaffContext: async ({ browser }, use) => {
        const ctx = await browser.newContext({
            storageState: 'playwright/.auth/field-staff.json',
        });
        await use(ctx);
        await ctx.close();
    },
    adminContext: async ({ browser }, use) => {
        const ctx = await browser.newContext({
            storageState: 'playwright/.auth/admin.json',
        });
        await use(ctx);
        await ctx.close();
    },
    fieldStaffPage: async ({ fieldStaffContext }, use) => {
        const page = await fieldStaffContext.newPage();
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await use(page);
        await page.close();
    },
    adminPage: async ({ adminContext }, use) => {
        const page = await adminContext.newPage();
        await page.goto('/admin');
        await page.waitForLoadState('domcontentloaded');
        await use(page);
        await page.close();
    },
});

export { expect };

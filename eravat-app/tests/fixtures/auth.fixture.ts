import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import { FIELD_STAFF, ADMIN, appPath } from './test-constants';
import { LOGIN_SUBTITLE, waitForAppReady } from './app-ready';

export type TestCredentials = { phone: string; password: string };

export { waitForAppReady } from './app-ready';

export async function clearSupabaseSession(page: Page) {
    await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith('sb-')) {
                localStorage.removeItem(key);
            }
        }
    });
}

async function isLoginScreen(page: Page): Promise<boolean> {
    if (page.url().includes('/login')) return true;
    return page.getByText(LOGIN_SUBTITLE).isVisible().catch(() => false);
}

/** Wait until the login screen is gone and the app shell has loaded. */
export async function waitForAuthenticated(page: Page) {
    await page.waitForURL(
        (url) => !url.pathname.endsWith('/login'),
        { timeout: 60_000 },
    );
    await expect(page.getByText(LOGIN_SUBTITLE)).toHaveCount(0, { timeout: 30_000 });
    await waitForAppReady(page);
    if (await isLoginScreen(page)) {
        throw new Error('Still on login screen after waitForAuthenticated');
    }
}

/**
 * Navigate with storageState; re-login if JWT expired or session missing.
 */
export async function ensureOnPage(
    page: Page,
    path: string,
    credentials: TestCredentials = FIELD_STAFF,
) {
    const navigate = async () => {
        await page.goto(appPath(path));
        await page.waitForLoadState('domcontentloaded');
    };

    await navigate();
    if (await isLoginScreen(page)) {
        await loginAs(page, credentials);
        await navigate();
    }
    try {
        await waitForAuthenticated(page);
    } catch {
        await loginAs(page, credentials);
        await navigate();
        await waitForAuthenticated(page);
    }

    if (await isLoginScreen(page)) {
        await loginAs(page, credentials);
        await navigate();
        await waitForAuthenticated(page);
    }
}

export async function loginAs(
    page: Page,
    credentials: TestCredentials,
) {
    await page.goto(appPath('/login'));
    await page.waitForLoadState('domcontentloaded');

    if (!(await isLoginScreen(page))) {
        await clearSupabaseSession(page);
        await page.goto(appPath('/login'));
        await page.waitForLoadState('domcontentloaded');
    }

    const passwordTab = page.getByRole('button', { name: /Login with Password|पासवर्ड/i });
    if (await passwordTab.isVisible().catch(() => false)) {
        await passwordTab.click();
    }
    await page.getByPlaceholder('+91 98765 43210').fill(credentials.phone);
    await page.getByPlaceholder('••••••••').fill(credentials.password);
    await page.locator('button[type="submit"]').click();
    await waitForAuthenticated(page);
}

type AuthFixtures = {
    fieldStaffPage: Page;
    adminPage: Page;
    fieldStaffContext: BrowserContext;
    adminContext: BrowserContext;
};

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
        await ensureOnPage(page, '/', FIELD_STAFF);
        await use(page);
        await page.close();
    },
    adminPage: async ({ adminContext }, use) => {
        const page = await adminContext.newPage();
        await ensureOnPage(page, '/admin', ADMIN);
        await use(page);
        await page.close();
    },
});

export { expect };

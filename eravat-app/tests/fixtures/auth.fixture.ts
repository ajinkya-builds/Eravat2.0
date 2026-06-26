/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import { FIELD_STAFF, ADMIN, appPath } from './test-constants';
import { LOGIN_SUBTITLE, waitForAppReady } from './app-ready';

export type TestCredentials = { phone: string; password: string };

export { waitForAppReady } from './app-ready';

export async function clearSupabaseSession(page: Page) {
    await page.evaluate(() => {
        localStorage.removeItem('eravat_secure_session');
        localStorage.removeItem('eravat_bypass_pin_lock');
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

async function isPINLockScreen(page: Page): Promise<boolean> {
    return page.getByText('Enter Security PIN').isVisible().catch(() => false);
}

/** Wait until the login screen is gone and the app shell has loaded. */
export async function waitForAuthenticated(page: Page) {
    if (page.url().includes('/login')) {
        await page.waitForURL(
            (url) => !url.pathname.endsWith('/login'),
            { timeout: 60_000 },
        );
    }
    await expect(page.getByText(LOGIN_SUBTITLE)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText('Enter Security PIN')).toHaveCount(0, { timeout: 30_000 });
    await waitForAppReady(page);
    if (await isLoginScreen(page) || await isPINLockScreen(page)) {
        throw new Error('Still on login or PIN lock screen after waitForAuthenticated');
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
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
    };

    await navigate();
    if (await isLoginScreen(page) || await isPINLockScreen(page)) {
        await loginAs(page, credentials);
        await navigate();
    }
    try {
        await waitForAuthenticated(page);
    } catch (err) {
        console.error('DEBUG: initial waitForAuthenticated failed with error:', err);
        console.error('DEBUG: current URL is:', page.url());
        const bodyText = await page.innerText('body').catch(() => 'no body');
        console.error('DEBUG: body text context:', {
            url: page.url(),
            hasWelcome: bodyText.includes('Welcome'),
            hasLoading: bodyText.includes('Loading'),
            hasEnterCode: bodyText.includes('Enter')
        });
        await loginAs(page, credentials);
        await navigate();
        try {
            await waitForAuthenticated(page);
        } catch (err2) {
            console.error('DEBUG: second waitForAuthenticated failed with error:', err2);
            console.error('DEBUG: final URL is:', page.url());
            throw err2;
        }
    }

    if (await isLoginScreen(page) || await isPINLockScreen(page)) {
        await loginAs(page, credentials);
        await navigate();
        await waitForAuthenticated(page);
    }
}

export async function loginAs(
    page: Page,
    credentials: { phone: string },
) {
    await page.goto(appPath('/login'));
    await page.waitForLoadState('networkidle');

    if (!(await isLoginScreen(page))) {
        await clearSupabaseSession(page);
        await page.goto(appPath('/login'));
        await page.waitForLoadState('networkidle');
    }

    const phoneInput = page.getByPlaceholder('9876543210');
    await phoneInput.waitFor({ state: 'visible' });
    await phoneInput.click();
    await phoneInput.fill(credentials.phone);
    await page.waitForFunction(
        (expected) => {
            const el = document.querySelector('input[placeholder="9876543210"]');
            return el && el.value === expected;
        },
        credentials.phone,
        { timeout: 10000 }
    );
    await page.locator('button[type="submit"]').click();

    await page.getByPlaceholder('Enter 6-digit code').fill('123456');
    await page.locator('button[type="submit"]').click();

    const keyOne = page.getByRole('button', { name: '1', exact: true });
    await expect(keyOne).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 4; i++) {
        await keyOne.click();
    }

    await expect(page.getByText('Confirm Security PIN')).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 4; i++) {
        await keyOne.click();
    }

    await waitForAuthenticated(page);

    await page.evaluate(() => {
        localStorage.setItem('eravat_bypass_pin_lock', 'true');
    });
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

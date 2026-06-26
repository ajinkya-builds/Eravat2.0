import { test as setup, expect } from '@playwright/test';
import { ADMIN, FIELD_STAFF, appPath } from './fixtures/test-constants';
import { waitForAuthenticated } from './fixtures/auth.fixture';

async function loginAndSave(
    page: import('@playwright/test').Page,
    phone: string,
    path: string,
) {
    await page.goto(appPath('/login'));
    // Wait for JS bundle to load and React to hydrate (domcontentloaded is too early)
    await page.waitForLoadState('networkidle');

    // Fill phone number — click first to ensure React's onChange listener is attached
    const phoneInput = page.getByPlaceholder('9876543210');
    await phoneInput.waitFor({ state: 'visible' });
    await phoneInput.click();
    await phoneInput.fill(phone);
    // Verify value was set correctly (guards against early-hydration race)
    await page.waitForFunction(
        (expected) => {
            const el = document.querySelector('input[placeholder="9876543210"]');
            return el && el.value === expected;
        },
        phone,
        { timeout: 10000 }
    );
    await page.locator('button[type="submit"]').click();

    // Fill OTP (sandbox code is 123456)
    await page.getByPlaceholder('Enter 6-digit code').fill('123456');
    await page.locator('button[type="submit"]').click();

    // PIN Setup: type '1111' using keypad buttons
    const keyOne = page.getByRole('button', { name: '1', exact: true });
    await expect(keyOne).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 4; i++) {
        await keyOne.click();
    }

    // PIN Confirm: type '1111' using keypad buttons
    await expect(page.getByText('Confirm Security PIN')).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 4; i++) {
        await keyOne.click();
    }

    await waitForAuthenticated(page);

    await page.evaluate(() => {
        localStorage.setItem('eravat-language', 'en');
        localStorage.setItem('eravat-theme', 'light');
        localStorage.setItem('eravat_bypass_pin_lock', 'true');
        document.documentElement.classList.remove('dark');
    });
    await page.context().storageState({ path });
}

setup('authenticate field staff', async ({ page }) => {
    await loginAndSave(page, FIELD_STAFF.phone, 'playwright/.auth/field-staff.json');
});

setup('authenticate admin', async ({ page }) => {
    // Wait 5 seconds to prevent rate limit on the remote Supabase project
    await page.waitForTimeout(5000);
    await loginAndSave(page, ADMIN.phone, 'playwright/.auth/admin.json');
});

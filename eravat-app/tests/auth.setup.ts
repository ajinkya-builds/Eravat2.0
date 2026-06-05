import { test as setup } from '@playwright/test';
import { ADMIN, FIELD_STAFF, appPath } from './fixtures/test-constants';
import { waitForAuthenticated } from './fixtures/auth.fixture';

async function loginAndSave(
    page: import('@playwright/test').Page,
    phone: string,
    password: string,
    path: string,
) {
    await page.goto(appPath('/login'));
    await page.waitForLoadState('domcontentloaded');
    const passwordTab = page.getByRole('button', { name: /Login with Password|पासवर्ड/i });
    if (await passwordTab.isVisible().catch(() => false)) {
        await passwordTab.click();
    }
    await page.getByPlaceholder('+91 98765 43210').fill(phone);
    await page.getByPlaceholder('••••••••').fill(password);
    await page.locator('button[type="submit"]').click();
    await waitForAuthenticated(page);
    await page.evaluate(() => {
        localStorage.setItem('eravat-language', 'en');
        localStorage.setItem('eravat-theme', 'light');
        document.documentElement.classList.remove('dark');
    });
    await page.context().storageState({ path });
}

setup('authenticate field staff', async ({ page }) => {
    await loginAndSave(page, FIELD_STAFF.phone, FIELD_STAFF.password, 'playwright/.auth/field-staff.json');
});

setup('authenticate admin', async ({ page }) => {
    await loginAndSave(page, ADMIN.phone, ADMIN.password, 'playwright/.auth/admin.json');
});

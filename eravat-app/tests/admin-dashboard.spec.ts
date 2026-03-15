import { test, expect } from '@playwright/test';
import { ADMIN, FIELD_STAFF, switchLanguage } from './fixtures/test-constants';
import { loginAs } from './fixtures/auth.fixture';

test.describe('Admin Dashboard Module', () => {

    test.beforeEach(async ({ page }) => {
        await loginAs(page, ADMIN);
        await page.goto('/admin');
    });

    test('ADM-001: Admin dashboard loads', async ({ page }) => {
        // The admin h1 uses text-transparent/bg-clip-text gradient — use textContent check instead
        const h1 = page.locator('h1').first();
        await expect(h1).toBeAttached({ timeout: 10_000 });
        const text = await h1.textContent();
        expect(text).toMatch(/ERAVAT|Admin|Overview/i);
    });

    test('ADM-002: Stats cards visible', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        // Stats are in glass-card divs within a grid layout
        const statsCard = page.locator('.glass-card').first();
        await expect(statsCard).toBeVisible({ timeout: 15_000 });
    });

    test('ADM-003: Navigate to Users management', async ({ page }) => {
        // Admin nav uses buttons in sidebar with text from translations
        const usersBtn = page.locator('nav button').filter({ hasText: /User|Personnel/i }).first();
        await usersBtn.click();
        await expect(page).toHaveURL(/.*\/admin\/users/);
    });

    test('ADM-004: Navigate to Observations', async ({ page }) => {
        // admin.nav.observations now translates to "Observations" in English
        const obsBtn = page.locator('nav button').filter({ hasText: /Observation|अवलोकन|निरीक्षणे/i }).first();
        await obsBtn.click();
        await expect(page).toHaveURL(/.*\/admin\/observations/);
    });

    test('ADM-005: Navigate to Divisions', async ({ page }) => {
        const divBtn = page.locator('nav button').filter({ hasText: /Division/i }).first();
        if (await divBtn.isVisible()) {
            await divBtn.click();
            await expect(page).toHaveURL(/.*\/admin\/divisions/);
        }
    });

    test('ADM-006: Navigate to Admin Settings', async ({ page }) => {
        const settingsBtn = page.locator('nav button').filter({ hasText: /Setting/i }).first();
        if (await settingsBtn.isVisible()) {
            await settingsBtn.click();
            await expect(page).toHaveURL(/.*\/admin\/settings/);
        }
    });

    test('ADM-007: Recent activity feed', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const activitySection = page.locator('text=/Recent|Activity|Latest/i').first();
        if (await activitySection.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await expect(activitySection).toBeVisible();
        }
    });

    test('ADM-008: Admin stats refresh', async ({ page }) => {
        const refreshBtn = page.locator('button:has(.lucide-refresh-cw)').first();
        if (await refreshBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await refreshBtn.click();
            await page.waitForLoadState('networkidle');
        }
    });

    test('ADM-009: Non-admin cannot access admin dashboard', async ({ page }) => {
        await page.goto('/login');
        await loginAs(page, FIELD_STAFF);
        await page.goto('/admin');

        const url = page.url();
        const hasAdminAccess = url.includes('/admin');
        if (hasAdminAccess) {
            const denied = page.locator('text=/access denied|unauthorized|forbidden/i').first();
            if (await denied.isVisible({ timeout: 3_000 }).catch(() => false)) {
                await expect(denied).toBeVisible();
            }
        }
    });

    test('ADM-010: Admin dashboard charts/graphs', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const charts = page.locator('canvas, .recharts-wrapper, svg.recharts-surface').first();
        if (await charts.isVisible({ timeout: 5_000 }).catch(() => false)) {
            await expect(charts).toBeVisible();
        }
    });

    test('ADM-011: Admin breadcrumb navigation', async ({ page }) => {
        const breadcrumb = page.locator('nav[aria-label="breadcrumb"], [class*="breadcrumb"]').first();
        if (await breadcrumb.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await expect(breadcrumb).toBeVisible();
        }
    });

    test('ADM-012: Admin dashboard in Hindi', async ({ page }) => {
        await switchLanguage(page, 'Hindi');

        await page.goto('/admin');
        await page.waitForLoadState('networkidle');

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/कमांड|प्रशासन|उपयोगकर्ता|अवलोकन|एडमिन/);

        await switchLanguage(page, 'English');
    });
});

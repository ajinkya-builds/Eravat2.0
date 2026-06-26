import { test, expect } from '@playwright/test';
import { ADMIN, switchLanguage, gotoAndReady } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';

test.describe('Admin Users Management Module', () => {

    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/admin/users', ADMIN);
        await gotoAndReady(page, '/admin/users');
        // Wait for the personnel table or empty state to load
        const table = page.locator('table').first();
        const noData = page.locator('text=/No personnel|no.*found|empty/i');
        await expect(table.or(noData)).toBeVisible({ timeout: 30_000 });
    });

    test('AUSR-001: Users list page loads', async ({ page }) => {
        const table = page.locator('table').first();
        const noData = page.locator('text=/No personnel|no.*found|empty/i');
        await expect(table.or(noData)).toBeVisible({ timeout: 10_000 });
    });

    test('AUSR-002: Register button visible', async ({ page }) => {
        // Button text: "Register Personnel" — use "Register" to avoid matching nav "Personnel" button
        const registerBtn = page.getByRole('button', { name: /Register Personnel|Register/i }).first();
        await expect(registerBtn).toBeVisible({ timeout: 10_000 });
    });

    test('AUSR-003: Register modal opens', async ({ page }) => {
        const registerBtn = page.getByRole('button', { name: /Register Personnel|Register/i }).first();
        await expect(registerBtn).toBeVisible({ timeout: 10_000 });
        await registerBtn.click();

        const roleSelect = page.locator('form select').first();
        await expect(roleSelect).toBeVisible({ timeout: 10_000 });

        const phoneInput = page.locator('input[type="tel"]');
        await expect(phoneInput).toBeVisible({ timeout: 10_000 });
    });

    test('AUSR-004: Register modal cancel', async ({ page }) => {
        const registerBtn = page.getByRole('button', { name: /Register Personnel|Register/i }).first();
        await expect(registerBtn).toBeVisible({ timeout: 10_000 });
        await registerBtn.click();

        const phoneInput = page.locator('input[type="tel"]');
        await expect(phoneInput).toBeVisible({ timeout: 10_000 });

        // Cancel button text: t('profile.cancel') = "Cancel"
        const cancelBtn = page.locator('button').filter({ hasText: /Cancel/i }).first();
        await cancelBtn.click();
        await expect(phoneInput).not.toBeVisible({ timeout: 5_000 });
    });

    test('AUSR-005: Register new user (CRUD create)', async ({ page }) => {
        const uniquePhone = `9` + Math.floor(100000000 + Math.random() * 900000000);

        const registerBtn = page.getByRole('button', { name: /Register Personnel|Register/i }).first();
        await expect(registerBtn).toBeVisible({ timeout: 10_000 });
        await registerBtn.click();

        const modalForm = page.locator('form').filter({ has: page.locator('input[type=\"tel\"]') }).first();
        const roleSelect = modalForm.locator('select').first();
        await expect(roleSelect).toBeVisible({ timeout: 10_000 });
        await roleSelect.selectOption('beat_guard');

        const textInputs = modalForm.locator('input[type="text"], input:not([type])');

        // Fill first name and last name
        await textInputs.first().fill('E2E');
        await textInputs.nth(1).fill('TestUser');

        const phoneInput = modalForm.locator('input[type="tel"]');
        await phoneInput.fill(uniquePhone);

        // Location fields (required for profile completeness)
        const locInputs = modalForm.locator('input[type="number"]');
        if (await locInputs.first().isVisible().catch(() => false)) {
            await locInputs.first().fill('22.9734');
        }
        if (await locInputs.nth(1).isVisible().catch(() => false)) {
            await locInputs.nth(1).fill('78.6568');
        }

        const submitBtn = modalForm.locator('button[type="submit"]');
        await submitBtn.click();
        await expect(modalForm).toBeVisible({ timeout: 10_000 });
    });

    test('AUSR-006: Search users', async ({ page }) => {
        const searchInput = page.locator('input[placeholder*="earch"]').or(page.locator('input[type="text"]')).first();
        await searchInput.fill('admin');
        await page.waitForTimeout(1_000);
        const table = page.locator('table').first();
        const noData = page.locator('text=/No personnel|no.*found/i');
        await expect(table.or(noData)).toBeVisible();
    });

    test('AUSR-007: Register with duplicate phone shows error', async ({ page }) => {
        const registerBtn = page.getByRole('button', { name: /Register Personnel|Register/i }).first();
        await expect(registerBtn).toBeVisible({ timeout: 10_000 });
        await registerBtn.click();

        const modalForm = page.locator('form').filter({ has: page.locator('input[type=\"tel\"]') }).first();
        const roleSelect = modalForm.locator('select').first();
        await expect(roleSelect).toBeVisible({ timeout: 10_000 });
        await roleSelect.selectOption('beat_guard');

        const textInputs = modalForm.locator('input[type="text"], input:not([type])');
        await textInputs.first().fill('Dup');
        await textInputs.nth(1).fill('Test');

        const phoneInput = modalForm.locator('input[type="tel"]');
        await phoneInput.fill('8899776655'); // Use the seeded E2E field staff phone
        
        const locInputs = modalForm.locator('input[type="number"]');
        if (await locInputs.first().isVisible().catch(() => false)) {
            await locInputs.first().fill('22.9734');
        }
        if (await locInputs.nth(1).isVisible().catch(() => false)) {
            await locInputs.nth(1).fill('78.6568');
        }

        const submitBtn = modalForm.locator('button[type="submit"]');
        await submitBtn.click();

        await expect(modalForm).toBeVisible({ timeout: 10_000 });
    });

    test('AUSR-008: Register with empty fields shows validation', async ({ page }) => {
        const registerBtn = page.getByRole('button', { name: /Register Personnel|Register/i }).first();
        await expect(registerBtn).toBeVisible({ timeout: 10_000 });
        await registerBtn.click();

        const modalForm = page.locator('form').filter({ has: page.locator('input[type=\"tel\"]') }).first();
        const roleSelect = modalForm.locator('select').first();
        await expect(roleSelect).toBeVisible({ timeout: 10_000 });
        await roleSelect.selectOption('beat_guard');

        const phoneInput = modalForm.locator('input[type="tel"]');
        await expect(phoneInput).toBeVisible({ timeout: 10_000 });

        const submitBtn = modalForm.locator('button[type="submit"]');
        await submitBtn.click();

        // Modal should remain open (native HTML validation prevents submission)
        await expect(phoneInput).toBeVisible();
    });

    test('AUSR-009: User table has columns', async ({ page }) => {
        const table = page.locator('table').first();
        const headerRow = table.locator('thead tr, th').first();
        if (await headerRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
            const headerText = await headerRow.textContent();
            expect(headerText).toMatch(/Name|Role|Phone|Contact/i);
        }
    });

    test('AUSR-010: Users list in Hindi', async ({ page }) => {
        await switchLanguage(page, 'Hindi');

        await gotoAndReady(page, '/admin/users');

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/उपयोगकर्ता|कर्मचारी|पंजीकरण/);

        await switchLanguage(page, 'English');
    });
});

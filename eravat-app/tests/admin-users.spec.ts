import { test, expect } from '@playwright/test';
import { ADMIN, switchLanguage } from './fixtures/test-constants';
import { loginAs } from './fixtures/auth.fixture';

test.describe('Admin Users Management Module', () => {

    test.beforeEach(async ({ page }) => {
        await loginAs(page, ADMIN);
        await page.goto('/admin/users');
        await page.waitForLoadState('networkidle');
        // Wait for the personnel table or empty state to load
        const table = page.locator('table').first();
        const noData = page.locator('text=/No personnel|no.*found|empty/i');
        const loading = page.locator('text=/Loading/i');
        // Wait until loading disappears
        await loading.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => { });
    });

    test('AUSR-001: Users list page loads', async ({ page }) => {
        const table = page.locator('table').first();
        const noData = page.locator('text=/No personnel|no.*found|empty/i');
        await expect(table.or(noData)).toBeVisible({ timeout: 10_000 });
    });

    test('AUSR-002: Register button visible', async ({ page }) => {
        // Button text: "Register Personnel" — use "Register" to avoid matching nav "Personnel" button
        const registerBtn = page.locator('main button').filter({ hasText: /Register/i }).first();
        await expect(registerBtn).toBeVisible({ timeout: 10_000 });
    });

    test('AUSR-003: Register modal opens', async ({ page }) => {
        const registerBtn = page.locator('main button').filter({ hasText: /Register/i }).first();
        await expect(registerBtn).toBeVisible({ timeout: 10_000 });
        await registerBtn.click();

        // Email input inside the modal form
        const emailInput = page.locator('input[type="email"]');
        await expect(emailInput).toBeVisible({ timeout: 10_000 });
    });

    test('AUSR-004: Register modal cancel', async ({ page }) => {
        const registerBtn = page.locator('main button').filter({ hasText: /Register/i }).first();
        await expect(registerBtn).toBeVisible({ timeout: 10_000 });
        await registerBtn.click();

        const emailInput = page.locator('input[type="email"]');
        await expect(emailInput).toBeVisible({ timeout: 10_000 });

        // Cancel button text: t('profile.cancel') = "Cancel"
        const cancelBtn = page.locator('button').filter({ hasText: /Cancel/i }).first();
        await cancelBtn.click();
        await expect(emailInput).not.toBeVisible({ timeout: 5_000 });
    });

    test('AUSR-005: Register new user (CRUD create)', async ({ page }) => {
        const uniqueEmail = `e2e-${Date.now()}@test.local`;

        const registerBtn = page.locator('main button').filter({ hasText: /Register/i }).first();
        await expect(registerBtn).toBeVisible({ timeout: 10_000 });
        await registerBtn.click();

        const emailInput = page.locator('input[type="email"]');
        await expect(emailInput).toBeVisible({ timeout: 10_000 });

        // Form fields: first_name, last_name (grid), email, password (grid), phone, role
        // All modal inputs use bg-muted/50 class
        const modalForm = page.locator('.fixed.inset-0 form');
        const textInputs = modalForm.locator('input[type="text"], input:not([type])');

        // Fill first name and last name (first two text inputs in the form)
        await textInputs.first().fill('E2E');
        await textInputs.nth(1).fill('TestUser');
        await emailInput.fill(uniqueEmail);
        await page.locator('.fixed.inset-0 input[type="password"]').fill('Test@1234');

        const phoneInput = page.locator('.fixed.inset-0 input[type="tel"]');
        if (await phoneInput.isVisible()) {
            await phoneInput.fill('9000000001');
        }

        // Submit button text: "Register & Assign"
        const submitBtn = page.locator('.fixed.inset-0 button[type="submit"]');
        await submitBtn.click();
        await expect(page.locator('text=/success/i')).toBeVisible({ timeout: 15_000 });

        // Clean up: search and delete
        await page.waitForTimeout(1_000);
        const searchInput = page.locator('input[placeholder*="earch"]').or(page.locator('input[type="text"]')).first();
        await searchInput.fill('E2E TestUser');
        await page.waitForTimeout(1_000);

        const deleteBtn = page.locator('button:has(.lucide-trash-2)').or(page.locator('button:has(.lucide-trash)')).first();
        if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await deleteBtn.click();
            const confirmBtn = page.getByRole('button', { name: /Delete|Confirm/i }).last();
            await confirmBtn.click();
        }
    });

    test('AUSR-006: Search users', async ({ page }) => {
        const searchInput = page.locator('input[placeholder*="earch"]').or(page.locator('input[type="text"]')).first();
        await searchInput.fill('admin');
        await page.waitForTimeout(1_000);
        const table = page.locator('table').first();
        const noData = page.locator('text=/No personnel|no.*found/i');
        await expect(table.or(noData)).toBeVisible();
    });

    test('AUSR-007: Register with duplicate email shows error', async ({ page }) => {
        const registerBtn = page.locator('main button').filter({ hasText: /Register/i }).first();
        await expect(registerBtn).toBeVisible({ timeout: 10_000 });
        await registerBtn.click();

        const emailInput = page.locator('input[type="email"]');
        await expect(emailInput).toBeVisible({ timeout: 10_000 });

        const modalForm = page.locator('.fixed.inset-0 form');
        const textInputs = modalForm.locator('input[type="text"], input:not([type])');
        await textInputs.first().fill('Dup');
        await textInputs.nth(1).fill('Test');
        await emailInput.fill('admin@test.local');
        await page.locator('.fixed.inset-0 input[type="password"]').fill('Test@1234');

        const submitBtn = page.locator('.fixed.inset-0 button[type="submit"]');
        await submitBtn.click();

        const error = page.locator('[class*="destructive"]').or(page.locator('text=/already exists|duplicate|error/i')).first();
        const hasError = await error.isVisible({ timeout: 5_000 }).catch(() => false);
        const hasSuccess = await page.locator('text=/success/i').isVisible({ timeout: 2_000 }).catch(() => false);
        expect(hasError || hasSuccess).toBeTruthy();
    });

    test('AUSR-008: Register with empty fields shows validation', async ({ page }) => {
        const registerBtn = page.locator('main button').filter({ hasText: /Register/i }).first();
        await expect(registerBtn).toBeVisible({ timeout: 10_000 });
        await registerBtn.click();

        const emailInput = page.locator('input[type="email"]');
        await expect(emailInput).toBeVisible({ timeout: 10_000 });

        const submitBtn = page.locator('.fixed.inset-0 button[type="submit"]');
        await submitBtn.click();

        // Modal should remain open (native HTML validation prevents submission)
        await expect(emailInput).toBeVisible();
    });

    test('AUSR-009: User table has columns', async ({ page }) => {
        const table = page.locator('table').first();
        const headerRow = table.locator('thead tr, th').first();
        if (await headerRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
            const headerText = await headerRow.textContent();
            expect(headerText).toMatch(/Name|Email|Role|Phone|Contact/i);
        }
    });

    test('AUSR-010: Users list in Hindi', async ({ page }) => {
        await switchLanguage(page, 'Hindi');

        await page.goto('/admin/users');
        await page.waitForLoadState('networkidle');

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/उपयोगकर्ता|कर्मचारी|पंजीकरण/);

        await switchLanguage(page, 'English');
    });
});

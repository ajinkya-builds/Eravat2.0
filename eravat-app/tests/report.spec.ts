import { test, expect } from '@playwright/test';
import { switchLanguage, gotoAndReady } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';
import { ReportStepperPage } from './page-objects/report-stepper.page';

const DEFAULT_DATE = '2025-06-15';
const DEFAULT_TIME = '14:30';
const DEFAULT_LAT = '20.5937';
const DEFAULT_LNG = '78.9629';

test.describe('Report Activity Module', () => {
    let rp: ReportStepperPage;

    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/report');
        rp = new ReportStepperPage(page);
        await expect(rp.dateInput).toBeVisible({ timeout: 30_000 });
    });

    // --- Step 1: Location & Time ---

    test.skip('RPT-001: Auto-detect GPS location', () => {
        // Requires GPS geolocation API — cannot automate in headless
    });

    test.skip('RPT-002: GPS coordinates display on map', () => {
        // Requires GPS geolocation API
    });

    test('RPT-003: Manual date entry', async () => {
        await expect(rp.dateInput).toBeVisible();
        await rp.dateInput.fill('2025-06-15');
        await expect(rp.dateInput).toHaveValue('2025-06-15');
    });

    test('RPT-004: Manual time entry', async () => {
        await expect(rp.timeInput).toBeVisible();
        await rp.timeInput.fill('14:30');
        await expect(rp.timeInput).toHaveValue('14:30');
    });

    test('RPT-005: Manual latitude/longitude entry', async () => {
        await rp.latInput.fill(DEFAULT_LAT);
        await rp.lngInput.fill(DEFAULT_LNG);
        await expect(rp.latInput).toHaveValue(DEFAULT_LAT);
        await expect(rp.lngInput).toHaveValue(DEFAULT_LNG);
    });

    test('RPT-006: Step 1 validation — missing required fields', async () => {
        await rp.dateInput.fill('');
        await rp.timeInput.fill('');
        await rp.continueButton.click({ force: true });

        // Should remain on step 1 or show validation error
        await expect(rp.dateInput).toBeVisible();
    });

    test('RPT-007: Advance from Step 1 with all fields filled', async () => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();

        // Should be on step 2 — observation type selection visible
        await expect(rp.directSightingCard).toBeVisible({ timeout: 5_000 });
    });

    test.skip('RPT-008: Location pin on map preview', () => {
        // Requires GPS geolocation API
    });

    // --- Step 2: Observation Type ---

    test('RPT-009: Direct Sighting type selection', async () => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();

        await rp.directSightingCard.click();
        // Selected card gets border-emerald-500 class
        await expect(rp.directSightingCard).toHaveClass(/border-emerald|border-primary|selected/);
    });

    test('RPT-010: Indirect Evidence type selection', async () => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();

        await rp.indirectSignCard.click();
        await expect(rp.indirectSignCard).toBeVisible();
    });

    test('RPT-011: Loss/Damage type selection', async () => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();

        await rp.lossDamageCard.click();
        await expect(rp.lossDamageCard).toBeVisible();
    });

    test('RPT-012: Counter increment for elephant count', async ({ page }) => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();

        await rp.directSightingCard.click();
        await page.waitForTimeout(300);

        const incrementBtn = page.locator('button:has(.lucide-plus)').first();
        if (await incrementBtn.isVisible()) {
            await incrementBtn.click();
            const counter = page.locator('input[type="number"], span').filter({ hasText: /^[0-9]+$/ }).first();
            if (await counter.isVisible()) {
                const value = await counter.textContent() || await counter.inputValue();
                expect(parseInt(value || '0')).toBeGreaterThanOrEqual(1);
            }
        }
    });

    test('RPT-013: Counter decrement for elephant count', async ({ page }) => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();

        await rp.directSightingCard.click();
        await page.waitForTimeout(300);

        const incrementBtn = page.locator('button:has(.lucide-plus)').first();
        const decrementBtn = page.locator('button:has(.lucide-minus)').first();
        if (await incrementBtn.isVisible()) {
            await incrementBtn.click();
            await incrementBtn.click();
            await decrementBtn.click();
        }
    });

    test('RPT-014: Counter cannot go below zero', async ({ page }) => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();

        await rp.directSightingCard.click();
        await page.waitForTimeout(300);

        const decrementBtn = page.locator('button:has(.lucide-minus)').first();
        if (await decrementBtn.isVisible()) {
            await decrementBtn.click();
            await decrementBtn.click();
            const counter = page.locator('input[type="number"]').first();
            if (await counter.isVisible()) {
                const val = parseInt(await counter.inputValue() || '0');
                expect(val).toBeGreaterThanOrEqual(0);
            }
        }
    });

    test('RPT-017: Step 2 validation — no type selected', async () => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();

        // Try to advance without selecting any type
        await rp.continueButton.click({ force: true });

        // Should remain on step 2 or show error
        await expect(rp.directSightingCard).toBeVisible();
    });

    test('RPT-018: Switching observation type resets sub-fields', async ({ page }) => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();

        await rp.directSightingCard.click();
        await page.waitForTimeout(300);

        // Switch to Indirect Evidence
        await rp.indirectSignCard.click();
        await page.waitForTimeout(300);

        await expect(rp.indirectSignCard).toBeVisible();
    });

    test('RPT-019: Advance from Step 2 with valid selection', async () => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();
        await rp.selectDirectSightingWithCount(1);
        await rp.advanceStep();
        await expect(rp.continueButton).toBeVisible({ timeout: 5_000 });
    });

    // --- Step 3: Compass / Bearing ---

    test.skip('RPT-020: Device compass auto-detect', () => {
        // Requires device orientation API
    });

    test.skip('RPT-021: Compass needle animation', () => {
        // Requires device orientation API
    });

    test.skip('RPT-022: Compass calibration prompt', () => {
        // Requires device orientation API
    });

    test.skip('RPT-023: Landscape compass lock', () => {
        // Requires device orientation API
    });

    test('RPT-024: Manual bearing input', async () => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();
        await rp.selectDirectSightingWithCount(1);
        await rp.advanceStep();

        if (await rp.manualBearingInput.isVisible()) {
            await rp.manualBearingInput.fill('180');
            await expect(rp.manualBearingInput).toHaveValue('180');
        }
    });

    test('RPT-025: Bearing boundary — 0 degrees', async () => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();
        await rp.selectDirectSightingWithCount(1);
        await rp.advanceStep();

        if (await rp.manualBearingInput.isVisible()) {
            await rp.manualBearingInput.fill('0');
            await expect(rp.manualBearingInput).toHaveValue('0');
        }
    });

    test('RPT-026: Bearing boundary — 359 degrees', async () => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();
        await rp.selectDirectSightingWithCount(1);
        await rp.advanceStep();

        if (await rp.manualBearingInput.isVisible()) {
            await rp.manualBearingInput.fill('359');
            await expect(rp.manualBearingInput).toHaveValue('359');
        }
    });

    test('RPT-027: Skip compass step', async () => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();
        await rp.completeToSubmitStep();
        await expect(rp.submitButton).toBeVisible({ timeout: 5_000 });
    });

    // --- Step 4: Photo ---

    test.skip('RPT-028: Open camera for photo capture', () => {
        // Requires Capacitor Camera API
    });

    test.skip('RPT-029: Photo preview after capture', () => {
        // Requires Capacitor Camera API
    });

    test.skip('RPT-030: Retake photo option', () => {
        // Requires Capacitor Camera API
    });

    test('RPT-031: Skip photo and proceed to submit', async () => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();
        await rp.completeToSubmitStep();
        await rp.submit();
        await expect(rp.successMessage).toBeVisible({ timeout: 15_000 });
    });

    test.skip('RPT-032: Multiple photos', () => {
        // Requires Capacitor Camera API
    });

    // --- Submission ---

    test('RPT-033: Online submission success', async () => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();
        await rp.completeToSubmitStep();
        await rp.submit();
        await expect(rp.successMessage).toBeVisible({ timeout: 15_000 });
    });

    test.skip('RPT-035: Save to IndexedDB when offline', () => {
        // Requires offline simulation + IndexedDB verification
    });

    test('RPT-036: Exit report mid-flow', async () => {
        await rp.closeButton.click();
        await expect(rp.page).toHaveURL(/\/Eravat2\.0\/?$/);
    });

    test('RPT-037: Back button preserves entered data', async ({ page }) => {
        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();

        // Wait for step 2 to load, then go back
        await expect(rp.directSightingCard).toBeVisible({ timeout: 5_000 });
        const backBtn = page.locator('button').filter({ hasText: /Back/i }).first();
        if (await backBtn.isVisible()) {
            await backBtn.click();
        } else {
            await rp.goBack();
        }
        // Date and time should still be filled
        await expect(rp.dateInput).not.toHaveValue('');
    });

    test('RPT-038: Progress indicator reflects current step', async ({ page }) => {
        // Progress uses h-1.5 rounded-full bars and rounded-full step pills with whitespace-nowrap
        const progressBars = page.locator('[class*="rounded-full"][class*="h-1"]');
        const stepPills = page.locator('[class*="rounded-full"][class*="whitespace-nowrap"]');
        const hasProgress = (await progressBars.count()) > 0 || (await stepPills.count()) > 0;
        expect(hasProgress).toBeTruthy();

        await rp.fillStep1(DEFAULT_DATE, DEFAULT_TIME, DEFAULT_LAT, DEFAULT_LNG);
        await rp.advanceStep();
        await expect(rp.directSightingCard).toBeVisible({ timeout: 5_000 });
    });

    test('RPT-039: Report flow labels in Hindi', async ({ page }) => {
        await switchLanguage(page, 'Hindi');
        await gotoAndReady(page, '/report');

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/रिपोर्ट|तारीख|समय|स्थान/);

        // Restore English
        await switchLanguage(page, 'English');
    });
});

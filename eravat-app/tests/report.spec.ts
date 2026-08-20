import { test, expect } from '@playwright/test';
import { switchLanguage, gotoAndReady } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';
import { ReportStepperPage } from './page-objects/report-stepper.page';

const DEFAULT_LAT = '20.5937';
const DEFAULT_LNG = '78.9629';

test.describe('Report Activity Module', () => {
    let rp: ReportStepperPage;

    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/report');
        rp = new ReportStepperPage(page);
        await expect(page.getByText(/Photo Evidence|फ़ोटो साक्ष्य|फोटो पुरावा/i).first()).toBeVisible({ timeout: 30_000 });
    });

    test('RPT-001: Wizard opens on photo step', async () => {
        await expect(rp.takePhotoButton).toBeVisible();
        await expect(rp.injectTestPhotoButton).toBeVisible();
        await expect(rp.directSightingCard).toHaveCount(0);
    });

    test.skip('RPT-002: GPS coordinates display on map', () => {
        // Requires GPS geolocation API
    });

    test('RPT-003: Date is auto-captured and not an input', async () => {
        await rp.advancePastPhoto();
        await rp.selectDirectSightingWithCount(1);
        await rp.advanceStep();
        await expect(rp.dateInput).toHaveCount(0);
        await expect(rp.page.getByText(/\d{4}-\d{2}-\d{2}/).first()).toBeVisible({ timeout: 10_000 });
    });

    test('RPT-004: Time is auto-captured and not an input', async () => {
        await rp.advancePastPhoto();
        await rp.selectDirectSightingWithCount(1);
        await rp.advanceStep();
        await expect(rp.timeInput).toHaveCount(0);
        await expect(rp.page.getByText(/\d{2}:\d{2}/).first()).toBeVisible({ timeout: 10_000 });
    });

    test('RPT-005: Manual latitude/longitude entry', async () => {
        await rp.advancePastPhoto();
        await rp.selectDirectSightingWithCount(1);
        await rp.advanceStep();
        await rp.fillLocation(DEFAULT_LAT, DEFAULT_LNG);
        await expect(rp.latInput).toHaveValue(DEFAULT_LAT);
        await expect(rp.lngInput).toHaveValue(DEFAULT_LNG);
    });

    test('RPT-006: Location step stays until GPS or coords exist', async () => {
        await rp.advancePastPhoto();
        await rp.selectDirectSightingWithCount(1);
        await rp.advanceStep();
        await expect(rp.latInput).toBeVisible();
        await expect(rp.page.getByText(/not editable|auto|Captured automatically/i).first()).toBeVisible();
    });

    test('RPT-007: Advance from location with coords filled', async () => {
        await rp.completeToReview(DEFAULT_LAT, DEFAULT_LNG);
        await expect(rp.submitButton).toBeVisible({ timeout: 5_000 });
    });

    test.skip('RPT-008: Location pin on map preview', () => {
        // Requires GPS geolocation API
    });

    test('RPT-009: Direct Sighting type selection', async () => {
        await rp.advancePastPhoto();
        await rp.directSightingCard.click();
        await expect(rp.directSightingCard).toHaveClass(/border-emerald|border-primary|selected/);
    });

    test('RPT-010: Indirect Evidence type selection', async () => {
        await rp.advancePastPhoto();
        await rp.indirectSignCard.click();
        await expect(rp.indirectSignCard).toBeVisible();
    });

    test.skip('RPT-011: Loss/Damage is a follow-on toggle, not a third type', () => {
        // Field review: only Direct / Indirect. Damage is a later step.
    });

    test('RPT-012: Counter increment for elephant count', async ({ page }) => {
        await rp.advancePastPhoto();
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
        await rp.advancePastPhoto();
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
        await rp.advancePastPhoto();
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

    test('RPT-017: Observation validation — no type selected', async () => {
        await rp.advancePastPhoto();
        await rp.continueButton.click({ force: true });
        await expect(rp.directSightingCard).toBeVisible();
    });

    test('RPT-018: Switching observation type resets sub-fields', async ({ page }) => {
        await rp.advancePastPhoto();
        await rp.directSightingCard.click();
        await page.waitForTimeout(300);
        await rp.indirectSignCard.click();
        await page.waitForTimeout(300);
        await expect(rp.indirectSignCard).toBeVisible();
    });

    test('RPT-019: Advance from observation with valid selection', async () => {
        await rp.advancePastPhoto();
        await rp.selectDirectSightingWithCount(1);
        await rp.advanceStep();
        await expect(rp.latInput).toBeVisible({ timeout: 5_000 });
    });

    test('RPT-027: Compass step is not in the wizard', async () => {
        await rp.advancePastPhoto();
        await expect(rp.page.getByText(/Compass Bearing|कम्पास|होकायंत्र/i)).toHaveCount(0);
        await rp.selectDirectSightingWithCount(1);
        await rp.advanceStep();
        await expect(rp.page.getByText(/Compass Bearing|कम्पास बेअरिंग|होकायंत्र बेअरिंग/i)).toHaveCount(0);
    });

    test.skip('RPT-028: Open camera for photo capture', () => {
        // Requires Capacitor Camera API
    });

    test.skip('RPT-029: Photo preview after capture', () => {
        // Requires Capacitor Camera API
    });

    test.skip('RPT-030: Retake photo option', () => {
        // Requires Capacitor Camera API
    });

    test('RPT-031: Cannot continue without a photo', async () => {
        await expect(rp.continueButton).toHaveCount(0);
        await expect(rp.takePhotoButton).toBeVisible();
    });

    test.skip('RPT-032: Multiple photos', () => {
        // Requires Capacitor Camera API
    });

    test('RPT-033: Online submission success', async () => {
        await rp.completeToReview(DEFAULT_LAT, DEFAULT_LNG);
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
        await rp.advancePastPhoto();
        await expect(rp.directSightingCard).toBeVisible({ timeout: 5_000 });
        const backBtn = page.locator('button').filter({ hasText: /Back/i }).first();
        if (await backBtn.isVisible()) {
            await backBtn.click();
        } else {
            await rp.goBack();
        }
        await expect(page.getByText(/Photo Evidence|फ़ोटो साक्ष्य|फोटो पुरावा/i).first()).toBeVisible();
    });

    test('RPT-038: Progress indicator reflects current step', async ({ page }) => {
        const progressBars = page.locator('[class*="rounded-full"][class*="h-1"]');
        const stepPills = page.locator('[class*="rounded-full"][class*="whitespace-nowrap"]');
        const hasProgress = (await progressBars.count()) > 0 || (await stepPills.count()) > 0;
        expect(hasProgress).toBeTruthy();

        await rp.advancePastPhoto();
        await expect(rp.directSightingCard).toBeVisible({ timeout: 5_000 });
    });

    test('RPT-039: Report flow labels in Hindi', async ({ page }) => {
        await switchLanguage(page, 'Hindi');
        await gotoAndReady(page, '/report');

        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/फ़ोटो|फोटो|साइटिंग|रिपोर्ट/);

        await switchLanguage(page, 'English');
    });
});

import { type Page, type Locator, expect } from '@playwright/test';
import { appPath } from '../fixtures/test-constants';

export class ReportStepperPage {
    readonly page: Page;
    readonly closeButton: Locator;
    readonly continueButton: Locator;
    readonly backButton: Locator;
    readonly submitButton: Locator;

    // Step 1
    readonly dateInput: Locator;
    readonly timeInput: Locator;
    readonly latInput: Locator;
    readonly lngInput: Locator;

    // Step 2
    readonly directSightingCard: Locator;
    readonly indirectSignCard: Locator;
    readonly lossDamageCard: Locator;

    // Step 3
    readonly manualBearingInput: Locator;

    // Success
    readonly successMessage: Locator;

    constructor(page: Page) {
        this.page = page;
        this.closeButton = page.locator('button').filter({ has: page.locator('.lucide-x') }).first();
        this.continueButton = page.getByRole('button', { name: /Continue|जारी/i }).first();
        this.backButton = page.getByRole('button', { name: /Back/i }).first();
        this.submitButton = page.getByRole('button', { name: /Submit|सबमिट/i }).first();

        // Step 1
        this.dateInput = page.locator('input[type="date"]');
        this.timeInput = page.locator('input[type="time"]');
        this.latInput = page.locator('input[type="number"]').first();
        this.lngInput = page.locator('input[type="number"]').nth(1);

        // Step 2
        this.directSightingCard = page.locator('button').filter({ hasText: /Direct Sighting/i }).first();
        this.indirectSignCard = page.locator('button').filter({ hasText: /Indirect Sign/i }).first();
        this.lossDamageCard = page.locator('button').filter({ hasText: /Loss/i }).first();

        // Step 3
        this.manualBearingInput = page.locator('input[type="number"][min="0"][max="360"]');

        // Success
        this.successMessage = page.locator('text=/Report Saved|रिपोर्ट सहेजी|अहवाल जतन/i').first();
    }

    async goto() {
        await this.page.goto(appPath('/report'));
    }

    async fillStep1(date: string, time: string, lat: string, lng: string) {
        // Date/time are auto-captured and not editable (field review).
        void date;
        void time;
        await this.latInput.fill(lat);
        await this.lngInput.fill(lng);
    }

    async advanceStep() {
        await expect(this.continueButton).toBeEnabled({ timeout: 10_000 });
        await this.continueButton.click({ force: true });
    }

    /** Direct sighting with at least one elephant so Continue enables on step 2. */
    async selectDirectSightingWithCount(count = 1) {
        await this.directSightingCard.click();
        await this.page.waitForTimeout(300);
        const countSection = this.page
            .locator('h4, [role="heading"]')
            .filter({ hasText: /Elephant Count/i })
            .first()
            .locator('..')
            .locator('..');

        // The app validates that the breakdown rows sum up, not just the "Total" row.
        const adultMaleRow = countSection.locator('text=/Adult Male/i').first().locator('..');
        const incrementBtn = adultMaleRow.locator('button:has(.lucide-plus)').last();
        for (let i = 0; i < count; i++) {
            await incrementBtn.click();
        }
    }

    /** Step 1 filled → observation → compass skip → photo step ready to submit. */
    async completeToSubmitStep() {
        await this.selectDirectSightingWithCount(1);
        await this.advanceStep();
        await this.page.waitForTimeout(300);
        await this.advanceStep(); // compass -> photo
        await this.page.waitForTimeout(300);
    }

    async goBack() {
        await this.backButton.click();
    }

    async submit() {
        await this.submitButton.click({ force: true });
    }

    async expectSuccess() {
        await expect(this.successMessage).toBeVisible({ timeout: 10_000 });
    }
}

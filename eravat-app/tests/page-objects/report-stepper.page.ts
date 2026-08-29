import { type Page, type Locator, expect } from '@playwright/test';
import { appPath } from '../fixtures/test-constants';

export class ReportStepperPage {
    readonly page: Page;
    readonly closeButton: Locator;
    readonly continueButton: Locator;
    readonly backButton: Locator;
    readonly submitButton: Locator;
    readonly takePhotoButton: Locator;
    readonly injectTestPhotoButton: Locator;

    readonly dateInput: Locator;
    readonly timeInput: Locator;
    readonly latInput: Locator;
    readonly lngInput: Locator;

    readonly directSightingCard: Locator;
    readonly indirectSignCard: Locator;
    readonly lossDamageCard: Locator;

    readonly successMessage: Locator;

    constructor(page: Page) {
        this.page = page;
        this.closeButton = page.locator('button').filter({ has: page.locator('.lucide-x') }).first();
        this.continueButton = page.getByRole('button', { name: /Continue|जारी/i }).first();
        this.backButton = page.getByRole('button', { name: /Back/i }).first();
        this.submitButton = page.getByRole('button', { name: /Submit|सबमिट/i }).first();
        this.takePhotoButton = page.getByRole('button', { name: /Take Photo|फ़ोटो|फोटो/i }).first();
        this.injectTestPhotoButton = page.getByTestId('e2e-inject-photo');

        this.dateInput = page.locator('input[type="date"]');
        this.timeInput = page.locator('input[type="time"]');
        this.latInput = page.locator('input[type="number"]').first();
        this.lngInput = page.locator('input[type="number"]').nth(1);

        this.directSightingCard = page.locator('button').filter({ hasText: /Direct Observation|Direct Sighting/i }).first();
        this.indirectSignCard = page.locator('button').filter({ hasText: /Indirect Observation|Indirect Sign/i }).first();
        this.lossDamageCard = page.locator('button').filter({ hasText: /Loss/i }).first();

        this.successMessage = page.locator('text=/Report Saved|रिपोर्ट सहेजी|अहवाल जतन/i').first();
    }

    async goto() {
        await this.page.goto(appPath('/report'));
    }

    async injectTestPhoto() {
        await expect(this.injectTestPhotoButton).toBeVisible({ timeout: 10_000 });
        await this.injectTestPhotoButton.click();
    }

    async advancePastPhoto() {
        await this.injectTestPhoto();
        await this.advanceStep();
    }

    async fillLocation(lat: string, lng: string) {
        await this.latInput.fill(lat);
        await this.lngInput.fill(lng);
    }

    async advanceStep() {
        await expect(this.continueButton).toBeEnabled({ timeout: 10_000 });
        await this.continueButton.click({ force: true });
    }

    /** Direct sighting with at least one elephant so Continue enables on observation step. */
    async selectDirectSightingWithCount(count = 1) {
        await this.directSightingCard.click();
        await this.page.waitForTimeout(300);
        const countSection = this.page
            .locator('h4, [role="heading"]')
            .filter({ hasText: /Elephant Count/i })
            .first()
            .locator('..')
            .locator('..');

        const adultMaleRow = countSection.locator('text=/Adult Male/i').first().locator('..');
        const incrementBtn = adultMaleRow.locator('button:has(.lucide-plus)').last();
        for (let i = 0; i < count; i++) {
            await incrementBtn.click();
        }
    }

    /** Photo → observation → location filled → review. */
    async completeToReview(lat: string, lng: string) {
        await this.advancePastPhoto();
        await this.selectDirectSightingWithCount(1);
        await this.advanceStep();
        await this.fillLocation(lat, lng);
        await this.advanceStep();
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

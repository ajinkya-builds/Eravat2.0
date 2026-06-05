import { expect, type Page } from '@playwright/test';

/** Login page subtitle — not shown on the field dashboard. */
export const LOGIN_SUBTITLE = /Enter your credentials|फ़ील्ड डैशबोर्ड|फील्ड डॅशबोर्ड/;

export async function waitForAppReady(page: Page) {
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('Loading...', { exact: true })).toHaveCount(0, {
        timeout: 30_000,
    });
}

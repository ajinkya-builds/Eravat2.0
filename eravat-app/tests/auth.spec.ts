import { test, expect } from '@playwright/test';
import { appPath } from './fixtures/test-constants';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(appPath('/login'));
    await page.waitForLoadState('networkidle');
  });

    test('should display Eravat 2.0 branding on Login screen', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Eravat 2.0' })).toBeVisible({ timeout: 30000 });
    });

  test('should show validation error for short phone number', async ({ page }) => {
    // Fill the phone number heavily under the 10 digit requirement
    const phoneInput = page.getByPlaceholder('9876543210');
    await phoneInput.fill('12345');
    
    // Tap anywhere or submit to trigger validation
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    await expect(page.locator('text=Please enter a valid phone number')).toBeVisible();
  });
});

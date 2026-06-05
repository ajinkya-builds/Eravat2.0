import { test, expect } from '@playwright/test';
import { appPath } from './fixtures/test-constants';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(appPath('/login'));
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display translation properly on Login screen', async ({ page }) => {
    // Check that the Hindi translation renders successfully. We give it 30s to allow Vite to build on the first run.
    await expect(page.locator('text=जंगली हाथी निगरानी प्रणाली (2025)')).toBeVisible({ timeout: 30000 });
  });

  test('should show validation error for short phone number', async ({ page }) => {
    // Fill the phone number heavily under the 10 digit requirement
    const phoneInput = page.getByPlaceholder('+91 98765 43210');
    await phoneInput.fill('12345');
    
    const passwordInput = page.getByPlaceholder('••••••••');
    await passwordInput.fill('password123');
    
    // Tap anywhere or submit to trigger validation
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    await expect(page.locator('text=Please enter a valid phone number')).toBeVisible();
  });
});

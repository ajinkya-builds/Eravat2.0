import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { ADMIN, gotoAndReady } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';

function countCsvRecords(csv: string): number {
  let records = 0;
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (inQuotes && csv[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (!inQuotes && (c === '\n' || c === '\r')) {
      if (c === '\r' && csv[i + 1] === '\n') i += 1;
      records += 1;
    }
  }
  if (csv.length > 0 && !csv.endsWith('\n') && !csv.endsWith('\r')) records += 1;
  return records;
}

test.describe('Command Center villager tracker', () => {
  test.beforeEach(async ({ page }) => {
    await ensureOnPage(page, '/admin/villagers', ADMIN);
    await gotoAndReady(page, '/admin/villagers');
  });

  test('AVIL-001: tracker loads with search and register', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Villager tracker|ग्रामीण/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder(/Search name or mobile|नाम या मोबाइल|नाव किंवा मोबाइल/i)).toBeVisible();
    await expect(page.getByTestId('admin-villagers-register')).toBeVisible();
  });

  test('AVIL-002: register modal opens', async ({ page }) => {
    await page.getByTestId('admin-villagers-register').click();
    await expect(page.getByTestId('villager-form')).toBeVisible({ timeout: 10_000 });
  });

  test('AVIL-003: CSV export includes every matching villager', async ({ page }) => {
    const registered = page.locator('.glass-card').filter({ hasText: /Registered|पंजीकृत|नोंदणीकृत/ }).locator('p').first();
    await expect(registered).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => Number((await registered.innerText()).replace(/,/g, ''))).toBeGreaterThan(0);
    const expected = Number((await registered.innerText()).replace(/,/g, ''));

    const downloadPromise = page.waitForEvent('download', { timeout: 90_000 });
    await page.getByTestId('admin-villagers-export').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^villagers-.*\.csv$/);
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const csv = fs.readFileSync(filePath!, 'utf8');
    const records = countCsvRecords(csv);
    expect(csv.startsWith('Name,Mobile,')).toBe(true);
    expect(records - 1).toBe(expected);
  });
});

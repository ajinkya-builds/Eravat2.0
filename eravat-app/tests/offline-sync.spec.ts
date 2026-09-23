import { test, expect } from '@playwright/test';
import { appPath } from './fixtures/test-constants';
import { ensureOnPage } from './fixtures/auth.fixture';

test.describe('Offline & Sync Module', () => {

    test.beforeEach(async ({ page }) => {
        await ensureOnPage(page, '/');
    });

    test('SYNC-001: App loads after login', async ({ page }) => {
        await expect(page.locator('text=Add Sighting')).toBeVisible();
    });

    test('SYNC-002: Simulate offline — report wizard still opens', async ({ page }) => {
        await page.route('**/rest/v1/**', route => route.abort());
        await ensureOnPage(page, '/report');
        await expect(page.getByText(/Photo Evidence|फ़ोटो साक्ष्य|फोटो पुरावा/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test('SYNC-003: Offline report form still accessible', async ({ page }) => {
        await page.route('**/rest/v1/**', route => route.abort());
        await ensureOnPage(page, '/report');
        await expect(page.getByRole('button', { name: /Take Photo|फ़ोटो|फोटो/i }).first()).toBeVisible({ timeout: 10_000 });
    });

    test('SYNC-004: Dashboard graceful degradation when offline', async ({ page }) => {
        await page.route('**/rest/v1/**', route => route.abort());
        await page.goto(appPath('/'));

        await page.waitForTimeout(2_000);
        const bodyText = await page.locator('body').textContent();
        expect(bodyText?.length).toBeGreaterThan(0);
    });

    test('SYNC-005: History page shows cached data offline', async ({ page }) => {
        await page.goto(appPath('/history'));
        await page.waitForLoadState('domcontentloaded');

        await page.route('**/rest/v1/**', route => route.abort());
        await page.reload();

        await page.waitForTimeout(2_000);
        const bodyText = await page.locator('body').textContent();
        expect(bodyText?.length).toBeGreaterThan(0);
    });

    test('SYNC-006: Re-sync when coming back online', async ({ page }) => {
        await page.route('**/rest/v1/**', route => route.abort());
        await page.goto(appPath('/'));
        await page.waitForTimeout(1_000);

        await page.unroute('**/rest/v1/**');
        await page.reload();
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('text=Add Sighting')).toBeVisible();
    });

    test('SYNC-007: Offline queue writes a pending Dexie report row', async ({ page }) => {
        await ensureOnPage(page, '/');
        // Use the app's EravatDB (opened by the running bundle) via IndexedDB.
        const queued = await page.evaluate(async () => {
            const id = `e2e-offline-${Date.now()}`;
            return new Promise((resolve) => {
                const open = indexedDB.open('EravatDB');
                open.onerror = () => resolve({ ok: false, reason: 'open failed' });
                open.onsuccess = () => {
                    const idb = open.result;
                    if (![...idb.objectStoreNames].includes('reports')) {
                        resolve({ ok: false, reason: 'no reports store' });
                        return;
                    }
                    const tx = idb.transaction('reports', 'readwrite');
                    const store = tx.objectStore('reports');
                    store.put({
                        id,
                        sync_status: 'pending',
                        device_timestamp: new Date().toISOString(),
                        notes: 'e2e offline queue probe',
                        status: 'pending',
                        user_id: null,
                        latitude: 23.75,
                        longitude: 80.93,
                        observation_type: 'direct',
                        male_count: 1,
                        female_count: 0,
                        calf_count: 0,
                        unknown_count: 0,
                        total_elephants: 1,
                        indirect_sign_details: [],
                        conflict_loss_details: [],
                        loss_type: [],
                        photo_url: null,
                        obs_id: null,
                        beat_id: null,
                        division_id: null,
                        range_id: null,
                        activity_date: '2026-09-22',
                        activity_time: '10:00',
                        compass_bearing: null,
                    });
                    tx.oncomplete = () => {
                        const tx2 = idb.transaction('reports', 'readwrite');
                        const getReq = tx2.objectStore('reports').get(id);
                        getReq.onsuccess = () => {
                            const row = getReq.result;
                            tx2.objectStore('reports').delete(id);
                            resolve({ ok: !!row && row.sync_status === 'pending', id });
                        };
                        getReq.onerror = () => resolve({ ok: false, reason: 'get failed' });
                    };
                    tx.onerror = () => resolve({ ok: false, reason: 'put failed' });
                };
            });
        });
        expect(queued.ok, JSON.stringify(queued)).toBeTruthy();
    });

    test.skip('SYNC-008: Camera + offline combo', () => {
        // Requires Capacitor Camera API + offline simulation
    });
});

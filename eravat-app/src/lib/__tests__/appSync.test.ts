import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const countPendingSyncReports = vi.fn();
const syncData = vi.fn();
const countPendingRegistrations = vi.fn();
const syncPendingRegistrations = vi.fn();
const flushPendingSupportIssues = vi.fn();

vi.mock('../../services/syncService', () => ({
  countPendingSyncReports: (...args: unknown[]) => countPendingSyncReports(...args),
  syncData: (...args: unknown[]) => syncData(...args),
}));

vi.mock('../../services/registrationSyncService', () => ({
  countPendingRegistrations: (...args: unknown[]) => countPendingRegistrations(...args),
  syncPendingRegistrations: (...args: unknown[]) => syncPendingRegistrations(...args),
}));

vi.mock('../supportIssues', () => ({
  flushPendingSupportIssues: (...args: unknown[]) => flushPendingSupportIssues(...args),
}));

import {
  getSyncSchedulerState,
  resetSyncSchedulerForTests,
  scheduleSyncAllPending,
  syncAllPending,
} from '../appSync';

describe('appSync scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSyncSchedulerForTests();
    vi.clearAllMocks();
    countPendingSyncReports.mockResolvedValue(0);
    countPendingRegistrations.mockResolvedValue(0);
    syncData.mockResolvedValue({ success: true, count: 0, total: 0, failed: 0 });
    syncPendingRegistrations.mockResolvedValue({ success: true, count: 0 });
    flushPendingSupportIssues.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetSyncSchedulerForTests();
    vi.useRealTimers();
  });

  it('coalesces reconnect + native-online into one sync after 3s debounce', async () => {
    countPendingSyncReports.mockResolvedValue(1);
    syncData.mockResolvedValue({ success: true, count: 1, total: 1, failed: 0 });

    scheduleSyncAllPending('reconnect');
    scheduleSyncAllPending('native-online');

    expect(syncData).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2999);
    expect(syncData).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(syncData).toHaveBeenCalledTimes(1);
  });

  it('applies exponential backoff after failed automatic sync', async () => {
    countPendingSyncReports.mockResolvedValue(1);
    syncData.mockResolvedValue({ success: false, count: 0, total: 1, failed: 1 });

    await syncAllPending('reconnect');
    expect(syncData).toHaveBeenCalledTimes(1);
    expect(getSyncSchedulerState().consecutiveFailureBatches).toBe(1);
    expect(getSyncSchedulerState().cooldownUntil).toBeGreaterThan(Date.now());

    // Immediate retry blocked; schedules for cooldown end
    await syncAllPending('reconnect');
    expect(syncData).toHaveBeenCalledTimes(1);

    // Force bypasses cooldown (manual-style)
    await syncAllPending('manual', { force: true });
    expect(syncData).toHaveBeenCalledTimes(2);
  });

  it('resets backoff after a clean sync', async () => {
    countPendingSyncReports.mockResolvedValue(1);
    syncData
      .mockResolvedValueOnce({ success: false, count: 0, total: 1, failed: 1 })
      .mockResolvedValueOnce({ success: true, count: 1, total: 1, failed: 0 });

    await syncAllPending('reconnect');
    expect(getSyncSchedulerState().consecutiveFailureBatches).toBe(1);

    await syncAllPending('reconnect', { force: true });
    expect(getSyncSchedulerState().consecutiveFailureBatches).toBe(0);
    expect(getSyncSchedulerState().cooldownUntil).toBe(0);
  });

  it('skips network work when queues are empty', async () => {
    await syncAllPending('initial');
    expect(syncData).not.toHaveBeenCalled();
    expect(syncPendingRegistrations).not.toHaveBeenCalled();
    expect(flushPendingSupportIssues).toHaveBeenCalled();
  });
});

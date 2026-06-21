/**
 * PushNotificationService tests — platform gating, permission flow,
 * token persistence, and listener lifecycle.
 *
 * The service keeps module-level listener state, so each test re-imports
 * a fresh module instance via vi.resetModules().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock primitives ─────────────────────────────────────────────────

const mockGetPlatform = vi.hoisted(() => vi.fn().mockReturnValue('android'));
const mockAddListener = vi.hoisted(() => vi.fn().mockResolvedValue({ remove: vi.fn() }));
const mockRemoveAllListeners = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockCheckPermissions = vi.hoisted(() => vi.fn());
const mockRequestPermissions = vi.hoisted(() => vi.fn());
const mockNativeRegister = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const mockUpsert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const mockDeleteEq = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const mockFrom = vi.hoisted(() =>
  vi.fn(() => ({
    upsert: mockUpsert,
    delete: vi.fn(() => ({ eq: mockDeleteEq })),
  })),
);

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: mockGetPlatform },
}));

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    addListener: mockAddListener,
    removeAllListeners: mockRemoveAllListeners,
    checkPermissions: mockCheckPermissions,
    requestPermissions: mockRequestPermissions,
    register: mockNativeRegister,
  },
}));

vi.mock('../../supabase', () => ({
  supabase: { from: mockFrom },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fresh module instance so module-level listener state never leaks between tests. */
async function importService() {
  vi.resetModules();
  const mod = await import('../PushNotificationService');
  return mod.PushNotificationService;
}

/** Pull the 'registration' callback that the service attached. */
function getRegistrationCallback(): (token: { value: string }) => void {
  const call = mockAddListener.mock.calls.find(([event]) => event === 'registration');
  expect(call, 'registration listener should be attached').toBeDefined();
  return call![1];
}

const flushMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPlatform.mockReturnValue('android');
  mockCheckPermissions.mockResolvedValue({ receive: 'granted' });
  mockRequestPermissions.mockResolvedValue({ receive: 'granted' });
  mockUpsert.mockResolvedValue({ error: null });
  mockDeleteEq.mockResolvedValue({ error: null });
});

// ─── Platform gating ─────────────────────────────────────────────────────────

describe('web platform gating', () => {
  it('register is a no-op on web — no permissions, no listeners, no DB writes', async () => {
    mockGetPlatform.mockReturnValue('web');
    const PushNotificationService = await importService();

    await PushNotificationService.register('user-1');

    expect(mockCheckPermissions).not.toHaveBeenCalled();
    expect(mockAddListener).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('unregister is a no-op on web — keeps any stored tokens untouched', async () => {
    mockGetPlatform.mockReturnValue('web');
    const PushNotificationService = await importService();

    await PushNotificationService.unregister('user-1');

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRemoveAllListeners).not.toHaveBeenCalled();
  });
});

// ─── Permission flow ─────────────────────────────────────────────────────────

describe('permission flow on native', () => {
  it('registers with the platform when permission is already granted', async () => {
    const PushNotificationService = await importService();

    await PushNotificationService.register('user-1');

    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockNativeRegister).toHaveBeenCalledTimes(1);
  });

  it('requests permission when status is prompt, then registers on grant', async () => {
    mockCheckPermissions.mockResolvedValue({ receive: 'prompt' });
    mockRequestPermissions.mockResolvedValue({ receive: 'granted' });
    const PushNotificationService = await importService();

    await PushNotificationService.register('user-1');

    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(mockNativeRegister).toHaveBeenCalledTimes(1);
  });

  it('does not register and does not throw when the user denies permission', async () => {
    mockCheckPermissions.mockResolvedValue({ receive: 'prompt' });
    mockRequestPermissions.mockResolvedValue({ receive: 'denied' });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const PushNotificationService = await importService();

    await expect(PushNotificationService.register('user-1')).resolves.toBeUndefined();

    expect(mockNativeRegister).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ─── Token persistence ───────────────────────────────────────────────────────

describe('token persistence', () => {
  it('persists the FCM token to push_tokens with android platform and conflict target', async () => {
    const PushNotificationService = await importService();
    await PushNotificationService.register('user-1');

    getRegistrationCallback()({ value: 'fcm-token-abc' });
    await flushMicrotasks();

    expect(mockFrom).toHaveBeenCalledWith('push_tokens');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        token: 'fcm-token-abc',
        platform: 'android',
      }),
      { onConflict: 'user_id,token' },
    );
  });

  it('stores platform "ios" when running on iOS', async () => {
    mockGetPlatform.mockReturnValue('ios');
    const PushNotificationService = await importService();
    await PushNotificationService.register('user-1');

    getRegistrationCallback()({ value: 'apns-token' });
    await flushMicrotasks();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'ios' }),
      expect.anything(),
    );
  });

  it('logs but does not throw when the token upsert fails', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'RLS denied' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const PushNotificationService = await importService();
    await PushNotificationService.register('user-1');

    getRegistrationCallback()({ value: 'fcm-token' });
    await flushMicrotasks();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist push token'),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });
});

// ─── Listener lifecycle ──────────────────────────────────────────────────────

describe('listener lifecycle', () => {
  it('does not re-attach listeners when the same user registers twice', async () => {
    const PushNotificationService = await importService();

    await PushNotificationService.register('user-1');
    const firstCount = mockAddListener.mock.calls.length;
    await PushNotificationService.register('user-1');

    expect(mockAddListener.mock.calls.length).toBe(firstCount);
    expect(mockRemoveAllListeners).not.toHaveBeenCalled();
  });

  it('detaches old listeners and re-attaches when a different user registers', async () => {
    const PushNotificationService = await importService();

    await PushNotificationService.register('user-1');
    await PushNotificationService.register('user-2');

    expect(mockRemoveAllListeners).toHaveBeenCalledTimes(1);

    // A token arriving after the switch must persist for user-2, not user-1
    const lastRegistrationCb = mockAddListener.mock.calls
      .filter(([event]) => event === 'registration')
      .at(-1)![1];
    lastRegistrationCb({ value: 'token-after-switch' });
    await flushMicrotasks();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-2', token: 'token-after-switch' }),
      expect.anything(),
    );
  });

  it('unregister deletes the user tokens and removes all listeners', async () => {
    const PushNotificationService = await importService();
    await PushNotificationService.register('user-1');

    await PushNotificationService.unregister('user-1');

    expect(mockFrom).toHaveBeenCalledWith('push_tokens');
    expect(mockDeleteEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockRemoveAllListeners).toHaveBeenCalled();
  });

  it('a token arriving after unregister is not persisted (no stale-user write)', async () => {
    const PushNotificationService = await importService();
    await PushNotificationService.register('user-1');
    const registrationCb = getRegistrationCallback();

    await PushNotificationService.unregister('user-1');
    mockUpsert.mockClear();

    registrationCb({ value: 'late-token' });
    await flushMicrotasks();

    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

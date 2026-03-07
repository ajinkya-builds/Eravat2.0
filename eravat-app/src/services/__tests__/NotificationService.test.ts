import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../NotificationService';
import { supabase } from '../../supabase';

// ── Hoisted mock helpers ──────────────────────────────────────────────────────
const mockSelect   = vi.hoisted(() => vi.fn());
const mockOrder    = vi.hoisted(() => vi.fn());
const mockLimit    = vi.hoisted(() => vi.fn());
const mockUpdate   = vi.hoisted(() => vi.fn());
const mockEq       = vi.hoisted(() => vi.fn());
const mockChannel  = vi.hoisted(() => vi.fn());
const mockOn       = vi.hoisted(() => vi.fn());
const mockSubscribe = vi.hoisted(() => vi.fn());

// Chain: supabase.from(...).select(...).order(...).limit(...)
mockLimit.mockResolvedValue({ data: [], error: null });
mockOrder.mockReturnValue({ limit: mockLimit });
mockSelect.mockReturnValue({ order: mockOrder });

// Chain: supabase.from(...).update(...).eq(...)
mockEq.mockResolvedValue({ error: null });
mockUpdate.mockReturnValue({ eq: mockEq });

// Chain: supabase.channel(...).on(...).subscribe()
mockSubscribe.mockReturnValue({ unsubscribe: vi.fn() });
mockOn.mockReturnValue({ subscribe: mockSubscribe });
mockChannel.mockReturnValue({ on: mockOn });

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      update: mockUpdate,
    })),
    channel: mockChannel,
  },
}));

// ─────────────────────────────────────────────────────────────────────────────

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default chained returns after clearAllMocks
    mockLimit.mockResolvedValue({ data: [], error: null });
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockSelect.mockReturnValue({ order: mockOrder });
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockSubscribe.mockReturnValue({ unsubscribe: vi.fn() });
    mockOn.mockReturnValue({ subscribe: mockSubscribe });
    mockChannel.mockReturnValue({ on: mockOn });
    (supabase.from as any).mockReturnValue({ select: mockSelect, update: mockUpdate });
  });

  // ── getNotifications ───────────────────────────────────────────────────────

  it('getNotifications() returns an empty array when no data', async () => {
    const result = await NotificationService.getNotifications();
    expect(result).toEqual([]);
    expect(supabase.from).toHaveBeenCalledWith('notifications');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(mockLimit).toHaveBeenCalledWith(20);
  });

  it('getNotifications() returns notifications when present', async () => {
    const fakeNotif = { id: 'n1', user_id: 'u1', report_id: 'r1', title: 'Alert', message: 'msg', is_read: false, created_at: '2026-03-07T00:00:00Z' };
    mockLimit.mockResolvedValueOnce({ data: [fakeNotif], error: null });

    const result = await NotificationService.getNotifications(5);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('n1');
    expect(mockLimit).toHaveBeenCalledWith(5);
  });

  it('getNotifications() returns [] on Supabase error (does not throw)', async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

    const result = await NotificationService.getNotifications();
    expect(result).toEqual([]);
  });

  // ── markAsRead ─────────────────────────────────────────────────────────────

  it('markAsRead() calls update with is_read=true and the correct notification id', async () => {
    const result = await NotificationService.markAsRead('notif-123');
    expect(result).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('notifications');
    expect(mockUpdate).toHaveBeenCalledWith({ is_read: true });
    expect(mockEq).toHaveBeenCalledWith('id', 'notif-123');
  });

  it('markAsRead() returns false on Supabase error', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'RLS denied' } });

    const result = await NotificationService.markAsRead('notif-456');
    expect(result).toBe(false);
  });

  // ── markAllAsRead ──────────────────────────────────────────────────────────

  it('markAllAsRead() chains two .eq() calls for user_id and is_read=false', async () => {
    // markAllAsRead chains: .update().eq('user_id', ...).eq('is_read', false)
    const mockEq2 = vi.fn().mockResolvedValue({ error: null });
    mockEq.mockReturnValue({ eq: mockEq2 });

    const result = await NotificationService.markAllAsRead('user-abc');
    expect(result).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({ is_read: true });
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-abc');
    expect(mockEq2).toHaveBeenCalledWith('is_read', false);
  });

  it('markAllAsRead() returns false on Supabase error', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: { message: 'fail' } });
    mockEq.mockReturnValue({ eq: mockEq2 });

    const result = await NotificationService.markAllAsRead('user-xyz');
    expect(result).toBe(false);
  });

  // ── subscribeToNotifications ───────────────────────────────────────────────

  it('subscribeToNotifications() subscribes to the correct per-user channel', () => {
    const cb = vi.fn();
    NotificationService.subscribeToNotifications('user-999', cb);

    expect(supabase.channel).toHaveBeenCalledWith('public:notifications:user_id=eq.user-999');
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: 'user_id=eq.user-999',
      }),
      cb
    );
    expect(mockSubscribe).toHaveBeenCalled();
  });
});

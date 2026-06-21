/**
 * AuthContext OTP flow tests — the send → verify state machine and the
 * H-4 anti-enumeration guarantee: every failed login path must return the
 * same shape (message: 'failed') with a generic error, so an attacker
 * cannot distinguish "phone not registered" from "send failure".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

// ─── Hoisted mock primitives ─────────────────────────────────────────────────

const mockRpc = vi.hoisted(() => vi.fn());
const mockSignInWithOtp = vi.hoisted(() => vi.fn());
const mockVerifyOtp = vi.hoisted(() => vi.fn());
const mockSignInWithPassword = vi.hoisted(() => vi.fn());
const mockGetAal = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } }),
);

vi.mock('../../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: mockVerifyOtp,
      signInWithPassword: mockSignInWithPassword,
      signOut: vi.fn().mockResolvedValue({ error: null }),
      mfa: { getAuthenticatorAssuranceLevel: mockGetAal },
    },
    rpc: mockRpc,
    from: vi.fn(),
  },
}));

vi.mock('../../services/PushNotificationService', () => ({
  PushNotificationService: {
    register: vi.fn().mockResolvedValue(undefined),
    unregister: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── Harness ─────────────────────────────────────────────────────────────────

async function renderAuth() {
  const utils = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(utils.result.current.loading).toBe(false));
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRpc.mockResolvedValue({ data: 'resolved@eravat.app', error: null });
  mockSignInWithOtp.mockResolvedValue({ error: null });
  mockVerifyOtp.mockResolvedValue({ error: null });
  mockSignInWithPassword.mockResolvedValue({ error: null });
  mockGetAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ─── signInWithPhoneOTP: send path ───────────────────────────────────────────

describe('signInWithPhoneOTP', () => {
  it('sends the OTP to the E.164 number built from messy user input', async () => {
    const { result } = await renderAuth();

    let res!: { error: Error | null; message?: string };
    await act(async () => {
      res = await result.current.signInWithPhoneOTP('+91 98765-43210');
    });

    expect(mockRpc).toHaveBeenCalledWith('get_email_by_phone', { p_phone: '9876543210' });
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      phone: '+919876543210',
      options: { channel: 'sms' },
    });
    expect(res).toEqual({ error: null, message: 'otp_sent' });
  });

  it('does NOT send an SMS when the phone is not registered (cost + enumeration guard)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const { result } = await renderAuth();

    let res!: { error: Error | null; message?: string };
    await act(async () => {
      res = await result.current.signInWithPhoneOTP('9876543210');
    });

    expect(mockSignInWithOtp).not.toHaveBeenCalled();
    expect(res.message).toBe('failed');
  });

  it('maps a rate-limit error to a retry-later message, still message: failed', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: 'sms rate limit exceeded' } });
    const { result } = await renderAuth();

    let res!: { error: Error | null; message?: string };
    await act(async () => {
      res = await result.current.signInWithPhoneOTP('9876543210');
    });

    expect(res.message).toBe('failed');
    expect(res.error?.message).toContain('Too many requests');
  });

  it('returns message: failed when the OTP provider errors unexpectedly', async () => {
    mockSignInWithOtp.mockRejectedValue(new Error('network down'));
    const { result } = await renderAuth();

    let res!: { error: Error | null; message?: string };
    await act(async () => {
      res = await result.current.signInWithPhoneOTP('9876543210');
    });

    expect(res.message).toBe('failed');
  });
});

// ─── H-4 regression: anti-enumeration ────────────────────────────────────────

describe('H-4 anti-enumeration', () => {
  it('returns an identical generic error for "phone unknown" and "RPC error"', async () => {
    const { result } = await renderAuth();

    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    let unknownPhone!: { error: Error | null; message?: string };
    await act(async () => {
      unknownPhone = await result.current.signInWithPhoneOTP('9876543210');
    });

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'db error' } });
    let rpcError!: { error: Error | null; message?: string };
    await act(async () => {
      rpcError = await result.current.signInWithPhoneOTP('9876543210');
    });

    expect(unknownPhone.message).toBe('failed');
    expect(rpcError.message).toBe('failed');
    expect(unknownPhone.error?.message).toBe(rpcError.error?.message);
    // No internal detail (phone, email, db error) may leak into the user-facing error
    expect(unknownPhone.error?.message).not.toMatch(/9876543210|db error|not found/i);
  });

  it('password login returns the same generic error for unknown phone and wrong password', async () => {
    const { result } = await renderAuth();

    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    let unknownPhone!: { error: Error | null };
    await act(async () => {
      unknownPhone = await result.current.signInWithPhone('9876543210', 'pw');
    });

    mockRpc.mockResolvedValueOnce({ data: 'real@eravat.app', error: null });
    mockSignInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    let wrongPassword!: { error: Error | null };
    await act(async () => {
      wrongPassword = await result.current.signInWithPhone('9876543210', 'bad-pw');
    });

    expect(unknownPhone.error?.message).toBe(wrongPassword.error?.message);
  });
});

// ─── verifyOTP ───────────────────────────────────────────────────────────────

describe('verifyOTP', () => {
  it('verifies against the E.164 number with type sms', async () => {
    const { result } = await renderAuth();

    let res!: { error: Error | null; mfaRequired?: boolean };
    await act(async () => {
      res = await result.current.verifyOTP('98765 43210', '123456');
    });

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      phone: '+919876543210',
      token: '123456',
      type: 'sms',
    });
    expect(res).toEqual({ error: null, mfaRequired: false });
  });

  it('returns a generic error for an invalid or expired code', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    const { result } = await renderAuth();

    let res!: { error: Error | null };
    await act(async () => {
      res = await result.current.verifyOTP('9876543210', '000000');
    });

    expect(res.error?.message).toBe('Invalid or expired verification code. Please try again.');
  });

  it('requires MFA when the session is aal1 with aal2 available (admin TOTP)', async () => {
    mockGetAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } });
    const { result } = await renderAuth();

    let res!: { error: Error | null; mfaRequired?: boolean };
    await act(async () => {
      res = await result.current.verifyOTP('9876543210', '123456');
    });

    expect(res).toEqual({ error: null, mfaRequired: true });
  });

  it('survives an unexpected throw with a generic error', async () => {
    mockVerifyOtp.mockRejectedValue(new Error('boom'));
    const { result } = await renderAuth();

    let res!: { error: Error | null };
    await act(async () => {
      res = await result.current.verifyOTP('9876543210', '123456');
    });

    expect(res.error?.message).toBe('An unexpected error occurred. Please try again.');
  });
});

// ─── resendOTP ───────────────────────────────────────────────────────────────

describe('resendOTP', () => {
  it('delegates to the same send path (same guards apply)', async () => {
    const { result } = await renderAuth();

    let res!: { error: Error | null; message?: string };
    await act(async () => {
      res = await result.current.resendOTP('9876543210');
    });

    expect(mockSignInWithOtp).toHaveBeenCalledTimes(1);
    expect(res.message).toBe('otp_sent');
  });
});

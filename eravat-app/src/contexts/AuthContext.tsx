/* eslint-disable @typescript-eslint/no-explicit-any, no-empty */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { PushNotificationService } from '../services/PushNotificationService';
import { encryptSession, decryptSession, type EncryptedPayload } from '../utils/crypto';
import {
    isProfileCacheFresh,
    shouldLoadProfileOnAuthEvent,
    shouldRegisterPushOnAuthEvent,
} from '../lib/authPerf';
import { track } from '../lib/analytics';
import { identifyUser, resetUser } from '../lib/posthogClient';
import { logger } from '../lib/logger';
import { clearCachedProfile, loadCachedProfile, saveCachedProfile } from '../lib/profileCache';

// Matches the `profiles` table + joined user_region_assignments
export interface UserProfile {
    id: string;             // = auth.users.id
    role: string;
    first_name: string;
    last_name: string;
    phone?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    // Joined from user_region_assignments
    division_id?: string | null;
    range_id?: string | null;
    beat_id?: string | null;
    // Joined geo names for display
    division_name?: string | null;
    range_name?: string | null;
    beat_name?: string | null;
    notification_radius_km?: number;
    latitude?: number;
    longitude?: number;
    location_updated_at?: string | null;
}

interface AuthContextValue {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    sessionExpired: boolean;
    isLocked: boolean;
    hasSavedSession: boolean;
    clearSessionExpired: () => void;
    signInWithPhoneOTP: (phone: string) => Promise<{ error: Error | null; message?: string }>;
    verifyOTP: (phone: string, token: string) => Promise<{ error: Error | null; mfaRequired?: boolean }>;
    resendOTP: (phone: string) => Promise<{ error: Error | null; message?: string }>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
    unlockWithPIN: (pin: string) => Promise<{ error: Error | null }>;
    registerPIN: (pin: string) => Promise<void>;
    resetPIN: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Strip spaces, dashes, dots; remove +91 or 91 country prefix → 10-digit string */
function normalisePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    // Remove leading 91 (India country code) if number is 12 digits
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    // Remove leading 0 if 11 digits (some users type 0XXXXXXXXXX)
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    return digits;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isCheckingSecureSession, setIsCheckingSecureSession] = useState(() => {
        return localStorage.getItem('eravat_secure_session') !== null;
    });
    const secureSessionCheckCompleted = useRef(false);
    const [sessionExpired, setSessionExpired] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [hasSavedSession, setHasSavedSession] = useState(false);
    // Track whether user was previously authenticated so we can detect expiry
    const wasAuthenticated = useState({ current: false });
    /** Coalesce parallel profile loads (e.g. getSession + onAuthStateChange firing together). */
    const profileInflight = useRef(new Map<string, Promise<void>>());
    /** Log missing profile / fetch errors at most once per user until a profile loads. */
    const profileIssueLogged = useRef(new Set<string>());
    /** In-memory PIN for re-encrypting after token refresh (never persisted). */
    const activePinRef = useRef<string | null>(null);
    /** Avoid profile refetch storms on TOKEN_REFRESHED / concurrent tabs. */
    const profileCacheRef = useRef<{ userId: string | null; fetchedAt: number | null }>({
        userId: null,
        fetchedAt: null,
    });

    const fetchProfile = useCallback(async (userId: string, opts?: { force?: boolean }) => {
        if (
            !opts?.force &&
            isProfileCacheFresh(profileCacheRef.current.userId, userId, profileCacheRef.current.fetchedAt)
        ) {
            return;
        }

        const existing = profileInflight.current.get(userId);
        if (existing) return existing;

        const applyCached = () => {
            const cached = loadCachedProfile<UserProfile>(userId);
            if (cached) {
                setProfile(cached);
                profileCacheRef.current = { userId, fetchedAt: Date.now() };
                return true;
            }
            return false;
        };

        const run = (async () => {
            applyCached();
            try {
                if (import.meta.env.DEV) {
                    console.log('[AuthContext] fetchProfile starting for userId:', userId);
                }
                const query = supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .maybeSingle();
                const timed = Promise.race([
                    query,
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('profile_fetch_timeout')), 8000)
                    ),
                ]);
                const { data: profileData, error: profileError } = await timed;

                if (import.meta.env.DEV) {
                    console.log('[AuthContext] fetchProfile db result:', {
                        hasProfile: !!profileData,
                        profileError,
                    });
                }
                if (profileError) {
                    if (!profileIssueLogged.current.has(userId)) {
                        profileIssueLogged.current.add(userId);
                        logger.warn('AuthContext', 'profiles fetch failed', { message: profileError.message });
                    }
                    if (!applyCached()) setProfile(null);
                    return;
                }

                if (!profileData) {
                    if (!profileIssueLogged.current.has(userId)) {
                        profileIssueLogged.current.add(userId);
                        logger.warn('AuthContext', 'No profiles row for user', { userId });
                    }
                    if (!applyCached()) setProfile(null);
                    return;
                }

                if (profileData.is_active === false) {
                    logger.warn('AuthContext', 'Inactive user attempted access', { userId });
                    await supabase.auth.signOut();
                    setProfile(null);
                    return;
                }

                profileIssueLogged.current.delete(userId);

                const { data: assignment } = await supabase
                    .from('user_region_assignments')
                    .select(`
                    division_id,
                    range_id,
                    beat_id,
                    geo_divisions (name),
                    geo_ranges (name),
                    geo_beats (name)
                `)
                    .eq('user_id', userId)
                    .maybeSingle();

                const nextProfile = {
                    ...profileData,
                    division_id: assignment?.division_id ?? null,
                    range_id: assignment?.range_id ?? null,
                    beat_id: assignment?.beat_id ?? null,
                    division_name: (assignment?.geo_divisions as any)?.name ?? null,
                    range_name: (assignment?.geo_ranges as any)?.name ?? null,
                    beat_name: (assignment?.geo_beats as any)?.name ?? null,
                } as UserProfile;
                setProfile(nextProfile);
                saveCachedProfile(userId, nextProfile as unknown as Record<string, unknown>);
                identifyUser(userId, {
                    role: nextProfile.role,
                    division_id: nextProfile.division_id ?? undefined,
                    range_id: nextProfile.range_id ?? undefined,
                    beat_id: nextProfile.beat_id ?? undefined,
                });
                profileCacheRef.current = { userId, fetchedAt: Date.now() };
            } catch {
                applyCached();
            }
        })();

        profileInflight.current.set(userId, run);
        try {
            await run;
        } finally {
            profileInflight.current.delete(userId);
        }
    }, []);

    const refreshProfile = async () => {
        if (session?.user?.id) await fetchProfile(session.user.id, { force: true });
    };

    useEffect(() => {
        let cancelled = false;

        const checkSecureSession = async () => {
            if (secureSessionCheckCompleted.current) return;

            // The security PIN gate has been removed: sessions now persist
            // natively via the Supabase client (persistSession), so the app
            // opens directly and works offline. Clear any legacy PIN-encrypted
            // blob left by older builds and never lock.
            localStorage.removeItem('eravat_secure_session');
            if (!cancelled) {
                setHasSavedSession(false);
                setIsLocked(false);
                setIsCheckingSecureSession(false);
                secureSessionCheckCompleted.current = true;
            }
        };

        void checkSecureSession();

        const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
            if (import.meta.env.DEV) {
                console.log('[AuthContext] onAuthStateChange event:', event, 'user:', newSession?.user?.id);
            }
            if (cancelled) return;

            // If a saved session is present, ignore incoming state updates until unlocked
            const saved = localStorage.getItem('eravat_secure_session');
            if (saved && event !== 'SIGNED_OUT' && isLocked) {
                if (import.meta.env.DEV) {
                    console.log('[AuthContext] onAuthStateChange ignored because isLocked is true');
                }
                return;
            }

            // Keep PIN-wrapped blob in sync when refresh tokens rotate
            if (
                (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') &&
                newSession &&
                localStorage.getItem('eravat_secure_session') &&
                activePinRef.current
            ) {
                const pin = activePinRef.current;
                void encryptSession(newSession, pin)
                    .then((encrypted) => {
                        localStorage.setItem('eravat_secure_session', JSON.stringify(encrypted));
                    })
                    .catch((err) => {
                        if (import.meta.env.DEV) {
                            console.warn('[AuthContext] Failed to re-encrypt session after refresh:', err);
                        }
                    });
            }

            setSession(newSession);
            if (newSession?.user) {
                wasAuthenticated[0].current = true;
                const userId = newSession.user.id;
                if (
                    shouldLoadProfileOnAuthEvent(event) ||
                    !isProfileCacheFresh(profileCacheRef.current.userId, userId, profileCacheRef.current.fetchedAt)
                ) {
                    void fetchProfile(userId, { force: event === 'USER_UPDATED' });
                }
                if (shouldRegisterPushOnAuthEvent(event)) {
                    PushNotificationService.register(userId).catch(err =>
                        console.error('[AuthContext] Failed to register push notifications:', err)
                    );
                }
            } else {
                profileIssueLogged.current.clear();
                profileCacheRef.current = { userId: null, fetchedAt: null };
                if (wasAuthenticated[0].current && event !== 'SIGNED_OUT') {
                    setSessionExpired(true);
                }
                setProfile(null);
            }
            setLoading(false);
        });

        return () => {
            cancelled = true;
            listener.subscription.unsubscribe();
        };
    }, [fetchProfile, isLocked]);

    const signInWithPhoneOTP = async (phone: string) => {
        try {
            // Step 1: Normalize to last-10-digit string
            const tenDigit = normalisePhone(phone);

            // Step 2: Verify user exists using the check_phone_registered RPC.
            const { data: isRegistered, error: rpcError } = await supabase
                .rpc('check_phone_registered', { p_phone: tenDigit });

            if (rpcError || !isRegistered) {
                logger.warn('AuthContext', 'Phone not enrolled', { reason: rpcError?.message ?? 'not_registered' });
                track('auth.unenrolled_rejected');
                return {
                    error: new Error('Invalid credentials. Please try again.'),
                    message: 'user_not_found'
                };
            }

            // Step 3: Build canonical E.164 phone directly from user input.
            const e164Phone = `+91${tenDigit}`;
            // Step 4: Send OTP.
            const { error } = await supabase.auth.signInWithOtp({
                phone: e164Phone,
                options: {
                    channel: 'sms',
                    // Only pre-provisioned users may log in (no self-signup via OTP)
                    shouldCreateUser: false,
                }
            });

            if (error) {
                const msg = (error.message || '').toLowerCase();
                // Pilot mode: SMS provider may be off while Dashboard Test OTP is configured.
                // verifyOtp still accepts the fixed test code for enrolled numbers.
                const providerDisabled =
                    msg.includes('phone provider') ||
                    msg.includes('unsupported phone provider') ||
                    (error as { code?: string }).code === 'phone_provider_disabled';
                if (providerDisabled) {
                    if (import.meta.env.DEV) {
                        console.warn(
                            '[AuthContext] SMS provider disabled — proceeding to Test OTP verify UI'
                        );
                    }
                    track('auth.otp_sent', { provider: 'test_otp' });
                    return { error: null, message: 'otp_sent' };
                }
                logger.error('AuthContext', 'OTP send failed', error, { error_code: 'send_failed' });
                const isRateLimit = (error as any).status === 429 || 
                                    msg.includes('rate limit') || 
                                    msg.includes('security purposes') ||
                                    msg.includes('once every');
                if (isRateLimit) {
                    track('auth.otp_failed', { error_code: 'rate_limit' });
                    return { error: new Error('Too many requests. Please try again later.'), message: 'rate_limit' };
                }
                track('auth.otp_failed', { error_code: 'send_failed' });
                return { error: new Error('Unable to send verification code. Please try again.'), message: 'send_failed' };
            }
            track('auth.otp_sent', { provider: 'sms' });
            return { error: null, message: 'otp_sent' };

        } catch (err) {
            logger.error('AuthContext', 'Unexpected error in signInWithPhoneOTP', err);
            track('auth.otp_failed', { error_code: 'unexpected_error' });
            return { error: new Error('An unexpected error occurred. Please try again.'), message: 'unexpected_error' };
        }

    };

    const verifyOTP = async (phone: string, token: string) => {
        try {
            // Normalize to last 10 digits then build E.164
            const tenDigit = normalisePhone(phone);
            const storedDigits = tenDigit.replace(/\D/g, '');
            let e164Phone: string;
            if (storedDigits.length === 12 && storedDigits.startsWith('91')) {
                e164Phone = `+${storedDigits}`;
            } else if (storedDigits.length === 10) {
                e164Phone = `+91${storedDigits}`;
            } else {
                e164Phone = `+91${tenDigit}`;
            }
            // Verify OTP via Supabase Auth
            const { error, data } = await supabase.auth.verifyOtp({
                phone: e164Phone,
                token: token,
                type: 'sms'
            });

            if (error) {
                logger.error('AuthContext', 'OTP verification failed', error);
                track('auth.otp_failed', { error_code: 'verify_failed' });
                return {
                    error: new Error('Invalid or expired verification code. Please try again.')
                };
            }

            if (import.meta.env.DEV) {
                console.log('[AuthContext] OTP verified successfully');
            }
            track('auth.otp_verified');
            setSessionExpired(false);

            // Sync session in context immediately (needed for PIN registration step)
            if (data.session) {
                setSession(data.session);
            }

            // Check if MFA is required (for admin users with TOTP)
            const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (aalData && aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2') {
                return { error: null, mfaRequired: true };
            }

            return { error: null, mfaRequired: false };
        } catch (err) {
            logger.error('AuthContext', 'Unexpected error in verifyOTP', err);
            track('auth.otp_failed', { error_code: 'unexpected_error' });
            return {
                error: new Error('An unexpected error occurred. Please try again.')
            };
        }
    };

    const resendOTP = async (phone: string) => {
        return signInWithPhoneOTP(phone);
    };

    const unlockWithPIN = async (pin: string) => {
        try {
            const saved = localStorage.getItem('eravat_secure_session');
            if (!saved) {
                return { error: new Error('No saved session found.') };
            }

            const encryptedPayload = JSON.parse(saved) as EncryptedPayload;
            const decryptedSession = await decryptSession(encryptedPayload, pin) as Session;

            if (!decryptedSession || !decryptedSession.access_token) {
                return { error: new Error('Invalid decrypted session.') };
            }

            // Restore session in Supabase Auth
            const { data: setData, error: sessionError } = await supabase.auth.setSession({
                access_token: decryptedSession.access_token,
                refresh_token: decryptedSession.refresh_token
            });

            if (sessionError) {
                logger.error('AuthContext', 'setSession failed after PIN unlock', sessionError);
                track('auth.pin_unlock_failed', { error_code: 'set_session' });
                return { error: sessionError };
            }

            const liveSession = setData.session ?? decryptedSession;
            activePinRef.current = pin;
            // Re-wrap with possibly-rotated tokens from setSession
            try {
                const encrypted = await encryptSession(liveSession, pin);
                localStorage.setItem('eravat_secure_session', JSON.stringify(encrypted));
            } catch (encErr) {
                if (import.meta.env.DEV) {
                    console.warn('[AuthContext] Failed to re-encrypt after unlock:', encErr);
                }
            }

            // Sync session state & profile in context
            setSession(liveSession);
            await fetchProfile(liveSession.user.id);
            setIsLocked(false);
            track('auth.pin_unlock_succeeded');

            return { error: null };
        } catch (err: any) {
            logger.error('AuthContext', 'PIN unlock failed', err);
            track('auth.pin_unlock_failed', { error_code: 'invalid_pin' });
            return { error: new Error('Invalid PIN. Please try again.') };
        }
    };

    const registerPIN = async (pin: string) => {
        if (!session) {
            logger.warn('AuthContext', 'registerPIN called with no session');
            return;
        }

        try {
            track('auth.pin_setup_started');
            const encrypted = await encryptSession(session, pin);
            localStorage.setItem('eravat_secure_session', JSON.stringify(encrypted));
            activePinRef.current = pin;
            setHasSavedSession(true);
            setIsLocked(false);
            track('auth.pin_setup_completed');
        } catch (err) {
            logger.error('AuthContext', 'Failed to encrypt session with PIN', err);
        }
    };

    const resetPIN = async () => {
        localStorage.removeItem('eravat_secure_session');
        activePinRef.current = null;
        setHasSavedSession(false);
        setIsLocked(false);
        await signOut();
    };

    const signOut = async () => {
        wasAuthenticated[0].current = false; // explicit sign-out, not expiry
        profileIssueLogged.current.clear();
        localStorage.removeItem('eravat_secure_session');
        activePinRef.current = null;
        setHasSavedSession(false);
        setIsLocked(false);
        clearCachedProfile();
        if (session?.user?.id) {
            await PushNotificationService.unregister(session.user.id);
        }
        await supabase.auth.signOut();
        setProfile(null);
        setSessionExpired(false);
        resetUser();
    };

    const clearSessionExpired = () => setSessionExpired(false);

    return (
        <AuthContext.Provider value={{
            session,
            user: session?.user ?? null,
            profile,
            loading: loading || isCheckingSecureSession,
            sessionExpired,
            isLocked,
            hasSavedSession,
            clearSessionExpired,
            signInWithPhoneOTP,
            verifyOTP,
            resendOTP,
            signOut,
            refreshProfile,
            unlockWithPIN,
            registerPIN,
            resetPIN,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

/* eslint-disable @typescript-eslint/no-explicit-any, no-empty */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { PushNotificationService } from '../services/PushNotificationService';
import {
    isProfileCacheFresh,
    shouldLoadProfileOnAuthEvent,
    shouldRegisterPushOnAuthEvent,
} from '../lib/authPerf';
import { track } from '../lib/analytics';
import { identifyUser, resetUser } from '../lib/posthogClient';
import { logger } from '../lib/logger';
import { clearCachedProfile, loadCachedProfile, saveCachedProfile } from '../lib/profileCache';
import { toE164India } from '../lib/phone';
import {
    hasPersistedSupabaseSession,
    isBrowserOffline,
    readPersistedSupabaseSession,
} from '../lib/offlineSession';

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
    clearSessionExpired: () => void;
    signInWithPhoneOTP: (phone: string) => Promise<{ error: Error | null; message?: string }>;
    verifyOTP: (phone: string, token: string) => Promise<{ error: Error | null }>;
    resendOTP: (phone: string) => Promise<{ error: Error | null; message?: string }>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [sessionExpired, setSessionExpired] = useState(false);
    // Track whether user was previously authenticated so we can detect expiry
    const wasAuthenticated = useState({ current: false });
    /** Coalesce parallel profile loads (e.g. getSession + onAuthStateChange firing together). */
    const profileInflight = useRef(new Map<string, Promise<void>>());
    /** Log missing profile / fetch errors at most once per user until a profile loads. */
    const profileIssueLogged = useRef(new Set<string>());
    /** Avoid profile refetch storms on TOKEN_REFRESHED / concurrent tabs. */
    const profileCacheRef = useRef<{ userId: string | null; fetchedAt: number | null }>({
        userId: null,
        fetchedAt: null,
    });
    /** Ignore transient null-session events during cold start / offline token refresh. */
    const bootstrappingRef = useRef(true);

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
        let initialSettled = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        // Drop PIN-wrapped blobs from older builds; session lives in Supabase persistSession.
        localStorage.removeItem('eravat_secure_session');
        localStorage.removeItem('eravat_bypass_pin_lock');

        const AUTH_INIT_TIMEOUT_MS = 8_000;

        const bootstrapTimer = setTimeout(() => {
            bootstrappingRef.current = false;
        }, 12_000);

        const applyCachedForUser = (userId: string) => {
            const cached = loadCachedProfile<UserProfile>(userId);
            if (cached) {
                setProfile(cached);
                profileCacheRef.current = { userId, fetchedAt: Date.now() };
            }
        };

        /** Prefer disk tokens when Auth returns null (common offline expired-JWT refresh). */
        const resolveSession = (fromAuth: Session | null, reason: string): Session | null => {
            if (fromAuth?.user) return fromAuth;
            const local = readPersistedSupabaseSession();
            if (!local?.user) return fromAuth;
            track('auth.offline_session_hydrated', {
                reason,
                offline: isBrowserOffline(),
                had_auth_session: Boolean(fromAuth),
            });
            return local;
        };

        const applyInitialSession = (newSession: Session | null) => {
            if (cancelled) return;
            // Always clear the hang watchdog, but still apply a late session even if we
            // already cleared the loading spinner (common on slow Android cold starts).
            if (timeoutId !== undefined) {
                clearTimeout(timeoutId);
                timeoutId = undefined;
            }
            const firstApply = !initialSettled;
            initialSettled = true;
            setSession(newSession);
            if (newSession?.user) {
                wasAuthenticated[0].current = true;
                const userId = newSession.user.id;
                // Apply disk cache first so offline cold starts can leave the spinner.
                applyCachedForUser(userId);
                void fetchProfile(userId);
                if (typeof navigator === 'undefined' || navigator.onLine) {
                    PushNotificationService.register(userId).catch(err =>
                        console.error('[AuthContext] Failed to register push notifications:', err)
                    );
                }
            }
            if (firstApply || newSession) setLoading(false);
        };

        // getSession() can hang while offline when token refresh retries. Cap wait so
        // a persisted session + cached profile can still open the app.
        timeoutId = setTimeout(() => {
            if (cancelled || initialSettled) return;
            logger.warn('AuthContext', 'Auth init exceeded timeout; hydrating from local session if present', {
                supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
                persisted: hasPersistedSupabaseSession(),
                offline: isBrowserOffline(),
            });
            track('auth.init_timeout', {
                persisted: hasPersistedSupabaseSession(),
                offline: isBrowserOffline(),
            });
            const hydrated = resolveSession(null, 'init_timeout');
            if (hydrated) {
                applyInitialSession(hydrated);
                return;
            }
            // Do not mark initialSettled — a late getSession / INITIAL_SESSION must still apply.
            setLoading(false);
        }, AUTH_INIT_TIMEOUT_MS);

        void supabase.auth
            .getSession()
            .then(({ data: { session: existing } }) => {
                if (cancelled) return;
                if (timeoutId !== undefined) clearTimeout(timeoutId);
                applyInitialSession(resolveSession(existing, 'get_session_null'));
            })
            .catch((err) => {
                if (cancelled) return;
                if (timeoutId !== undefined) clearTimeout(timeoutId);
                logger.warn('AuthContext', 'getSession failed', {
                    message: err instanceof Error ? err.message : String(err),
                    persisted: hasPersistedSupabaseSession(),
                    offline: isBrowserOffline(),
                });
                track('auth.get_session_failed', {
                    persisted: hasPersistedSupabaseSession(),
                    offline: isBrowserOffline(),
                });
                const hydrated = resolveSession(null, 'get_session_error');
                if (hydrated) {
                    applyInitialSession(hydrated);
                    return;
                }
                if (!hasPersistedSupabaseSession()) {
                    applyInitialSession(null);
                } else if (!initialSettled) {
                    setLoading(false);
                }
            });

        const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
            if (import.meta.env.DEV) {
                console.log('[AuthContext] onAuthStateChange event:', event, 'user:', newSession?.user?.id);
            }
            if (cancelled) return;

            if (newSession?.user) {
                setSession(newSession);
                wasAuthenticated[0].current = true;
                const userId = newSession.user.id;
                applyCachedForUser(userId);
                if (
                    shouldLoadProfileOnAuthEvent(event) ||
                    !isProfileCacheFresh(profileCacheRef.current.userId, userId, profileCacheRef.current.fetchedAt)
                ) {
                    void fetchProfile(userId, { force: event === 'USER_UPDATED' });
                }
                if (shouldRegisterPushOnAuthEvent(event) && (typeof navigator === 'undefined' || navigator.onLine)) {
                    PushNotificationService.register(userId).catch(err =>
                        console.error('[AuthContext] Failed to register push notifications:', err)
                    );
                }
            } else if (event === 'SIGNED_OUT') {
                profileIssueLogged.current.clear();
                profileCacheRef.current = { userId: null, fetchedAt: null };
                setSession(null);
                setProfile(null);
                setSessionExpired(false);
            } else {
                // TOKEN_REFRESHED / INITIAL_SESSION can emit null while offline refresh fails.
                // Keep disk tokens + cached profile so the app still opens.
                const offline = isBrowserOffline();
                const local = readPersistedSupabaseSession();
                if (local?.user && (offline || bootstrappingRef.current)) {
                    track('auth.offline_session_hydrated', {
                        reason: `auth_event_${event || 'unknown'}`,
                        offline,
                    });
                    setSession(local);
                    wasAuthenticated[0].current = true;
                    applyCachedForUser(local.user.id);
                } else {
                    const persisted = hasPersistedSupabaseSession();
                    setSession(null);
                    profileIssueLogged.current.clear();
                    profileCacheRef.current = { userId: null, fetchedAt: null };
                    const treatAsExpiry =
                        wasAuthenticated[0].current &&
                        !bootstrappingRef.current &&
                        !offline &&
                        !persisted;
                    if (treatAsExpiry) {
                        setSessionExpired(true);
                    }
                    if (!persisted && !offline) {
                        setProfile(null);
                    }
                }
            }
            setLoading(false);
        });

        return () => {
            cancelled = true;
            clearTimeout(bootstrapTimer);
            if (timeoutId !== undefined) clearTimeout(timeoutId);
            listener.subscription.unsubscribe();
        };
    }, [fetchProfile]);

    const signInWithPhoneOTP = async (phone: string) => {
        try {
            if (isBrowserOffline()) {
                track('auth.otp_failed', { error_code: 'offline' });
                return {
                    error: new Error('Internet required to sign in. Connect and try again.'),
                    message: 'offline',
                };
            }
            const e164Phone = toE164India(phone);
            if (!e164Phone) {
                return {
                    error: new Error('Please enter a valid phone number'),
                    message: 'invalid_phone',
                };
            }
            const tenDigit = e164Phone.slice(-10);

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
            const e164Phone = toE164India(phone);
            if (!e164Phone) {
                return { error: new Error('Please enter a valid phone number') };
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

            if (data.session) {
                setSession(data.session);
            }

            return { error: null };
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

    const signOut = async () => {
        wasAuthenticated[0].current = false; // explicit sign-out, not expiry
        profileIssueLogged.current.clear();
        localStorage.removeItem('eravat_secure_session');
        localStorage.removeItem('eravat_bypass_pin_lock');
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
            loading,
            sessionExpired,
            clearSessionExpired,
            signInWithPhoneOTP,
            verifyOTP,
            resendOTP,
            signOut,
            refreshProfile,
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

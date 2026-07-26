/* eslint-disable @typescript-eslint/no-explicit-any, no-empty */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { PushNotificationService } from '../services/PushNotificationService';
import { encryptSession, decryptSession, type EncryptedPayload } from '../utils/crypto';

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

    const fetchProfile = useCallback(async (userId: string) => {
        const existing = profileInflight.current.get(userId);
        if (existing) return existing;

        const run = (async () => {
            try {
                if (import.meta.env.DEV) {
                    console.log('[AuthContext] fetchProfile starting for userId:', userId);
                }
                const { data: profileData, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .maybeSingle();

                if (import.meta.env.DEV) {
                    console.log('[AuthContext] fetchProfile db result:', {
                        hasProfile: !!profileData,
                        profileError,
                    });
                }
                if (profileError) {
                    if (!profileIssueLogged.current.has(userId)) {
                        profileIssueLogged.current.add(userId);
                        console.warn('[AuthContext] profiles fetch failed:', profileError.message);
                    }
                    setProfile(null);
                    return;
                }

                if (!profileData) {
                    if (!profileIssueLogged.current.has(userId)) {
                        profileIssueLogged.current.add(userId);
                        console.warn(
                            '[AuthContext] No profiles row for this user. If you just deployed DB fixes, run the profiles backfill migration; id:',
                            userId
                        );
                    }
                    setProfile(null);
                    return;
                }

                if (profileData.is_active === false) {
                    console.warn('[AuthContext] Inactive user attempted access:', userId);
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

                setProfile({
                    ...profileData,
                    division_id: assignment?.division_id ?? null,
                    range_id: assignment?.range_id ?? null,
                    beat_id: assignment?.beat_id ?? null,
                    division_name: (assignment?.geo_divisions as any)?.name ?? null,
                    range_name: (assignment?.geo_ranges as any)?.name ?? null,
                    beat_name: (assignment?.geo_beats as any)?.name ?? null,
                } as UserProfile);
            } catch {
                // Profile fetch failed
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
        if (session?.user?.id) await fetchProfile(session.user.id);
    };

    useEffect(() => {
        let cancelled = false;

        const checkSecureSession = async () => {
            if (secureSessionCheckCompleted.current) return;

            const saved = localStorage.getItem('eravat_secure_session');
            if (saved) {
                // E2E-only bypass — never active in production builds
                if (
                    import.meta.env.DEV &&
                    localStorage.getItem('eravat_bypass_pin_lock') === 'true'
                ) {
                    try {
                        const encryptedPayload = JSON.parse(saved) as EncryptedPayload;
                        const decryptedSession = await decryptSession(encryptedPayload, '1111');
                        const { error: setSessionErr } = await supabase.auth.setSession({
                            access_token: decryptedSession.access_token,
                            refresh_token: decryptedSession.refresh_token
                        });
                        if (setSessionErr) {
                            throw setSessionErr;
                        }
                        if (!cancelled) {
                            setSession(decryptedSession);
                            void fetchProfile(decryptedSession.user.id);
                            setHasSavedSession(true);
                            setIsLocked(false);
                            setIsCheckingSecureSession(false);
                            secureSessionCheckCompleted.current = true;
                        }
                        return;
                    } catch (err) {
                        console.error('[AuthContext] E2E auto-unlock failed:', err);
                        if (!cancelled) {
                            setHasSavedSession(true);
                            setIsLocked(true);
                            setIsCheckingSecureSession(false);
                            secureSessionCheckCompleted.current = true;
                        }
                    }
                } else {
                    if (!cancelled) {
                        setHasSavedSession(true);
                        setIsLocked(true);
                        setIsCheckingSecureSession(false);
                        secureSessionCheckCompleted.current = true;
                    }
                }
            } else {
                if (!cancelled) {
                    setHasSavedSession(false);
                    setIsLocked(false);
                    setIsCheckingSecureSession(false);
                    secureSessionCheckCompleted.current = true;
                }
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
                void fetchProfile(newSession.user.id);
                PushNotificationService.register(newSession.user.id).catch(err =>
                    console.error('[AuthContext] Failed to register push notifications:', err)
                );
            } else {
                profileIssueLogged.current.clear();
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
                console.warn('[AuthContext] Phone not found via RPC:', tenDigit);
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
                    return { error: null, message: 'otp_sent' };
                }
                console.error('[AuthContext] OTP send error:', error);
                const isRateLimit = (error as any).status === 429 || 
                                    msg.includes('rate limit') || 
                                    msg.includes('security purposes') ||
                                    msg.includes('once every');
                if (isRateLimit) {
                    return { error: new Error('Too many requests. Please try again later.'), message: 'rate_limit' };
                }
                return { error: new Error('Unable to send verification code. Please try again.'), message: 'send_failed' };
            }
            return { error: null, message: 'otp_sent' };

        } catch (err) {
            console.error('[AuthContext] Unexpected error in signInWithPhoneOTP:', err);
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
                console.error('[AuthContext] OTP verification error:', error);
                return {
                    error: new Error('Invalid or expired verification code. Please try again.')
                };
            }

            if (import.meta.env.DEV) {
                console.log('[AuthContext] OTP verified successfully');
            }
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
            console.error('[AuthContext] Unexpected error in verifyOTP:', err);
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
                console.error('[AuthContext] setSession failed:', sessionError);
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

            return { error: null };
        } catch (err: any) {
            console.error('[AuthContext] PIN unlock failed:', err);
            return { error: new Error('Invalid PIN. Please try again.') };
        }
    };

    const registerPIN = async (pin: string) => {
        if (!session) {
            console.warn('[AuthContext] registerPIN called but no active session exists.');
            return;
        }

        try {
            const encrypted = await encryptSession(session, pin);
            localStorage.setItem('eravat_secure_session', JSON.stringify(encrypted));
            activePinRef.current = pin;
            setHasSavedSession(true);
            setIsLocked(false);
        } catch (err) {
            console.error('[AuthContext] Failed to encrypt session with PIN:', err);
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
        if (session?.user?.id) {
            await PushNotificationService.unregister(session.user.id);
        }
        await supabase.auth.signOut();
        setProfile(null);
        setSessionExpired(false);
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

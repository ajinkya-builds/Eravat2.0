import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { PushNotificationService } from '../services/PushNotificationService';

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
    signIn: (email: string, password: string) => Promise<{ error: Error | null; mfaRequired?: boolean }>;
    signInWithPhone: (phone: string, password: string) => Promise<{ error: Error | null; mfaRequired?: boolean }>;
    signInWithPhoneOTP: (phone: string) => Promise<{ error: Error | null; message?: string }>;
    verifyOTP: (phone: string, token: string) => Promise<{ error: Error | null; mfaRequired?: boolean }>;
    resendOTP: (phone: string) => Promise<{ error: Error | null; message?: string }>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** If Supabase cannot reach the host (DNS/offline), `getSession()` may never settle while refresh retries run. */
const AUTH_INIT_TIMEOUT_MS = 12_000;

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
    const [sessionExpired, setSessionExpired] = useState(false);
    // Track whether user was previously authenticated so we can detect expiry
    const wasAuthenticated = useState({ current: false });
    /** Coalesce parallel profile loads (e.g. getSession + onAuthStateChange firing together). */
    const profileInflight = useRef(new Map<string, Promise<void>>());
    /** Log missing profile / fetch errors at most once per user until a profile loads. */
    const profileIssueLogged = useRef(new Set<string>());

    const fetchProfile = useCallback(async (userId: string) => {
        const existing = profileInflight.current.get(userId);
        if (existing) return existing;

        const run = (async () => {
            try {
                const { data: profileData, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .maybeSingle();

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
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        const applyInitialSession = (session: Session | null) => {
            if (cancelled) return;
            setSession(session);
            if (session?.user) {
                wasAuthenticated[0].current = true;
                void fetchProfile(session.user.id);
                PushNotificationService.register(session.user.id).catch(err =>
                    console.error('[AuthContext] Failed to register push notifications:', err)
                );
            }
            setLoading(false);
        };

        timeoutId = setTimeout(() => {
            if (cancelled) return;
            console.warn(
                '[AuthContext] Auth init exceeded timeout; check network/DNS and VITE_SUPABASE_URL.',
                import.meta.env.VITE_SUPABASE_URL
            );
            // Drop stale refresh tokens so GoTrue stops retrying refresh against an unreachable host.
            void supabase.auth.signOut({ scope: 'local' }).finally(() => {
                if (!cancelled) setLoading(false);
            });
        }, AUTH_INIT_TIMEOUT_MS);

        supabase.auth
            .getSession()
            .then(({ data: { session } }) => {
                if (cancelled) return;
                if (timeoutId !== undefined) clearTimeout(timeoutId);
                applyInitialSession(session);
            })
            .catch(err => {
                if (cancelled) return;
                if (timeoutId !== undefined) clearTimeout(timeoutId);
                console.error('[AuthContext] getSession failed:', err);
                applyInitialSession(null);
            });

        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            if (session?.user) {
                wasAuthenticated[0].current = true;
                void fetchProfile(session.user.id);
                PushNotificationService.register(session.user.id).catch(err =>
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
            if (timeoutId !== undefined) clearTimeout(timeoutId);
            listener.subscription.unsubscribe();
        };
    }, [fetchProfile]);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error as Error | null };
    };

    const signInWithPhone = async (phone: string, password: string) => {
        const normalisedPhone = normalisePhone(phone);

        // Step 1: resolve email from phone via Postgres function
        const { data: email, error: rpcError } = await supabase
            .rpc('get_email_by_phone', { p_phone: normalisedPhone });

        // Use generic error messages to prevent user enumeration
        if (rpcError || !email) {
            return { error: new Error('Invalid credentials. Please try again.') };
        }

        // Step 2: sign in with the resolved email + password
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            return { error: new Error('Invalid credentials. Please try again.') };
        }

        setSessionExpired(false);

        // Step 3: check if MFA verification is needed (admin users with TOTP enrolled)
        const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalData && aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2') {
            return { error: null, mfaRequired: true };
        }

        return { error: null, mfaRequired: false };
    };
    const signInWithPhoneOTP = async (phone: string) => {
        try {
            // Step 1: Normalize to last-10-digit string (same as password login)
            const tenDigit = normalisePhone(phone);

            // Step 2: Verify user exists using the get_email_by_phone RPC.
            // This does last-10-digit matching so it handles all stored formats
            // (+91-XXXXXXXXXX, +91XXXXXXXXXX, 919XXXXXXXXX, etc.)
            const { data: resolvedEmail, error: rpcError } = await supabase
                .rpc('get_email_by_phone', { p_phone: tenDigit });

            if (rpcError || !resolvedEmail) {
                console.warn('[AuthContext] Phone not found via RPC:', tenDigit);
                return {
                    error: new Error('Invalid credentials. Please try again.'),
                    message: 'user_not_found'
                };
            }

            // Step 3: Build canonical E.164 phone directly from user input.
            // We know tenDigit is 10 digits (normalisePhone guarantees this for Indian numbers).
            // Do NOT query profiles here — RLS blocks anon reads before login.
            const e164Phone = `+91${tenDigit}`;
            // Step 4: Send OTP.
            // Removing `shouldCreateUser: false` because GoTrue has a bug where it throws 422
            // even on exact matches. Identity mapping resolves ghost users.
            const { error } = await supabase.auth.signInWithOtp({
                phone: e164Phone,
                options: {
                    channel: 'sms',
                }
            });

            if (error) {
                console.error('[AuthContext] OTP send error:', error);
                if (error.message.includes('rate limit')) {
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
            const { error } = await supabase.auth.verifyOtp({
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
        // Resend is the same as initial send
        return signInWithPhoneOTP(phone);
    };

    const signOut = async () => {
        wasAuthenticated[0].current = false; // explicit sign-out, not expiry
        profileIssueLogged.current.clear();
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
            loading,
            sessionExpired,
            clearSessionExpired,
            signIn,
            signInWithPhone,
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

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase';

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
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
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
    const [sessionExpired, setSessionExpired] = useState(false);
    // Track whether user was previously authenticated so we can detect expiry
    const wasAuthenticated = useState({ current: false });

    const fetchProfile = async (userId: string) => {
        try {
            // profiles.id = auth.users.id (no auth_id column)
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (!profileData) {
                setProfile(null);
                return;
            }

            // Fetch regional assignment separately
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
    };

    const refreshProfile = async () => {
        if (session?.user?.id) await fetchProfile(session.user.id);
    };

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session?.user) {
                wasAuthenticated[0].current = true;
                fetchProfile(session.user.id);
            }
            setLoading(false);
        });

        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            if (session?.user) {
                wasAuthenticated[0].current = true;
                fetchProfile(session.user.id);
            } else {
                // If we had a session before and now it's gone (not an explicit sign-out)
                if (wasAuthenticated[0].current && event !== 'SIGNED_OUT') {
                    setSessionExpired(true);
                }
                setProfile(null);
            }
            setLoading(false);
        });

        return () => listener.subscription.unsubscribe();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

    const signOut = async () => {
        wasAuthenticated[0].current = false; // explicit sign-out, not expiry
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

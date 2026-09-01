import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { hasPersistedSupabaseSession, isBrowserOffline } from '../lib/offlineSession';

const ADMIN_ROLES = ['admin', 'ccf', 'dfo'];
const PROFILE_LOAD_TIMEOUT_MS = 30_000;

function RouteLoadingScreen({ message }: { message?: string }) {
    const { t } = useLanguage();
    return (
        <div className="flex items-center justify-center h-screen bg-background">
            <div className="flex flex-col items-center gap-4 px-6 text-center">
                <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <p className="text-muted-foreground text-sm">{message ?? t('loading')}</p>
            </div>
        </div>
    );
}

function ProfileRetryScreen({ offline }: { offline: boolean }) {
    const { t } = useLanguage();
    const { refreshProfile } = useAuth();
    const [retrying, setRetrying] = useState(false);

    const handleRetry = async () => {
        setRetrying(true);
        try {
            await refreshProfile();
        } finally {
            setRetrying(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-background p-6">
            <div className="max-w-sm w-full space-y-4 text-center">
                <p className="text-foreground font-semibold">
                    {offline ? t('auth.profileOfflineTitle') : t('auth.profileLoadFailed')}
                </p>
                <p className="text-sm text-muted-foreground">
                    {offline ? t('auth.profileOfflineBody') : t('auth.profileLoadFailedBody')}
                </p>
                {!offline && (
                    <button
                        type="button"
                        onClick={() => void handleRetry()}
                        disabled={retrying}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={retrying ? 'animate-spin' : ''} />
                        {t('history.retry')}
                    </button>
                )}
            </div>
        </div>
    );
}

export function ProtectedRoute() {
    const { session, profile, loading } = useAuth();
    const location = useLocation();
    const [timedOut, setTimedOut] = useState(false);
    const offline = isBrowserOffline();

    useEffect(() => {
        if (!loading && session && !profile) {
            const timer = setTimeout(() => setTimedOut(true), PROFILE_LOAD_TIMEOUT_MS);
            return () => clearTimeout(timer);
        }
        setTimedOut(false);
    }, [loading, session, profile]);

    if (loading) {
        return <RouteLoadingScreen />;
    }

    if (!session) {
        if (offline && hasPersistedSupabaseSession()) {
            return <RouteLoadingScreen message={undefined} />;
        }
        return <Navigate to="/login" replace />;
    }

    if (!profile) {
        if (!timedOut) {
            return <RouteLoadingScreen />;
        }
        return <ProfileRetryScreen offline={offline} />;
    }

    const needsLocation =
        profile.latitude == null
        || profile.longitude == null
        || !Number.isFinite(profile.latitude)
        || !Number.isFinite(profile.longitude);

    if (needsLocation && !location.pathname.startsWith('/profile/complete-location')) {
        return <Navigate to="/profile/complete-location" replace />;
    }

    return <Outlet />;
}

export function AdminRoute() {
    const { session, profile, loading } = useAuth();
    const [timedOut, setTimedOut] = useState(false);
    const offline = isBrowserOffline();

    useEffect(() => {
        if (!loading && session && !profile) {
            const timer = setTimeout(() => setTimedOut(true), PROFILE_LOAD_TIMEOUT_MS);
            return () => clearTimeout(timer);
        }
        setTimedOut(false);
    }, [loading, session, profile]);

    if (loading) {
        return <RouteLoadingScreen />;
    }

    if (!session) {
        if (offline && hasPersistedSupabaseSession()) {
            return <RouteLoadingScreen />;
        }
        return <Navigate to="/login" replace />;
    }

    if (!profile) {
        if (!timedOut) {
            return <RouteLoadingScreen />;
        }
        return <ProfileRetryScreen offline={offline} />;
    }

    if (!ADMIN_ROLES.includes(profile.role)) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}

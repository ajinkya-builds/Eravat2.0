import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const ADMIN_ROLES = ['admin', 'ccf', 'dfo'];
const PROFILE_LOAD_TIMEOUT_MS = 15_000;
const PROFILE_LOAD_TIMEOUT_OFFLINE_MS = 3_000;

function isBrowserOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function RouteLoadingScreen() {
    const { t } = useLanguage();
    return (
        <div className="flex items-center justify-center h-screen bg-background">
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <p className="text-muted-foreground text-sm">{t('loading')}</p>
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
            const waitMs = offline ? PROFILE_LOAD_TIMEOUT_OFFLINE_MS : PROFILE_LOAD_TIMEOUT_MS;
            const timer = setTimeout(() => setTimedOut(true), waitMs);
            return () => clearTimeout(timer);
        }
        setTimedOut(false);
    }, [loading, session, profile, offline]);

    if (loading || (session && !profile && !timedOut)) {
        return <RouteLoadingScreen />;
    }

    // Offline + persisted session but no profile cache: stay on a loading-style
    // dead-end rather than OTP login (OTP cannot succeed offline).
    if (session && !profile && timedOut && offline) {
        return <RouteLoadingScreen />;
    }

    if (!session || timedOut || !profile) {
        return <Navigate to="/login" replace />;
    }

    const needsLocation =
        profile.latitude == null
        || profile.longitude == null
        || !Number.isFinite(profile.latitude)
        || !Number.isFinite(profile.longitude);

    // GPS works offline — still allow complete-location. Skip only when we have
    // no chance of completing the gate without network AND no coords yet is fine
    // for field report GPS (device GPS). Profile location gate stays.
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
            const waitMs = offline ? PROFILE_LOAD_TIMEOUT_OFFLINE_MS : PROFILE_LOAD_TIMEOUT_MS;
            const timer = setTimeout(() => setTimedOut(true), waitMs);
            return () => clearTimeout(timer);
        }
        setTimedOut(false);
    }, [loading, session, profile, offline]);

    if (loading || (session && !profile && !timedOut)) {
        return <RouteLoadingScreen />;
    }

    if (session && !profile && timedOut && offline) {
        return <RouteLoadingScreen />;
    }

    if (!session || timedOut) {
        return <Navigate to="/login" replace />;
    }

    if (!profile || !ADMIN_ROLES.includes(profile.role)) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}

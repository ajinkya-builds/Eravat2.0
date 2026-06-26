import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PINLockScreen from './PINLockScreen';

const ADMIN_ROLES = ['admin', 'ccf', 'dfo'];
const PROFILE_LOAD_TIMEOUT_MS = 15_000;

function RouteLoadingScreen() {
    return (
        <div className="flex items-center justify-center h-screen bg-background">
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <p className="text-muted-foreground text-sm">Loading...</p>
            </div>
        </div>
    );
}

export function ProtectedRoute() {
    const { session, profile, loading, isLocked } = useAuth();
    const location = useLocation();
    const [timedOut, setTimedOut] = useState(false);

    useEffect(() => {
        if (!loading && session && !profile) {
            const timer = setTimeout(() => setTimedOut(true), PROFILE_LOAD_TIMEOUT_MS);
            return () => clearTimeout(timer);
        }
        setTimedOut(false);
    }, [loading, session, profile]);

    if (loading || (session && !profile && !timedOut)) {
        return <RouteLoadingScreen />;
    }

    if (isLocked) {
        return <PINLockScreen />;
    }

    if (!session || timedOut || !profile) {
        return <Navigate to="/login" replace />;
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
    const { session, profile, loading, isLocked } = useAuth();
    const [timedOut, setTimedOut] = useState(false);

    useEffect(() => {
        if (!loading && session && !profile) {
            const timer = setTimeout(() => setTimedOut(true), PROFILE_LOAD_TIMEOUT_MS);
            return () => clearTimeout(timer);
        }
        setTimedOut(false);
    }, [loading, session, profile]);

    if (loading || (session && !profile && !timedOut)) {
        return <RouteLoadingScreen />;
    }

    if (isLocked) {
        return <PINLockScreen />;
    }

    if (!session || timedOut) {
        return <Navigate to="/login" replace />;
    }

    if (!profile || !ADMIN_ROLES.includes(profile.role)) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}

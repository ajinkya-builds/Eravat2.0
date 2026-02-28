import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ADMIN_ROLES = ['admin', 'ccf', 'dfo'];
const PROFILE_LOAD_TIMEOUT_MS = 15_000;

export function ProtectedRoute() {
    const { session, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    <p className="text-muted-foreground text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    if (!session) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}

export function AdminRoute() {
    const { session, profile, loading } = useAuth();
    const [timedOut, setTimedOut] = useState(false);

    // Timeout to prevent infinite spinner if profile fetch fails
    useEffect(() => {
        if (!loading && session && !profile) {
            const timer = setTimeout(() => setTimedOut(true), PROFILE_LOAD_TIMEOUT_MS);
            return () => clearTimeout(timer);
        }
        setTimedOut(false);
    }, [loading, session, profile]);

    // Show spinner while auth or profile is still loading (with timeout)
    if (loading || (session && !profile && !timedOut)) {
        return (
            <div className="flex items-center justify-center h-screen bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    <p className="text-muted-foreground text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    if (!session || timedOut) {
        return <Navigate to="/login" replace />;
    }

    if (!profile || !ADMIN_ROLES.includes(profile.role)) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}

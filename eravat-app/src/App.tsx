import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import { useEffect, lazy, Suspense } from 'react';
import { Network } from '@capacitor/network';
import { syncData } from './services/syncService';

// Route-level code splitting: everything below loads on demand, keeping the
// initial chunk small for slow rural connections. The PWA service worker
// precaches all chunks, so offline use is unaffected.
const ReportActivityPage = lazy(() => import('./pages/ReportActivityPage'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const EditProfile = lazy(() => import('./pages/profile/EditProfile'));
const Settings = lazy(() => import('./pages/profile/AppSettings'));
const PrivacySecurity = lazy(() => import('./pages/profile/PrivacySecurity'));
const HelpSupport = lazy(() => import('./pages/profile/HelpSupport'));
const CompleteProfileLocation = lazy(() => import('./pages/profile/CompleteProfileLocation'));
const OnboardVolunteer = lazy(() => import('./pages/OnboardVolunteer'));
const FAQ = lazy(() => import('./pages/profile/FAQ'));
const PrivacyPolicy = lazy(() => import('./pages/profile/PrivacyPolicy'));
const MapPage = lazy(() => import('./pages/MapPage'));
const TerritoryHistory = lazy(() => import('./pages/TerritoryHistory'));
const AdminLayout = lazy(() => import('./layouts/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminObservations = lazy(() => import('./pages/admin/AdminObservations'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminDivisions = lazy(() => import('./pages/admin/AdminDivisions'));
const AdminConflictDashboard = lazy(() => import('./pages/admin/AdminConflictDashboard'));
const AdminLiveDashboard = lazy(() => import('./pages/admin/AdminLiveDashboard'));
const AdminLatestEntries = lazy(() => import('./pages/admin/AdminLatestEntries'));
const AdminUserStats = lazy(() => import('./pages/admin/AdminUserStats'));
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

function shouldAutoSync(connectionType: string): boolean {
  try {
    const saved = localStorage.getItem('eravat_app_settings');
    if (!saved) return true;
    const { autoSync = true, wifiOnly = false } = JSON.parse(saved) as {
      autoSync?: boolean;
      wifiOnly?: boolean;
    };
    if (!autoSync) return false;
    if (wifiOnly && connectionType !== 'wifi') return false;
    return true;
  } catch {
    return true;
  }
}

function NetworkSync() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return;

    const maybeSync = (connected: boolean, connectionType: string) => {
      if (connected && shouldAutoSync(connectionType)) {
        void syncData();
      }
    };

    Network.getStatus().then(status => {
      maybeSync(status.connected, status.connectionType);
    });
    let cancelled = false;
    let handle: Awaited<ReturnType<typeof Network.addListener>> | null = null;
    Network.addListener('networkStatusChange', status => {
      maybeSync(status.connected, status.connectionType);
    }).then(h => {
      if (cancelled) { h.remove(); } else { handle = h; }
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [session]);
  return null;
}

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <NetworkSync />
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />

              {/* Protected App Shell */}
              <Route element={<ProtectedRoute />}>
                  <Route path="/profile/complete-location" element={<CompleteProfileLocation />} />
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/map" element={<MapPage />} />
                  <Route path="/report" element={<ReportActivityPage />} />
                  <Route path="/profile" element={<UserProfile />} />
                  <Route path="/profile/edit" element={<EditProfile />} />
                  <Route path="/history" element={<TerritoryHistory />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/privacy" element={<PrivacySecurity />} />
                  <Route path="/help" element={<HelpSupport />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/volunteers/onboard" element={<OnboardVolunteer />} />
                </Route>

              </Route>

              {/* Admin Navigation Branch — role-guarded */}
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="conflict" element={<AdminConflictDashboard />} />
                  <Route path="live" element={<AdminLiveDashboard />} />
                  <Route path="latest" element={<AdminLatestEntries />} />
                  <Route path="user-stats" element={<AdminUserStats />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="divisions" element={<AdminDivisions />} />
                  <Route path="observations" element={<AdminObservations />} />
                  <Route path="notifications" element={<AdminNotifications />} />
                  <Route path="settings" element={<AdminSettings />} />
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { AppLayout } from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { AdminLayout } from './layouts/admin/AdminLayout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import { Network } from '@capacitor/network';
import { scheduleSyncAllPending } from './lib/appSync';
import { Loader2 } from 'lucide-react';
import { ScreenAnalytics } from './components/ScreenAnalytics';
import { InteractionAnalytics } from './components/InteractionAnalytics';
import { ReportIssueWidget } from './components/ReportIssueWidget';
import { ScrollToTop } from './components/ScrollToTop';
import { useAndroidBackButton } from './hooks/useAndroidBackButton';
import { useAppLifecycleSync } from './hooks/useAppLifecycleSync';
import { track } from './lib/analytics';

const ReportActivityPage = lazy(() => import('./pages/ReportActivityPage'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const EditProfile = lazy(() => import('./pages/profile/EditProfile'));
const Settings = lazy(() => import('./pages/profile/AppSettings'));
const PrivacySecurity = lazy(() => import('./pages/profile/PrivacySecurity'));
const HelpSupport = lazy(() => import('./pages/profile/HelpSupport'));
const CompleteProfileLocation = lazy(() => import('./pages/profile/CompleteProfileLocation'));
const OnboardVolunteer = lazy(() => import('./pages/OnboardVolunteer'));
const OnboardVillager = lazy(() => import('./pages/OnboardVillager'));
const VillagersList = lazy(() => import('./pages/VillagersList'));
const VillagerDetail = lazy(() => import('./pages/VillagerDetail'));
const NearbySightings = lazy(() => import('./pages/NearbySightings'));
const FAQ = lazy(() => import('./pages/profile/FAQ'));
const PrivacyPolicy = lazy(() => import('./pages/profile/PrivacyPolicy'));
const MapPage = lazy(() => import('./pages/MapPage'));
const TerritoryHistory = lazy(() => import('./pages/TerritoryHistory'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminObservations = lazy(() => import('./pages/admin/AdminObservations'));
const AdminMap = lazy(() => import('./pages/admin/AdminMap'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminDivisions = lazy(() => import('./pages/admin/AdminDivisions'));
const AdminConflictDashboard = lazy(() => import('./pages/admin/AdminConflictDashboard'));
const AdminLiveDashboard = lazy(() => import('./pages/admin/AdminLiveDashboard'));
const AdminLatestEntries = lazy(() => import('./pages/admin/AdminLatestEntries'));
const AdminUserStats = lazy(() => import('./pages/admin/AdminUserStats'));
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications'));
const AdminVillagers = lazy(() => import('./pages/admin/AdminVillagers'));
const AdminSupport = lazy(() => import('./pages/admin/AdminSupport'));

function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-6 h-6 animate-spin" aria-label="Loading" />
    </div>
  );
}

function NetworkSync() {
  const { session } = useAuth();
  const wasOfflineRef = useRef(false);

  useAppLifecycleSync(Boolean(session));

  useEffect(() => {
    if (!session) return;

    const scheduleIfNeeded = (reason: 'initial' | 'reconnect') => {
      if (reason === 'reconnect' && !wasOfflineRef.current) {
        return;
      }
      wasOfflineRef.current = false;
      // Shared debounce with native eravat-network-online (see appSync).
      scheduleSyncAllPending(reason);
    };

    Network.getStatus().then(status => {
      wasOfflineRef.current = !status.connected;
      if (status.connected) scheduleIfNeeded('initial');
    });

    const listener = Network.addListener('networkStatusChange', status => {
      if (!status.connected) {
        wasOfflineRef.current = true;
        track('network.went_offline');
        return;
      }
      track('network.came_online');
      scheduleIfNeeded('reconnect');
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, [session]);

  return null;
}

function AppRoutes() {
  useAndroidBackButton();

  return (
    <>
      <ScrollToTop />
      <ScreenAnalytics />
      <InteractionAnalytics />
      <ReportIssueWidget />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
                <Route path="/login" element={<Login />} />

                <Route element={<ProtectedRoute />}>
                  <Route path="/profile/complete-location" element={<CompleteProfileLocation />} />
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/map" element={<MapPage />} />
                    <Route path="/report" element={<ReportActivityPage />} />
                    <Route path="/profile" element={<UserProfile />} />
                    <Route path="/profile/edit" element={<EditProfile />} />
                    <Route path="/history" element={<TerritoryHistory />} />
                    <Route path="/nearby" element={<NearbySightings />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/privacy" element={<PrivacySecurity />} />
                    <Route path="/help" element={<HelpSupport />} />
                    <Route path="/faq" element={<FAQ />} />
                    <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                    <Route path="/volunteers/onboard" element={<OnboardVolunteer />} />
                    <Route path="/villagers/onboard" element={<OnboardVillager />} />
                    <Route path="/villagers/:id" element={<VillagerDetail />} />
                    <Route path="/villagers" element={<VillagersList />} />
                  </Route>
                </Route>

                <Route element={<AdminRoute />}>
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminDashboard />} />
                    <Route path="conflict" element={<AdminConflictDashboard />} />
                    <Route path="live" element={<AdminLiveDashboard />} />
                    <Route path="latest" element={<AdminLatestEntries />} />
                    <Route path="user-stats" element={<AdminUserStats />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="villagers" element={<AdminVillagers />} />
                    <Route path="divisions" element={<AdminDivisions />} />
                    <Route path="observations" element={<AdminObservations />} />
                    <Route path="map" element={<AdminMap />} />
                    <Route path="notifications" element={<AdminNotifications />} />
                    <Route path="support" element={<AdminSupport />} />
                    <Route path="settings" element={<AdminSettings />} />
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <NetworkSync />
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ReportActivityPage from './pages/ReportActivityPage';
import UserProfile from './pages/UserProfile';
import EditProfile from './pages/profile/EditProfile';
import Settings from './pages/profile/AppSettings';
import PrivacySecurity from './pages/profile/PrivacySecurity';
import HelpSupport from './pages/profile/HelpSupport';
import CompleteProfileLocation from './pages/profile/CompleteProfileLocation';
import OnboardVolunteer from './pages/OnboardVolunteer';
import OnboardVillager from './pages/OnboardVillager';
import VillagersList from './pages/VillagersList';
import NearbySightings from './pages/NearbySightings';
import FAQ from './pages/profile/FAQ';
import PrivacyPolicy from './pages/profile/PrivacyPolicy';
import MapPage from './pages/MapPage';
import { AdminLayout } from './layouts/admin/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminObservations from './pages/admin/AdminObservations';
import AdminMap from './pages/admin/AdminMap';
import AdminSettings from './pages/admin/AdminSettings';
import AdminDivisions from './pages/admin/AdminDivisions';
import AdminConflictDashboard from './pages/admin/AdminConflictDashboard';
import AdminLiveDashboard from './pages/admin/AdminLiveDashboard';
import AdminLatestEntries from './pages/admin/AdminLatestEntries';
import AdminUserStats from './pages/admin/AdminUserStats';
import AdminNotifications from './pages/admin/AdminNotifications';
import TerritoryHistory from './pages/TerritoryHistory';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import { useEffect } from 'react';
import { Network } from '@capacitor/network';
import { syncData } from './services/syncService';

// Auto-upload is always on once connectivity returns (review §5.2): there is no
// longer a user toggle or a "Wi-Fi only" restriction to accidentally block it.
function shouldAutoSync(): boolean {
  return true;
}

function NetworkSync() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return;

    const maybeSync = (connected: boolean) => {
      if (connected && shouldAutoSync()) {
        void syncData();
      }
    };

    Network.getStatus().then(status => {
      maybeSync(status.connected);
    });
    const listener = Network.addListener('networkStatusChange', status => {
      maybeSync(status.connected);
    });
    return () => { listener.then(l => l.remove()); };
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
                  <Route path="/nearby" element={<NearbySightings />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/privacy" element={<PrivacySecurity />} />
                  <Route path="/help" element={<HelpSupport />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/volunteers/onboard" element={<OnboardVolunteer />} />
                  <Route path="/villagers/onboard" element={<OnboardVillager />} />
                  <Route path="/villagers" element={<VillagersList />} />
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
                  <Route path="map" element={<AdminMap />} />
                  <Route path="notifications" element={<AdminNotifications />} />
                  <Route path="settings" element={<AdminSettings />} />
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;

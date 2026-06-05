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
import FAQ from './pages/profile/FAQ';
import PrivacyPolicy from './pages/profile/PrivacyPolicy';
import MapPage from './pages/MapPage';
import { AdminLayout } from './layouts/admin/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminObservations from './pages/admin/AdminObservations';
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
    const listener = Network.addListener('networkStatusChange', status => {
      maybeSync(status.connected, status.connectionType);
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
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ReportActivityPage from './pages/ReportActivityPage';
import UserProfile from './pages/UserProfile';
import EditProfile from './pages/profile/EditProfile';
import Settings from './pages/Settings';
import PrivacySecurity from './pages/profile/PrivacySecurity';
import HelpSupport from './pages/profile/HelpSupport';
import FAQ from './pages/profile/FAQ';
import PrivacyPolicy from './pages/profile/PrivacyPolicy';
import { AdminLayout } from './layouts/admin/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminObservations from './pages/admin/AdminObservations';
import AdminSettings from './pages/admin/AdminSettings';
import AdminDivisions from './pages/admin/AdminDivisions';
import TerritoryHistory from './pages/TerritoryHistory';
import MapPage from './pages/MapPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import { useEffect } from 'react';
import { Network } from '@capacitor/network';
import { syncData } from './services/syncService';

function NetworkSync() {
  const { session } = useAuth();

  useEffect(() => {
    // Only sync when user is authenticated
    if (!session) return;

    Network.getStatus().then(status => {
      if (status.connected) syncData();
    });
    const listener = Network.addListener('networkStatusChange', status => {
      if (status.connected) syncData();
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
          <BrowserRouter>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />

              {/* Protected App Shell */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/report" element={<ReportActivityPage />} />
                  <Route path="/profile" element={<UserProfile />} />
                  <Route path="/profile/edit" element={<EditProfile />} />
                  <Route path="/history" element={<TerritoryHistory />} />
                  <Route path="/map" element={<MapPage />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/privacy" element={<PrivacySecurity />} />
                  <Route path="/help" element={<HelpSupport />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                </Route>

              </Route>

              {/* Admin Navigation Branch — role-guarded */}
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="divisions" element={<AdminDivisions />} />
                  <Route path="observations" element={<AdminObservations />} />
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

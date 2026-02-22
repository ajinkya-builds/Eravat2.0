import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ReportActivityPage from './pages/ReportActivityPage';
import UserProfile from './pages/UserProfile';
import EditProfile from './pages/profile/EditProfile';
import AppSettings from './pages/profile/AppSettings';
import PrivacySecurity from './pages/profile/PrivacySecurity';
import HelpSupport from './pages/profile/HelpSupport';
import FAQ from './pages/profile/FAQ';
import PrivacyPolicy from './pages/profile/PrivacyPolicy';
import { AdminLayout } from './layouts/admin/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminObservations from './pages/admin/AdminObservations';
import AdminSettings from './pages/admin/AdminSettings';
import TerritoryHistory from './pages/TerritoryHistory';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useEffect } from 'react';
import { Network } from '@capacitor/network';
import { I18nextProvider } from 'react-i18next';
import { syncData } from './services/syncService';
import './i18n'; // Initialize i18n
import i18n from './i18n';

function NetworkSync() {
  useEffect(() => {
    Network.getStatus().then(status => {
      if (status.connected) syncData();
    });
    const listener = Network.addListener('networkStatusChange', status => {
      if (status.connected) syncData();
    });
    return () => { listener.then(l => l.remove()); };
  }, []);
  return null;
}

// Applies theme and language on boot globally
function AppPreferences() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem('eravat_app_settings');
      if (saved) {
        const { theme, language } = JSON.parse(saved);

        // Apply Theme
        const root = document.documentElement;
        if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }

        // Apply Language (Basic HTML lang tag, actual translation framework requires i18next)
        if (language) {
          const langCode = language === 'hindi' ? 'hi' : 'en';
          document.documentElement.lang = langCode;
          i18n.changeLanguage(langCode);
        }
      }
    } catch (e) { }
  }, []);
  return null;
}

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <AppPreferences />
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
                <Route path="/map" element={<div className="p-8 text-center text-muted-foreground mt-20">Map Component Coming Soon</div>} />
                <Route path="/settings" element={<AppSettings />} />
                <Route path="/privacy" element={<PrivacySecurity />} />
                <Route path="/help" element={<HelpSupport />} />
                <Route path="/faq" element={<FAQ />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              </Route>

              {/* Admin Navigation Branch */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="observations" element={<AdminObservations />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nextProvider>
  );
}

export default App;
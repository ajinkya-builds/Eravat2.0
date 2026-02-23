import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ReportActivityPage from './pages/ReportActivityPage';
import UserProfile from './pages/UserProfile';
import { AdminLayout } from './layouts/admin/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminObservations from './pages/admin/AdminObservations';
import AdminSettings from './pages/admin/AdminSettings';
import AdminDivisions from './pages/admin/AdminDivisions';
import TerritoryHistory from './pages/TerritoryHistory';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useEffect } from 'react';
import { Network } from '@capacitor/network';
import { syncData } from './services/syncService';

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

function App() {
  return (
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
              <Route path="/history" element={<TerritoryHistory />} />
              <Route path="/map" element={<div className="p-8 text-center text-muted-foreground mt-20">Map Component Coming Soon</div>} />
              <Route path="/settings" element={<div className="p-8 text-center text-muted-foreground mt-20">Settings Coming Soon</div>} />
              <Route path="/privacy" element={<div className="p-8 text-center text-muted-foreground mt-20">Privacy Policy Coming Soon</div>} />
              <Route path="/help" element={<div className="p-8 text-center text-muted-foreground mt-20">Help & Support Coming Soon</div>} />
            </Route>

            {/* Admin Navigation Branch */}
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
  );
}

export default App;
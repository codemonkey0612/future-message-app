import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Spinner from './components/common/Spinner';

// Lazy load components for code splitting
const CampaignView = lazy(() => import('./pages/client/CampaignView'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const CampaignList = lazy(() => import('./pages/admin/CampaignList'));
const CampaignEditor = lazy(() => import('./pages/admin/CampaignEditor'));
const AdminRegister = lazy(() => import('./pages/admin/AdminRegister'));
const LineCallback = lazy(() => import('./pages/line/LineCallback'));

const App: React.FC = () => {
  return (
    <AppProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Spinner /></div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/admin/clients" replace />} />
            <Route path="/campaign/:id" element={<CampaignView />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/register" element={<AdminRegister />} />
            <Route path="/line/callback" element={<LineCallback />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="clients" replace />} />
              <Route path="clients" element={<CampaignList />} />
              <Route path="clients/:clientId/campaigns" element={<CampaignList />} />
              <Route path="clients/:clientId/campaigns/new" element={<CampaignEditor />} />
              <Route path="clients/:clientId/campaigns/edit/:id" element={<CampaignEditor />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProvider>
  );
};

export default App;
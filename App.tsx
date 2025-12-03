import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';

import CampaignView from './pages/client/CampaignView';
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './pages/admin/AdminLayout';
import CampaignList from './pages/admin/CampaignList';
import CampaignEditor from './pages/admin/CampaignEditor';
import AdminRegister from './pages/admin/AdminRegister';
import LineCallback from './pages/line/LineCallback';

const App: React.FC = () => {
  return (
    <AppProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </AppProvider>
  );
};

export default App;
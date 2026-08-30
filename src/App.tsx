import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { usePOSStore } from './store/posStore';
import { POSBillingScreen } from './pages/POSBillingScreen';
import { POSDashboardPage } from './pages/POSDashboardPage';
import { POSLoginPage } from './pages/POSLoginPage';
import { POSTerminalActivationPage } from './pages/POSTerminalActivationPage';

export function App() {
  const { session, setSession } = usePOSStore();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    const termId = localStorage.getItem('pos_terminal_id');
    const branchId = localStorage.getItem('pos_branch_id');
    if (termId && branchId && !session) {
      setSession({
        cashierName: 'Cashier Staff',
        cashierUid: 'pos_cashier_01',
        terminalId: termId,
        branchId: branchId,
        branchName: branchId === 'main_branch' ? 'Olive Pizza — Rajnandgaon (HQ)' : 'Olive Pizza Branch',
        franchiseId: 'fra_primary',
        organizationId: 'org_olive_pizza',
      });
      setIsAuthenticated(true);
    } else if (session) {
      setIsAuthenticated(true);
    }
  }, [session, setSession]);

  const handleLogout = () => {
    localStorage.removeItem('pos_terminal_id');
    localStorage.removeItem('pos_branch_id');
    setSession(null);
    setIsAuthenticated(false);
  };

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0E1524',
            color: '#fff',
            border: '1px solid #1E293B',
            fontSize: '12px',
            borderRadius: '12px',
          },
          success: {
            iconTheme: {
              primary: '#F97316',
              secondary: '#FFFFFF',
            },
          },
        }}
      />

      <Routes>
        <Route path="/activate" element={<POSTerminalActivationPage />} />
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/billing" replace />
            ) : (
              <POSLoginPage onLoginSuccess={() => setIsAuthenticated(true)} />
            )
          }
        />
        <Route
          path="/billing"
          element={
            isAuthenticated ? (
              <POSBillingScreen onLogout={handleLogout} />
            ) : (
              <Navigate to="/activate" replace />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            isAuthenticated ? (
              <POSDashboardPage />
            ) : (
              <Navigate to="/activate" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/billing" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

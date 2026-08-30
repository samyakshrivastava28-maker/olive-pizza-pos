import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { usePOSStore } from './store/posStore';
import { POSBillingScreen } from './pages/POSBillingScreen';
import { POSDashboardPage } from './pages/POSDashboardPage';
import { POSLoginPage } from './pages/POSLoginPage';
import { POSTerminalActivationPage } from './pages/POSTerminalActivationPage';

export function App() {
  const { session, isAuthChecking, isAuthorized, initAuth, logout } = usePOSStore();

  useEffect(() => {
    const unsub = initAuth();
    return () => unsub();
  }, []);

  if (isAuthChecking) {
    return (
      <div className="h-screen w-screen bg-[#090D16] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Verifying POS Terminal Session...</p>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
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
            isAuthorized && session ? (
              <Navigate to="/billing" replace />
            ) : (
              <POSLoginPage onLoginSuccess={() => {}} />
            )
          }
        />
        <Route
          path="/billing"
          element={
            isAuthorized && session ? (
              <POSBillingScreen onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            isAuthorized && session ? (
              <POSDashboardPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to={isAuthorized && session ? "/billing" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

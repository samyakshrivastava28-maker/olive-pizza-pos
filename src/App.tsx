import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { usePOSStore } from './store/posStore';
import { POSBillingScreen } from './pages/POSBillingScreen';
import { POSDashboardPage } from './pages/POSDashboardPage';
import { POSLoginPage } from './pages/POSLoginPage';
import { POSTerminalActivationPage } from './pages/POSTerminalActivationPage';
import { AppRestrictedScreen } from './components/common/AppRestrictedScreen';
import POSPushNotificationManager from './services/POSPushNotificationManager';
import { POSPinUnlockScreen } from './components/pos/POSPinUnlockScreen';

export function App() {
  const { session, user, isAuthChecking, isAuthorized, restrictedReason, restrictedEmail, clearRestricted, initAuth, logout } = usePOSStore();
  const [isPinUnlocked, setIsPinUnlocked] = React.useState<boolean>(() => {
    return sessionStorage.getItem('pos_pin_unlocked') === 'true';
  });

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

  if (restrictedReason) {
    return (
      <AppRestrictedScreen
        appName="Olive Pizza POS & Billing"
        userEmail={restrictedEmail || undefined}
        reason={restrictedReason}
        onRetry={() => {
          clearRestricted();
          initAuth();
        }}
        onSignOut={async () => {
          clearRestricted();
          sessionStorage.removeItem('pos_pin_unlocked');
          setIsPinUnlocked(false);
          await logout();
        }}
      />
    );
  }

  const handleLogout = async () => {
    sessionStorage.removeItem('pos_pin_unlocked');
    setIsPinUnlocked(false);
    await logout();
  };

  // If user is authenticated and authorized, enforce 4-digit PIN unlock
  if (isAuthorized && session && !isPinUnlocked) {
    return (
      <POSPinUnlockScreen
        userEmail={user?.email || session?.email}
        onUnlockSuccess={() => setIsPinUnlocked(true)}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <HashRouter>
      <POSPushNotificationManager />
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
    </HashRouter>
  );
}

export default App;

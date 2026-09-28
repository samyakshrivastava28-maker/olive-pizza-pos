import React from 'react';
import { ShieldAlert, LogOut, RefreshCw, HelpCircle, Clock, XCircle } from 'lucide-react';
import { AppLogo } from './AppLogo';

interface AppRestrictedScreenProps {
  appName?: string;
  userEmail?: string;
  reason?: string;
  status?: string | null;
  onRetry?: () => void;
  onSignOut: () => void;
}

export const AppRestrictedScreen: React.FC<AppRestrictedScreenProps> = ({
  appName = 'Olive Pizza POS & Billing',
  userEmail,
  reason = 'This account is not authorized to use this Olive Pizza application.',
  status,
  onRetry,
  onSignOut,
}) => {
  const isPending = status === 'PENDING_OWNER_APPROVAL';
  const isRejected = status === 'ACCOUNT_REJECTED';

  return (
    <div className="min-h-screen bg-[#070A10] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      <div className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none ${
        isPending ? 'bg-amber-500/10' : 'bg-rose-950/20'
      }`} />

      <div className={`w-full max-w-md bg-[#0C1220] border rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 text-center space-y-6 ${
        isPending ? 'border-amber-500/40' : 'border-rose-900/40'
      }`}>
        <div className="flex justify-center">
          <AppLogo variant="full" size="md" subtitle="Point of Sale System" />
        </div>

        <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-lg ${
          isPending
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-amber-950/30'
            : 'bg-rose-500/10 border border-rose-500/30 text-rose-400 shadow-rose-950/30'
        }`}>
          {isPending ? <Clock className="w-8 h-8" /> : isRejected ? <XCircle className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
        </div>

        <div className="space-y-2">
          <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase border ${
            isPending
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}>
            {isPending ? 'Pending Owner Approval' : isRejected ? 'Request Rejected' : 'Access Restricted'}
          </span>
          <h1 className="text-lg sm:text-xl font-black text-white">
            {isPending ? 'Waiting for Owner Approval' : appName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 font-medium">
            {reason}
          </p>
        </div>

        {userEmail && (
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 font-mono break-all">
            Attempted Account: <strong className="text-white">{userEmail}</strong>
          </div>
        )}

        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-left text-xs text-slate-400 space-y-2">
          <div className="flex items-center gap-1.5 text-slate-200 font-semibold text-xs">
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span>Why was access restricted?</span>
          </div>
          <ul className="space-y-1.5 text-[11px] text-slate-400 list-disc list-inside">
            <li>Customer accounts are not permitted in store operational tools.</li>
            <li>Cashiers and staff must be explicitly provisioned by the Store Owner.</li>
            <li>If you are a cashier, ask your manager to bind your account to this terminal.</li>
          </ul>
        </div>

        <div className="space-y-2 pt-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 active:scale-[0.99]"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Authorization Check</span>
            </button>
          )}

          <button
            onClick={onSignOut}
            className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Sign In with Different Account</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppRestrictedScreen;

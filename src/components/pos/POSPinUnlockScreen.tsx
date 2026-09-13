import React, { useState, useEffect } from 'react';
import { Lock, Sparkles, LogOut, ShieldAlert, KeyRound } from 'lucide-react';
import { BACKEND_URL } from '../../lib/api';
import { auth } from '../../lib/firebase';
import { AppLogo } from '../common/AppLogo';
import toast from 'react-hot-toast';

interface POSPinUnlockScreenProps {
  onUnlockSuccess: () => void;
  onLogout: () => void;
  userEmail?: string;
}

export const POSPinUnlockScreen: React.FC<POSPinUnlockScreenProps> = ({
  onUnlockSuccess,
  onLogout,
  userEmail
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number>(3);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check whether PIN is configured or locked on load
  const checkPinStatus = async () => {
    setChecking(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const idToken = await currentUser.getIdToken();

      const res = await fetch(`${BACKEND_URL}/api/auth/pos/pin/status`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsConfigured(data.configured);
        setIsLocked(data.locked || false);
        if (data.lockedUntil) setLockedUntil(data.lockedUntil);
      } else {
        setIsConfigured(true);
      }
    } catch (err) {
      console.warn('[POSPinUnlock] Status check error:', err);
      setIsConfigured(true);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkPinStatus();
  }, []);

  // Handler: Setup first-time PIN
  const handleSetupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      toast.error('PIN must be exactly 4 numeric digits.');
      return;
    }
    if (pin !== confirmPin) {
      toast.error('PIN confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');
      const idToken = await currentUser.getIdToken();

      const res = await fetch(`${BACKEND_URL}/api/auth/pos/pin/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ pin })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to setup PIN');

      toast.success('4-Digit PIN configured successfully! 🍕');
      sessionStorage.setItem('pos_pin_unlocked', 'true');
      onUnlockSuccess();
    } catch (err: any) {
      toast.error(err.message || 'PIN setup failed');
    } finally {
      setLoading(false);
    }
  };

  // Handler: Verify PIN
  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      toast.error('Please enter your 4-digit PIN.');
      return;
    }

    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');
      const idToken = await currentUser.getIdToken();

      const res = await fetch(`${BACKEND_URL}/api/auth/pos/pin/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ pin })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Terminal Unlocked! 🍕');
        sessionStorage.setItem('pos_pin_unlocked', 'true');
        onUnlockSuccess();
      } else {
        if (data.locked) {
          setIsLocked(true);
          toast.error(data.message || 'PIN locked due to too many failed attempts.');
        } else {
          setRemainingAttempts(data.remainingAttempts ?? 0);
          toast.error(data.message || 'Incorrect PIN');
          setPin('');
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'PIN verification failed');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const [lockCountdown, setLockCountdown] = useState<string>('');

  useEffect(() => {
    if (!isLocked || !lockedUntil) return;
    const interval = setInterval(() => {
      const remainingMs = lockedUntil - Date.now();
      if (remainingMs <= 0) {
        setIsLocked(false);
        setLockedUntil(null);
        setLockCountdown('');
        clearInterval(interval);
      } else {
        const mins = Math.floor(remainingMs / 60000);
        const secs = Math.floor((remainingMs % 60000) / 1000);
        setLockCountdown(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isLocked, lockedUntil]);

  if (checking) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#090D16] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Verifying PIN Security Layer...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-[#090D16] text-white flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-sm sm:max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 sm:space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-center">
          <AppLogo variant="full" size="lg" subtitle="Point of Sale" />
        </div>

        <div className="space-y-1.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 mb-1">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg sm:text-xl font-black text-white">
            {isConfigured === false ? 'Set Up 4-Digit PIN' : 'Enter Operational PIN'}
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
            {isConfigured === false
              ? 'Configure your 4-digit operational PIN for this terminal.'
              : 'App reopened. Enter your 4-digit operational PIN to unlock billing.'}
          </p>
          {userEmail && (
            <span className="inline-block px-3 py-1 bg-slate-950 rounded-lg text-[11px] font-mono text-slate-400 mt-1 border border-slate-800 break-all max-w-full">
              {userEmail}
            </span>
          )}
        </div>

        {isLocked ? (
          <div className="p-4 sm:p-5 bg-rose-500/10 border border-rose-500/30 rounded-2xl space-y-2 text-rose-300 text-xs">
            <ShieldAlert className="w-8 h-8 mx-auto text-rose-400 animate-pulse" />
            <p className="font-bold text-sm">Terminal PIN Locked</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Too many incorrect PIN attempts. PIN unlock is temporarily locked for 15 minutes to protect terminal security.
            </p>
            {lockCountdown && (
              <p className="text-base font-mono font-black text-rose-400 tracking-wider pt-1">
                Lockout ends in: {lockCountdown}
              </p>
            )}
          </div>
        ) : isConfigured === false ? (
          /* First-time PIN setup */
          <form onSubmit={handleSetupPin} className="space-y-4">
            <div className="text-left">
              <label className="text-xs font-bold text-slate-300 block mb-1.5">Create 4-Digit PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                required
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3.5 text-center text-2xl font-mono font-black text-amber-400 tracking-[0.4em] focus:outline-none focus:border-amber-500 min-h-[48px]"
              />
            </div>

            <div className="text-left">
              <label className="text-xs font-bold text-slate-300 block mb-1.5">Confirm 4-Digit PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                required
                placeholder="••••"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3.5 text-center text-2xl font-mono font-black text-amber-400 tracking-[0.4em] focus:outline-none focus:border-amber-500 min-h-[48px]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || pin.length !== 4 || confirmPin.length !== 4}
              className="w-full min-h-[48px] py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs sm:text-sm transition shadow-lg shadow-amber-500/20 disabled:opacity-50 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? 'Configuring...' : 'Save & Unlock Terminal'}
            </button>
          </form>
        ) : (
          /* Normal PIN unlock */
          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={4}
                autoFocus
                required
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3.5 text-center text-3xl font-mono font-black text-amber-400 tracking-[0.4em] focus:outline-none focus:border-amber-500 min-h-[52px]"
              />
            </div>

            {remainingAttempts < 3 && (
              <p className="text-[11px] font-medium text-amber-400">
                {remainingAttempts} attempt{remainingAttempts === 1 ? '' : 's'} remaining before 15-min lockout.
              </p>
            )}

            <button
              type="submit"
              disabled={loading || pin.length !== 4}
              className="w-full min-h-[48px] py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs sm:text-sm transition shadow-lg shadow-amber-500/20 disabled:opacity-50 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? 'Verifying...' : 'Unlock POS'}
            </button>
          </form>
        )}

        <div className="pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[44px] px-4 text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1.5 mx-auto transition cursor-pointer active:scale-95"
          >
            <LogOut size={14} /> Switch Account / Log Out
          </button>
        </div>
      </div>
    </div>
  );
};

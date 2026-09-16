import React, { useState } from 'react';
import { usePOSStore } from '../store/posStore';
import { auth } from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  signInWithCredential,
  GoogleAuthProvider, 
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  User as FirebaseUser 
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { BACKEND_URL } from '../lib/api';
import { 
  Monitor, 
  KeyRound, 
  User, 
  ShieldCheck, 
  Phone,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { AppLogo } from '../components/common/AppLogo';
import toast from 'react-hot-toast';
import { requestPostLoginNotificationPermissions } from '../services/notificationPermissionService';

interface POSLoginPageProps {
  onLoginSuccess: () => void;
}

export const POSLoginPage: React.FC<POSLoginPageProps> = ({ onLoginSuccess }) => {
  const { setSession } = usePOSStore();

  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [terminalId] = useState(() => localStorage.getItem('pos_terminal_id') || '');
  const [branchId] = useState(() => localStorage.getItem('pos_branch_id') || '');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [requestingReset, setRequestingReset] = useState(false);

  // Authorize User Role & Permissions via Server Gateway
  const verifyUserAuthorization = async (user: FirebaseUser): Promise<{ isAuthorized: boolean; user?: any; role: string; name: string; denialReason?: string }> => {
    const userEmail = (user.email || '').toLowerCase().trim();

    try {
      const idToken = await user.getIdToken();
      const resp = await fetch(`${BACKEND_URL}/api/auth/authorize-app`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          targetApp: 'POS',
          terminalId: terminalId || undefined,
          requestedBranchId: branchId || undefined
        })
      });

      const authData = await resp.json().catch(() => null);

      if (resp.status === 429) {
        return {
          isAuthorized: false,
          role: 'none',
          name: '',
          denialReason: authData?.reason || 'Too many login attempts. Please try again later.'
        };
      }

      if (resp.ok && authData?.authorized) {
        const u = authData.user;
        if (!u.branchId || !u.franchiseId) {
          return {
            isAuthorized: false,
            role: 'none',
            name: '',
            denialReason: 'POS access denied: No authorized franchise or branch scope assigned to this account.'
          };
        }
        return {
          isAuthorized: true,
          user: u,
          role: u.role || 'pos_operator',
          name: u.name || user.displayName || userEmail.split('@')[0]
        };
      } else {
        const denialReason = authData?.reason || 'This account is not authorized to use the Olive Pizza POS terminal.';
        return {
          isAuthorized: false,
          role: 'unauthorized',
          name: user.displayName || 'Operator',
          denialReason
        };
      }
    } catch (netErr: any) {
      console.warn('[POS Auth] Server check failed:', netErr);
      return {
        isAuthorized: false,
        role: 'unauthorized',
        name: user.displayName || 'Operator',
        denialReason: 'Unable to verify account authorization with Olive Pizza server.'
      };
    }
  };

  const finalizeSession = (uid: string, cashierName: string, serverUser?: any) => {
    const assignedFranchiseId = serverUser?.franchiseId;
    const assignedBranchId = serverUser?.branchId;
    const resolvedTerminalId = serverUser?.terminalId || `pos_${assignedFranchiseId}`;

    if (!assignedFranchiseId || !assignedBranchId) {
      toast.error('Access denied: No franchise or branch scope assigned to this account.');
      return;
    }

    localStorage.setItem('pos_terminal_id', resolvedTerminalId);
    localStorage.setItem('pos_branch_id', assignedBranchId);
    localStorage.setItem('pos_franchise_id', assignedFranchiseId);

    setSession({
      cashierName,
      cashierUid: uid,
      terminalId: resolvedTerminalId,
      branchId: assignedBranchId,
      branchName: serverUser?.branchName || 'Olive Pizza',
      franchiseId: assignedFranchiseId,
      organizationId: serverUser?.organizationId || 'org_olive_pizza',
      role: serverUser?.role || 'pos_operator',
      isOwnerMode: serverUser?.role === 'owner' || serverUser?.role === 'admin'
    });

    toast.success(`Welcome ${cashierName}! POS authenticated.`);
    requestPostLoginNotificationPermissions().catch(() => {});
    onLoginSuccess();
  };

  // 1. Email / Password Login Handler
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your POS account email.');
      return;
    }

    setLoading(true);
    try {
      const userCred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCred.user;

      // Authorize with server
      const authCheck = await verifyUserAuthorization(user);
      if (!authCheck.isAuthorized) {
        await signOut(auth);
        usePOSStore.setState({
          user: null,
          session: null,
          isAuthorized: false,
          restrictedReason: authCheck.denialReason || 'Access Denied: Terminal restricted to authorized store staff.',
          restrictedEmail: user.email || ''
        });
        toast.error(authCheck.denialReason || 'Access Denied.');
        setLoading(false);
        return;
      }

      finalizeSession(user.uid, authCheck.name, authCheck.user);
    } catch (err: any) {
      console.error('[POS Login Error]', err);
      const msg = err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : (err.message || 'Login failed');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // 2. Phone OTP Login Handler
  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }

    setPhoneLoading(true);
    try {
      let recaptcha = (window as any).posRecaptchaVerifier;
      if (!recaptcha) {
        recaptcha = new RecaptchaVerifier(auth, 'pos-recaptcha-container', {
          size: 'invisible',
        });
        (window as any).posRecaptchaVerifier = recaptcha;
      }
      const rawDigits = phone.replace(/\D/g, '').slice(-10);
      const formatted = `+91${rawDigits}`;
      const confirmation = await signInWithPhoneNumber(auth, formatted, recaptcha);
      setConfirmationResult(confirmation);
      setOtpSent(true);
      toast.success('6-digit SMS code dispatched!');
    } catch (err: any) {
      console.error('[POS Phone Login] Error:', err);
      toast.error(err.message || 'Failed to dispatch SMS code');
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneOtp || phoneOtp.length !== 6) {
      toast.error('Enter 6-digit SMS verification code');
      return;
    }

    setPhoneLoading(true);
    try {
      const res = await confirmationResult.confirm(phoneOtp);
      const user = res.user;

      const authCheck = await verifyUserAuthorization(user);
      if (!authCheck.isAuthorized) {
        await signOut(auth);
        usePOSStore.setState({
          user: null,
          session: null,
          isAuthorized: false,
          restrictedReason: authCheck.denialReason || 'Access Denied: Terminal restricted to authorized store staff.',
          restrictedEmail: user.phoneNumber || ''
        });
        toast.error(authCheck.denialReason || 'Access Denied.');
        return;
      }

      finalizeSession(user.uid, authCheck.name, authCheck.user);
    } catch (err: any) {
      toast.error(err.message || 'Incorrect verification code');
    } finally {
      setPhoneLoading(false);
    }
  };

  // 3. Google Sign-In Handler
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      let user: FirebaseUser | null = null;
      if (Capacitor.isNativePlatform()) {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        const res = await FirebaseAuthentication.signInWithGoogle();
        const idToken = res.credential?.idToken;
        if (!idToken) throw new Error('Failed to get Google ID token on mobile device.');
        const credential = GoogleAuthProvider.credential(idToken);
        const userCred = await signInWithCredential(auth, credential);
        user = userCred.user;
      } else {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const userCred = await signInWithPopup(auth, provider);
        user = userCred.user;
      }

      const authCheck = await verifyUserAuthorization(user);
      if (!authCheck.isAuthorized) {
        await signOut(auth);
        usePOSStore.setState({
          user: null,
          session: null,
          isAuthorized: false,
          restrictedReason: authCheck.denialReason || 'Access Denied: Terminal restricted to authorized store staff.',
          restrictedEmail: user.email || ''
        });
        toast.error(authCheck.denialReason || 'Access Denied.');
        return;
      }

      finalizeSession(user.uid, authCheck.name, authCheck.user);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        toast.error('Google Sign-In failed: ' + (err.message || 'Authentication error'));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // 4. Request Password Reset Workflow
  const handleRequestPasswordReset = async () => {
    if (!email || !email.includes('@')) {
      toast.error('Please enter your POS account email address above first.');
      return;
    }

    setRequestingReset(true);
    const toastId = toast.loading('Submitting password reset request to Owner...');
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), appTarget: 'POS' })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'Reset request submitted to Store Owner!', { id: toastId, duration: 6000 });
      } else {
        toast.error(data.message || 'Failed to submit reset request', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Request failed', { id: toastId });
    } finally {
      setRequestingReset(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#0B0F17] flex items-center justify-center p-3.5 sm:p-6 select-none">
      <div className="w-full max-w-md bg-[#0E1524] border border-slate-800 rounded-3xl p-5 sm:p-8 shadow-2xl space-y-5">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <AppLogo variant="full" size="xl" subtitle="POS & Billing System" />
          <p className="text-[11px] text-slate-400 font-mono pt-1">
            Terminal Access Control • Franchise & POS Operator Authentication
          </p>
        </div>

        {/* Credential Selection Prompt: "How would you like to log in?" */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-bold text-slate-300 block text-center">
            How would you like to log in?
          </label>
          <div className="grid grid-cols-2 gap-2 bg-[#080C14] p-1.5 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setAuthMethod('email')}
              className={`min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] ${
                authMethod === 'email' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <User size={14} /> Email
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod('phone')}
              className={`min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] ${
                authMethod === 'phone' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Phone size={14} /> Phone Number
            </button>
          </div>
        </div>

        {/* Email Login Option */}
        {authMethod === 'email' && (
          <form onSubmit={handleEmailLogin} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <User size={13} className="text-amber-400" /> POS Operator Email
              </label>
              <input
                type="email"
                required
                placeholder="pos.branch@olivepizza.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#080C14] border border-slate-700 rounded-xl px-3.5 py-3 sm:py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-amber-500 min-h-[44px]"
              />
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <KeyRound size={13} className="text-amber-400" /> Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#080C14] border border-slate-700 rounded-xl px-3.5 py-3 sm:py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-amber-500 min-h-[44px]"
              />
            </div>

            {/* Forgot Password Flow */}
            <div className="flex justify-end pt-0.5">
              <button
                type="button"
                onClick={handleRequestPasswordReset}
                disabled={requestingReset}
                className="min-h-[44px] py-1 text-[11px] text-amber-400/90 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer transition"
              >
                <HelpCircle size={13} />
                <span>Forgot Password? Request Reset from Owner</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] py-3.5 bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-black text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] flex items-center justify-center gap-2 mt-2 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles size={16} /> {loading ? 'Verifying Terminal Access...' : 'Sign In to POS Terminal'}
            </button>
          </form>
        )}

        {/* Phone Login Option */}
        {authMethod === 'phone' && (
          <div className="space-y-4 text-xs">
            <div id="pos-recaptcha-container" />
            {!otpSent ? (
              <form onSubmit={handleSendPhoneOtp} className="space-y-4">
                <div>
                  <label className="font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                    <Phone size={13} className="text-amber-400" /> Operator Registered Mobile
                  </label>
                  <div className="flex gap-2">
                    <span className="bg-[#080C14] border border-slate-700 rounded-xl px-3.5 py-3 sm:py-2.5 text-base sm:text-sm text-slate-400 flex items-center font-mono shrink-0 min-h-[44px]">
                      +91
                    </span>
                    <input
                      type="tel"
                      inputMode="tel"
                      required
                      placeholder="9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-[#080C14] border border-slate-700 rounded-xl px-3.5 py-3 sm:py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-amber-500 min-h-[44px]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={phoneLoading}
                  className="w-full min-h-[48px] py-3.5 bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-black text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] flex items-center justify-center gap-2 mt-2 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles size={16} /> {phoneLoading ? 'Dispatching SMS...' : 'Send SMS Verification Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
                <div>
                  <label className="font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                    <KeyRound size={13} className="text-amber-400" /> 6-Digit SMS Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    required
                    maxLength={6}
                    placeholder="123456"
                    value={phoneOtp}
                    onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-[#080C14] border border-slate-700 rounded-xl px-3.5 py-3 sm:py-2.5 text-center text-xl font-mono text-amber-400 tracking-widest focus:outline-none focus:border-amber-500 min-h-[48px]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={phoneLoading}
                  className="w-full min-h-[48px] py-3.5 bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-black text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] flex items-center justify-center gap-2 mt-2 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles size={16} /> {phoneLoading ? 'Verifying...' : 'Verify & Sign In'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Google Continue */}
        <div className="pt-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[10px] uppercase font-bold text-slate-500">Or single sign-on</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full min-h-[48px] py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {googleLoading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>
        </div>

        <div className="pt-2 border-t border-slate-800/80 text-center">
          <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            Zero-Trust Terminal Authorization Protected
          </p>
        </div>
      </div>
    </div>
  );
};

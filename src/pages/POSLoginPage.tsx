import React, { useState, useEffect } from 'react';
import { usePOSStore } from '../store/posStore';
import { auth, db } from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  signInWithCredential,
  GoogleAuthProvider, 
  signOut,
  sendEmailVerification,
  User as FirebaseUser 
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { doc, getDoc } from 'firebase/firestore';
import { 
  Pizza, 
  Monitor, 
  Store, 
  KeyRound, 
  User, 
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Mail,
  Lock,
  Clock
} from 'lucide-react';
import { AppLogo } from '../components/common/AppLogo';
import toast from 'react-hot-toast';

interface POSLoginPageProps {
  onLoginSuccess: () => void;
}

const AUTHORIZED_EMAILS = [
  'olivepizzarjn@gmail.com',
  'webhub2811@gmail.com',
  'olivepizzamaker@gmail.com'
];

const ALLOWED_STAFF_ROLES = [
  'owner',
  'admin',
  'developer',
  'platform_owner',
  'cashier',
  'manager',
  'restaurant_manager',
  'franchise_owner',
  'staff'
];

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;

export const POSLoginPage: React.FC<POSLoginPageProps> = ({ onLoginSuccess }) => {
  const { setSession } = usePOSStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terminalId, setTerminalId] = useState('pos_term_01');
  const [branchId, setBranchId] = useState('main_branch');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [unverifiedUser, setUnverifiedUser] = useState<FirebaseUser | null>(null);

  // Rate Limiting States
  const [failedAttempts, setFailedAttempts] = useState<number>(() => {
    return parseInt(localStorage.getItem('pos_login_failed_attempts') || '0', 10);
  });
  const [lockoutRemaining, setLockoutRemaining] = useState<number>(() => {
    const lockUntil = parseInt(localStorage.getItem('pos_login_lockout_until') || '0', 10);
    const now = Date.now();
    return lockUntil > now ? Math.ceil((lockUntil - now) / 1000) : 0;
  });

  const branches = [
    { id: 'main_branch', name: 'Olive Pizza — Rajnandgaon (HQ)', code: 'OP-RJN-01' },
    { id: 'durg_branch', name: 'Olive Pizza — Durg', code: 'OP-DURG-02' },
    { id: 'bhilai_branch', name: 'Olive Pizza — Bhilai', code: 'OP-BHL-03' },
    { id: 'raipur_branch', name: 'Olive Pizza — Raipur', code: 'OP-RPR-04' },
  ];

  const terminals = [
    { id: 'pos_term_01', name: 'Terminal #01 (Front Counter)' },
    { id: 'pos_term_02', name: 'Terminal #02 (Takeaway Counter)' },
    { id: 'pos_term_03', name: 'Terminal #03 (Express Counter)' },
  ];

  // Lockout Countdown Timer
  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const timer = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          localStorage.removeItem('pos_login_lockout_until');
          localStorage.setItem('pos_login_failed_attempts', '0');
          setFailedAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  const recordFailedAttempt = () => {
    const nextAttempts = failedAttempts + 1;
    setFailedAttempts(nextAttempts);
    localStorage.setItem('pos_login_failed_attempts', nextAttempts.toString());

    if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockUntil = Date.now() + LOCKOUT_SECONDS * 1000;
      localStorage.setItem('pos_login_lockout_until', lockUntil.toString());
      setLockoutRemaining(LOCKOUT_SECONDS);
      toast.error(`Too many failed attempts. Login locked for ${LOCKOUT_SECONDS} seconds.`);
    } else {
      toast.error(`Invalid credentials. ${MAX_FAILED_ATTEMPTS - nextAttempts} attempts remaining before lockout.`);
    }
  };

  const clearLockout = () => {
    localStorage.removeItem('pos_login_failed_attempts');
    localStorage.removeItem('pos_login_lockout_until');
    setFailedAttempts(0);
    setLockoutRemaining(0);
  };

  // Authorize User Role & Permissions
  const verifyUserAuthorization = async (user: FirebaseUser): Promise<{ isAuthorized: boolean; role: string; name: string }> => {
    const userEmail = (user.email || '').toLowerCase().trim();

    // 1. Global Owner / Admin Bypass
    if (AUTHORIZED_EMAILS.includes(userEmail)) {
      return {
        isAuthorized: true,
        role: 'owner',
        name: user.displayName || userEmail.split('@')[0].toUpperCase(),
      };
    }

    // 2. Check Firestore User Account Profile
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        const role = (data.role || '').toLowerCase();
        if (ALLOWED_STAFF_ROLES.includes(role)) {
          return {
            isAuthorized: true,
            role,
            name: data.name || data.displayName || userEmail.split('@')[0],
          };
        }
      }
    } catch (err: any) {
      console.warn('[POS Auth] Firestore check warning:', err.message);
    }

    // 3. Fallback Check in Custom Claims or Staff Collection
    try {
      const idTokenResult = await user.getIdTokenResult(true);
      const roleClaim = String(idTokenResult.claims.role || idTokenResult.claims.user_type || '').toLowerCase();
      if (ALLOWED_STAFF_ROLES.includes(roleClaim)) {
        return {
          isAuthorized: true,
          role: roleClaim,
          name: user.displayName || userEmail.split('@')[0],
        };
      }
    } catch {}

    return { isAuthorized: false, role: 'customer', name: user.displayName || 'Customer' };
  };

  // 1. Email / Password Login Handler
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutRemaining > 0) {
      toast.error(`Login locked. Please wait ${lockoutRemaining}s.`);
      return;
    }

    setLoading(true);
    setUnverifiedUser(null);

    try {
      const userCred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCred.user;

      // Authorization & Role Validation
      const { isAuthorized, role, name } = await verifyUserAuthorization(user);
      if (!isAuthorized) {
        await signOut(auth);
        recordFailedAttempt();
        toast.error('Access Denied: Terminal restricted to authorized restaurant staff & owners only.');
        setLoading(false);
        return;
      }

      clearLockout();
      finalizeSession(user.uid, name, role);
    } catch (err: any) {
      recordFailedAttempt();
    } finally {
      setLoading(false);
    }
  };

  // 2. Google Sign-In Handler
  const handleGoogleLogin = async () => {
    if (lockoutRemaining > 0) {
      toast.error(`Login locked. Please wait ${lockoutRemaining}s.`);
      return;
    }

    setGoogleLoading(true);
    setUnverifiedUser(null);

    try {
      let user: FirebaseUser | null = null;
      if (Capacitor.isNativePlatform()) {
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

      // Authorization & Role Validation
      const { isAuthorized, role, name } = await verifyUserAuthorization(user);
      if (!isAuthorized) {
        await signOut(auth);
        recordFailedAttempt();
        toast.error('Access Denied: Your Google account is not registered as a store staff or owner.');
        setGoogleLoading(false);
        return;
      }

      clearLockout();
      finalizeSession(user.uid, name, role);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        toast.error('Google Sign-In failed: ' + (err.message || 'Authentication error'));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // Resend Email Verification
  const handleResendVerification = async () => {
    if (!unverifiedUser) return;
    try {
      await sendEmailVerification(unverifiedUser);
      toast.success('Verification link sent! Please check your inbox & spam folder.');
    } catch (err: any) {
      toast.error('Failed to send verification email: ' + err.message);
    }
  };

  const finalizeSession = (uid: string, cashierName: string, userRole = 'cashier') => {
    const selectedBranch = branches.find((b) => b.id === branchId) || branches[0];
    localStorage.setItem('pos_terminal_id', terminalId);
    localStorage.setItem('pos_branch_id', branchId);

    const isOwnerUser = AUTHORIZED_EMAILS.includes((auth.currentUser?.email || '').toLowerCase().trim()) || userRole === 'owner';

    setSession({
      cashierName,
      cashierUid: uid,
      terminalId,
      branchId,
      branchName: selectedBranch.name,
      franchiseId: 'fra_primary',
      organizationId: 'org_olive_pizza',
      role: isOwnerUser ? 'owner' : userRole,
      isOwnerMode: isOwnerUser
    });

    toast.success(`Welcome ${cashierName}! ${isOwnerUser ? 'Master Owner Full Access Activated.' : `Terminal ${terminalId} authenticated.`}`);
    onLoginSuccess();
  };

  const handleQuickStaffSignIn = (selectedEmail: string, name: string) => {
    setEmail(selectedEmail);
    toast(`Selected ${name} (${selectedEmail}). Sign in with password or Google to establish your POS session.`, {
      icon: '🔐',
    });
  };

  return (
    <div className="min-h-screen w-screen bg-[#0B0F17] flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-[#0E1524] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <AppLogo variant="full" size="xl" subtitle="POS & Billing System" />
          <p className="text-[11px] text-slate-400 font-mono pt-1">
            Terminal Access Control • Staff & Owner Authentication
          </p>
        </div>

        {/* Lockout Warning Banner */}
        {lockoutRemaining > 0 && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-rose-400 text-xs">
            <Clock className="w-5 h-5 shrink-0 animate-spin" />
            <div>
              <strong className="block font-bold">Terminal Login Locked</strong>
              <span>Too many failed attempts. Try again in {lockoutRemaining}s.</span>
            </div>
          </div>
        )}

        {/* Email Verification Banner */}
        {unverifiedUser && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2 text-amber-300 text-xs">
            <div className="flex items-center gap-2 font-bold">
              <Mail className="w-4 h-4 text-amber-400" />
              <span>Email Verification Required</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Your email ({unverifiedUser.email}) must be verified before logging into the POS.
            </p>
            <button
              onClick={handleResendVerification}
              className="px-3 py-1.5 bg-amber-500 text-black font-bold rounded-xl text-[11px] hover:bg-amber-400 transition"
            >
              Resend Verification Email
            </button>
          </div>
        )}

        {/* 1-Click Fast Authorized POS Terminal Access */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => handleQuickStaffSignIn('olivepizzarjn@gmail.com', 'Master Owner')}
            className="w-full py-2.5 px-3.5 bg-slate-900 hover:bg-slate-850 border border-amber-500/40 hover:border-amber-500 rounded-xl text-xs font-bold text-white flex items-center justify-between transition-all cursor-pointer shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <div className="text-left">
                <div className="font-extrabold text-white text-[11px]">Sign in as Master Owner (Full POS Control)</div>
                <div className="text-[10px] text-amber-300/80">olivepizzarjn@gmail.com</div>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
          </button>

          <button
            type="button"
            onClick={() => handleQuickStaffSignIn('olivepizzamaker@gmail.com', 'Shift Lead / Cashier')}
            className="w-full py-2.5 px-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-700 hover:border-emerald-500/50 rounded-xl text-xs font-bold text-white flex items-center justify-between transition-all cursor-pointer shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <Store className="w-4 h-4 text-emerald-400" />
              <div className="text-left">
                <div className="font-extrabold text-white text-[11px]">Sign in as Front Counter Cashier</div>
                <div className="text-[10px] text-slate-400">Terminal {terminalId} • Main Branch</div>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-[10px] uppercase font-bold text-slate-500">Or OAuth / Staff Credentials</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Google Sign-In Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading || lockoutRemaining > 0}
          className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 border border-slate-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2.5 shadow-sm active:scale-98"
        >
          {googleLoading ? (
            <span>Connecting with Google...</span>
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
              <span>Continue with Google (Owner / Staff)</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px bg-slate-800 flex-1"></div>
          <span className="text-[10px] text-slate-500 font-bold uppercase">or email login</span>
          <div className="h-px bg-slate-800 flex-1"></div>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleEmailLogin} className="space-y-3.5 text-xs">
          {/* Store Branch */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-orange-400" />
              Store Branch
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full p-2.5 bg-[#131B2B] border border-slate-800 rounded-xl text-white font-medium focus:border-orange-500 focus:outline-none"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          {/* POS Terminal */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-blue-400" />
              Terminal Device
            </label>
            <select
              value={terminalId}
              onChange={(e) => setTerminalId(e.target.value)}
              className="w-full p-2.5 bg-[#131B2B] border border-slate-800 rounded-xl text-white font-medium focus:border-orange-500 focus:outline-none"
            >
              {terminals.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. olivepizzarjn@gmail.com"
              className="w-full p-2.5 bg-[#131B2B] border border-slate-800 rounded-xl text-white focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full p-2.5 bg-[#131B2B] border border-slate-800 rounded-xl text-white focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || lockoutRemaining > 0}
            className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-orange-600/30 transition-all flex items-center justify-center gap-2 mt-2"
          >
            <span>{loading ? 'Verifying Credentials...' : 'Authenticate & Launch POS'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="pt-2 border-t border-slate-800/80 text-center">
          <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Restricted to Owner, Developer & Authorized Staff Accounts
          </p>
        </div>
      </div>
    </div>
  );
};

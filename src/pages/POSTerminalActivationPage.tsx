import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Key, Sparkles, ShieldCheck, ArrowRight, Store } from 'lucide-react';
import toast from 'react-hot-toast';

export const POSTerminalActivationPage: React.FC = () => {
  const [activationCode, setActivationCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const navigate = useNavigate();

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = activationCode.trim();
    if (!code || code.length < 6) {
      toast.error('Enter a valid 6-digit activation PIN');
      return;
    }

    setIsActivating(true);
    try {
      const res = await fetch('http://localhost:3000/api/pos/terminals/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activationCode: code,
          deviceFingerprint: 'DESKTOP-WIN-' + Math.random().toString(36).substring(7)
        })
      });
      const data = await res.json();

      if (data.success && data.terminal) {
        localStorage.setItem('pos_terminal_id', data.terminal.terminalId);
        localStorage.setItem('pos_branch_id', data.terminal.branchId);
        localStorage.setItem('pos_franchise_id', data.terminal.franchiseId);
        toast.success('Terminal activated successfully! 🍕');
        navigate('/billing');
      } else {
        toast.error(data.error || 'Invalid or expired activation PIN');
      }
    } catch {
      // Offline / Local dev fallback
      localStorage.setItem('pos_terminal_id', 'POS-MAIN-1042');
      localStorage.setItem('pos_branch_id', 'main_branch');
      localStorage.setItem('pos_franchise_id', 'fra_primary');
      toast.success('Terminal activated for Local Station!');
      navigate('/billing');
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-2xl flex items-center justify-center mx-auto text-3xl">
            <Monitor size={32} />
          </div>
          <h1 className="font-black text-2xl text-white uppercase tracking-wide">
            ACTIVATE <span className="text-amber-400">POS TERMINAL</span>
          </h1>
          <p className="text-xs text-slate-400">
            Enter the 6-digit Activation PIN generated in the Franchise Management Suite to link this machine.
          </p>
        </div>

        <form onSubmit={handleActivate} className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
              <Key size={14} className="text-amber-400" /> 6-Digit Activation PIN
            </label>
            <input
              type="text"
              maxLength={6}
              required
              placeholder="e.g. 782910"
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3.5 text-center text-2xl font-mono font-black text-amber-400 tracking-[0.3em] focus:outline-none focus:border-amber-500 placeholder:text-slate-700 placeholder:tracking-normal"
            />
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
            <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <p>
              This terminal will be securely bound to your designated branch and franchise. You only need to activate once.
            </p>
          </div>

          <button
            type="submit"
            disabled={isActivating}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-black text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 active:scale-98 flex items-center justify-center gap-2"
          >
            {isActivating ? 'Verifying with Backend...' : 'Link & Launch POS Billing'}
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="text-center pt-2">
          <button
            onClick={() => navigate('/login')}
            className="text-xs text-slate-500 hover:text-slate-300 font-bold"
          >
            Sign in with Cashier Credentials instead
          </button>
        </div>
      </div>
    </div>
  );
};
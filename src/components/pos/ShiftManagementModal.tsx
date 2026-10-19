import React, { useState, useEffect } from 'react';
import { usePOSStore } from '../../store/posStore';
import { ThermalPrinterService } from '../../services/ThermalPrinterService';
import { 
  X, 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  Printer, 
  Clock, 
  DollarSign, 
  FileText,
  Sparkles,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';

const QUICK_DENOMS = [100, 200, 500, 1000, 2000];

export const ShiftManagementModal: React.FC = () => {
  const {
    session,
    activeShift,
    isShiftModalOpen,
    setIsShiftModalOpen,
    fetchCurrentShift,
    openShift,
    recordCashAdjustment,
    closeShift
  } = usePOSStore();

  const [loading, setLoading] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState<string>('1000');
  const [openingNotes, setOpeningNotes] = useState<string>('');

  // Adjustment state
  const [adjType, setAdjType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN');
  const [adjAmount, setAdjAmount] = useState<string>('');
  const [adjReason, setAdjReason] = useState<string>('');

  // Closing state
  const [closingCashInput, setClosingCashInput] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'ADJUST' | 'CLOSE'>('SUMMARY');

  useEffect(() => {
    if (isShiftModalOpen) {
      fetchCurrentShift();
    }
  }, [isShiftModalOpen]);

  if (!isShiftModalOpen) return null;

  const handleOpenShift = async () => {
    const val = Number(openingCashInput);
    if (isNaN(val) || val < 0) {
      toast.error('Please enter a valid opening cash float');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Opening cashier shift & linking drawer...');
    const ok = await openShift(val, openingNotes || 'Shift opened from POS counter');
    setLoading(false);

    if (ok) {
      toast.success(`Shift opened with ₹${val.toFixed(2)} opening float!`, { id: toastId });
      ThermalPrinterService.triggerCashDrawerPulse().catch(() => {});
      setActiveTab('SUMMARY');
    } else {
      toast.error('Failed to open shift. Check server connection.', { id: toastId });
    }
  };

  const handleRecordAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(adjAmount);
    if (isNaN(val) || val <= 0) {
      toast.error('Please enter a positive adjustment amount');
      return;
    }
    if (!adjReason.trim()) {
      toast.error('Please provide a reason for the cash adjustment');
      return;
    }

    setLoading(true);
    const toastId = toast.loading(`Recording ${adjType === 'CASH_IN' ? 'Cash In' : 'Cash Out'}...`);
    const ok = await recordCashAdjustment(adjType, val, adjReason.trim());
    setLoading(false);

    if (ok) {
      toast.success(`${adjType === 'CASH_IN' ? 'Cash In' : 'Cash Out'} of ₹${val} recorded!`, { id: toastId });
      setAdjAmount('');
      setAdjReason('');
      setActiveTab('SUMMARY');
      if (adjType === 'CASH_IN') {
        ThermalPrinterService.triggerCashDrawerPulse().catch(() => {});
      }
    } else {
      toast.error('Failed to record adjustment.', { id: toastId });
    }
  };

  const handleCloseShift = async () => {
    const val = Number(closingCashInput);
    if (isNaN(val) || val < 0) {
      toast.error('Please enter the counted actual cash in drawer');
      return;
    }

    if (!confirm('Are you sure you want to close this cashier shift? This will reconcile cash drawer records in PostgreSQL.')) {
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Reconciling drawer & closing shift in PostgreSQL...');
    const ok = await closeShift(val, closingNotes || 'Shift reconciled');
    setLoading(false);

    if (ok) {
      toast.success('Shift closed and reconciled successfully!', { id: toastId });
      setIsShiftModalOpen(false);
    } else {
      toast.error('Failed to close shift.', { id: toastId });
    }
  };

  // Calculations for active shift
  const openingCash = Number(activeShift?.openingCash || 0);
  const cashSales = Number(activeShift?.cashSales || 0);
  const digitalSales = Number(activeShift?.digitalSales || activeShift?.upiSales || 0) + Number(activeShift?.cardSales || 0);
  const adjustments = activeShift?.cashAdjustments || [];
  const cashInTotal = adjustments.filter(a => a.type === 'CASH_IN').reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const cashOutTotal = adjustments.filter(a => a.type === 'CASH_OUT').reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const calculatedExpectedCash = openingCash + cashSales + cashInTotal - cashOutTotal;

  const actualEntered = Number(closingCashInput || '0');
  const cashDiff = actualEntered - calculatedExpectedCash;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">Cashier Shift & Cash Drawer</h3>
                {activeShift ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    SHIFT OPEN
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                    DRAWER CLOSED
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                {session?.branchName || 'Olive Pizza'} • Terminal: {session?.terminalId || 'POS-1'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsShiftModalOpen(false)}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {!activeShift ? (
            /* Open Shift Screen */
            <div className="space-y-5 animate-in fade-in">
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Start New Cashier Shift
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Enter the initial floating cash in the till. This will initialize your shift ledger in PostgreSQL and track every cash transaction deterministically.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-2">
                  Opening Float Cash (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={openingCashInput}
                    onChange={(e) => setOpeningCashInput(e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-full pl-8 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-base font-bold text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Quick denomination buttons */}
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {QUICK_DENOMS.map(denom => (
                    <button
                      key={denom}
                      type="button"
                      onClick={() => setOpeningCashInput(String(denom))}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 transition cursor-pointer"
                    >
                      ₹{denom}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setOpeningCashInput('0')}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-400 transition cursor-pointer"
                  >
                    Zero Float
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-2">
                  Shift Notes (Optional)
                </label>
                <input
                  type="text"
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  placeholder="e.g. Morning Shift counter float verified"
                  className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                type="button"
                onClick={handleOpenShift}
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-black rounded-2xl text-sm transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Wallet className="w-4 h-4" />
                <span>Open Shift & Kick Drawer</span>
              </button>
            </div>
          ) : (
            /* Shift Active View */
            <div className="space-y-5 animate-in fade-in">
              {/* Navigation Tabs */}
              <div className="grid grid-cols-3 gap-1 bg-zinc-900 p-1 rounded-2xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('SUMMARY')}
                  className={`py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                    activeTab === 'SUMMARY'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Shift Ledger
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ADJUST')}
                  className={`py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                    activeTab === 'ADJUST'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Cash In / Out
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('CLOSE')}
                  className={`py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                    activeTab === 'CLOSE'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Close Shift
                </button>
              </div>

              {/* TAB 1: SUMMARY / LEDGER */}
              {activeTab === 'SUMMARY' && (
                <div className="space-y-4">
                  {/* High level financial cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Opening Float</span>
                      <div className="text-xl font-black text-white font-mono mt-1">₹{openingCash.toFixed(2)}</div>
                      <span className="text-[10px] text-zinc-500">Initial float given</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Cash Sales (Live)</span>
                      <div className="text-xl font-black text-emerald-300 font-mono mt-1">₹{cashSales.toFixed(2)}</div>
                      <span className="text-[10px] text-emerald-500/80">Till intake from sales</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Digital / UPI Sales</span>
                      <div className="text-xl font-black text-blue-300 font-mono mt-1">₹{digitalSales.toFixed(2)}</div>
                      <span className="text-[10px] text-blue-500/80">Bank settlements</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Expected in Drawer</span>
                      <div className="text-xl font-black text-amber-400 font-mono mt-1">₹{calculatedExpectedCash.toFixed(2)}</div>
                      <span className="text-[10px] text-amber-500/80">Float + Cash Sales + Adjustments</span>
                    </div>
                  </div>

                  {/* Cash adjustments summary */}
                  <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400 font-medium">Drawer Adjustments:</span>
                      <span className="font-mono text-zinc-300">
                        +₹{cashInTotal.toFixed(2)} In / -₹{cashOutTotal.toFixed(2)} Out
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400 font-medium">Shift Started:</span>
                      <span className="font-mono text-zinc-300">
                        {activeShift.openedAt ? new Date(activeShift.openedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400 font-medium">Cashier in Charge:</span>
                      <span className="font-medium text-amber-300">
                        {activeShift.cashierName || session?.cashierName || 'Staff'}
                      </span>
                    </div>
                  </div>

                  {/* Drawer Kick Action */}
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await ThermalPrinterService.triggerCashDrawerPulse();
                      if (ok) toast.success('Cash drawer pulse sent!');
                    }}
                    className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Wallet className="w-3.5 h-3.5 text-amber-400" />
                    <span>Open Cash Drawer (Hardware Pulse)</span>
                  </button>
                </div>
              )}

              {/* TAB 2: CASH ADJUSTMENT (IN / OUT) */}
              {activeTab === 'ADJUST' && (
                <form onSubmit={handleRecordAdjustment} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-2">
                      Adjustment Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAdjType('CASH_IN')}
                        className={`p-3 rounded-xl border text-center transition flex items-center justify-center gap-2 cursor-pointer ${
                          adjType === 'CASH_IN'
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                        <span>Cash In (Add Float)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjType('CASH_OUT')}
                        className={`p-3 rounded-xl border text-center transition flex items-center justify-center gap-2 cursor-pointer ${
                          adjType === 'CASH_OUT'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-300 font-bold'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <ArrowUpRight className="w-4 h-4 text-rose-400" />
                        <span>Cash Out (Drop / Payout)</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                      Amount (₹)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={adjAmount}
                      onChange={(e) => setAdjAmount(e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                      Reason / Description
                    </label>
                    <input
                      type="text"
                      value={adjReason}
                      onChange={(e) => setAdjReason(e.target.value)}
                      placeholder="e.g. Added change coins / Vegetable vendor payout"
                      className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
                  >
                    Record Cash Adjustment
                  </button>
                </form>
              )}

              {/* TAB 3: CLOSE & RECONCILE */}
              {activeTab === 'CLOSE' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Calculated Expected Cash</span>
                    <div className="text-2xl font-black text-amber-400 font-mono">₹{calculatedExpectedCash.toFixed(2)}</div>
                    <p className="text-[11px] text-zinc-500">Opening (₹{openingCash}) + Cash Sales (₹{cashSales}) + Net Adj (₹{cashInTotal - cashOutTotal})</p>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                      Counted Actual Cash in Drawer (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={closingCashInput}
                      onChange={(e) => setClosingCashInput(e.target.value)}
                      placeholder="Count physical notes and enter total..."
                      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-lg font-black text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Realtime variance indicator */}
                  {closingCashInput !== '' && (
                    <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold ${
                      cashDiff === 0 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                        : cashDiff < 0 
                        ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                    }`}>
                      <span>
                        {cashDiff === 0 ? '✓ Exact Match (Zero Variance)' : cashDiff < 0 ? '⚠️ Cash Shortage' : 'ℹ️ Cash Overage'}
                      </span>
                      <span className="font-mono text-sm">
                        {cashDiff > 0 ? `+₹${cashDiff.toFixed(2)}` : `₹${cashDiff.toFixed(2)}`}
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                      Closing Notes
                    </label>
                    <input
                      type="text"
                      value={closingNotes}
                      onChange={(e) => setClosingNotes(e.target.value)}
                      placeholder="e.g. End of dinner shift, safe drop completed"
                      className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleCloseShift}
                    disabled={loading || closingCashInput === ''}
                    className="w-full py-3.5 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-bold rounded-2xl text-xs transition shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Reconcile & Close Cashier Shift</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

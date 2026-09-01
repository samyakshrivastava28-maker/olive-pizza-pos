import React, { useEffect, useState } from 'react';
import { usePOSStore } from '../../store/posStore';
import { 
  Building2, 
  User, 
  Boxes,
  Printer, 
  History, 
  BarChart3, 
  LogOut,
  Layers,
  Globe,
  ChevronDown,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppLogo } from '../common/AppLogo';
import { fetchPOSApi } from '../../lib/api';

interface POSHeaderProps {
  onLogout: () => void;
}

export const POSHeader: React.FC<POSHeaderProps> = ({ onLogout }) => {
  const navigate = useNavigate();
  const { 
    session, 
    isOwner,
    availableBranches, 
    setAvailableBranches,
    activeBranchId,
    switchBranchContext,
    heldBills,
    setIsHeldBillsOpen,
    setIsHistoryOpen, 
    setIsStockDrawerOpen, 
    setIsPrinterSettingsOpen, 
    setIsPrintQueueOpen,
    pendingOnlineOrders 
  } = usePOSStore();

  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const pendingCount = pendingOnlineOrders.length;
  const heldCount = heldBills.length;

  // Load available branches for Owner context switcher
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const res = await fetchPOSApi('/api/pos/branches');
        if (res.ok) {
          const data = await res.json();
          if (data.branches && data.branches.length > 0) {
            setAvailableBranches(data.branches);
          }
        }
      } catch (err) {
        console.warn('Could not fetch branches for context switcher:', err);
      }
    };
    fetchBranches();
  }, []);

  const currentBranch = availableBranches.find((b) => b.branchId === activeBranchId) || {
    name: session?.branchName || 'Olive Pizza — Rajnandgaon (HQ)',
    code: 'OP-RJN-01',
    branchId: activeBranchId,
    franchiseId: 'fra_rajnandgaon'
  };

  return (
    <header className="h-16 bg-zinc-950 border-b border-zinc-800 px-5 flex items-center justify-between select-none">
      {/* Left: Brand & Owner Context Switcher / Terminal Info */}
      <div className="flex items-center gap-5">
        <AppLogo variant="full" size="md" subtitle="POS Terminal" />

        {/* Franchise & Branch Selector (Owner Mode Enabled) */}
        <div className="relative">
          {isOwner ? (
            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                className="flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 px-2 py-1 rounded-lg transition cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5 text-amber-500" />
                <span>{currentBranch.name}</span>
                <ChevronDown className="w-3 h-3 text-zinc-400" />
              </button>

              {isBranchDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-zinc-500 border-b border-zinc-800">
                    Switch Franchise Branch
                  </div>
                  {availableBranches.map((b) => (
                    <button
                      key={b.branchId}
                      type="button"
                      onClick={() => {
                        switchBranchContext(b.branchId, b.franchiseId, b.name);
                        setIsBranchDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition flex items-center justify-between cursor-pointer ${
                        b.branchId === activeBranchId
                          ? 'bg-amber-500/15 text-amber-400 font-bold'
                          : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                      }`}
                    >
                      <span>{b.name}</span>
                      <span className="font-mono text-[10px] text-zinc-500">{b.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-medium">
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3 text-zinc-500" />
                {currentBranch.name}
              </span>
              <span>•</span>
              <span className="font-mono text-zinc-300">Terminal: {session?.terminalId || 'POS-TERM-01'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right: Actions & Terminal Controls */}
      <div className="flex items-center gap-2">
        {/* Held Bills (F8) */}
        <button
          onClick={() => setIsHeldBillsOpen(true)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition active:scale-95 cursor-pointer ${
            heldCount > 0
              ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300'
              : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
          }`}
          title="Held Bills Queue (F8)"
        >
          <Layers className="w-4 h-4 text-amber-400" />
          <span>Held Bills</span>
          {heldCount > 0 && (
            <span className="px-1.5 py-0.2 bg-amber-500 text-zinc-950 rounded-full text-[10px] font-mono font-black">
              {heldCount}
            </span>
          )}
        </button>

        {/* Online Orders Live Monitor */}
        <button
          onClick={() => setIsPrintQueueOpen(true)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition active:scale-95 cursor-pointer ${
            pendingCount > 0
              ? 'bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/40 text-purple-300 animate-pulse'
              : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
          }`}
          title="Online Orders Live Monitor"
        >
          <Globe className="w-4 h-4 text-purple-400" />
          <span>Online Orders</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.2 bg-purple-500 text-white rounded-full text-[10px] font-mono font-black">
              {pendingCount}
            </span>
          )}
        </button>

        {/* Thermal Printer Settings */}
        <button
          onClick={() => setIsPrinterSettingsOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 transition active:scale-95 cursor-pointer"
          title="Thermal Printer Configuration"
        >
          <Printer className="w-4 h-4 text-amber-400" />
          <span>Printer</span>
        </button>

        {/* Quick Stock Toggle */}
        <button
          onClick={() => setIsStockDrawerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 transition active:scale-95 cursor-pointer"
          title="Product Availability & Stock Toggle"
        >
          <Boxes className="w-4 h-4 text-amber-400" />
          <span>Stock</span>
        </button>

        {/* History (F10) */}
        <button
          onClick={() => setIsHistoryOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 transition active:scale-95 cursor-pointer"
          title="Unified Order History (F10)"
        >
          <History className="w-4 h-4 text-amber-400" />
          <span>History</span>
          <kbd className="hidden md:inline-block px-1 py-0.2 bg-zinc-800 text-zinc-400 text-[9px] rounded border border-zinc-700 font-mono">
            F10
          </kbd>
        </button>

        {/* Dashboard BI Hub */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 transition active:scale-95 cursor-pointer"
          title="POS Reporting & BI Dashboard"
        >
          <BarChart3 className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline">BI Hub</span>
        </button>

        {/* Cashier & Logout */}
        <div className="h-6 w-px bg-zinc-800 mx-1"></div>

        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          <User className="w-3.5 h-3.5 text-zinc-400" />
          <span className="font-bold text-white">{session?.cashierName || 'Cashier Staff'}</span>
        </div>

        <button
          onClick={onLogout}
          className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition active:scale-95 cursor-pointer"
          title="Lock / Logout Terminal"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

import React, { useState, useEffect } from 'react';
import { usePOSStore } from '../../store/posStore';
import { 
  Monitor, 
  X, 
  Search, 
  RefreshCw, 
  Building2, 
  User,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  Lock,
  RotateCcw,
  Check
} from 'lucide-react';
import { fetchApi, fetchPOSApi } from '../../lib/api';
import toast from 'react-hot-toast';

export const AllPOSTerminalsDrawer: React.FC = () => {
  const { isAllTerminalsOpen, setIsAllTerminalsOpen, session, setSession, resetOrder, availableBranches } = usePOSStore();
  const [activeTab, setActiveTab] = useState<'terminals' | 'users'>('terminals');
  const [terminals, setTerminals] = useState<any[]>([]);
  const [posUsers, setPosUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedFranchiseFilter, setSelectedFranchiseFilter] = useState<string>('all');

  // New POS User Modal Form State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newBranchId, setNewBranchId] = useState('main_branch');
  const [newFranchiseId, setNewFranchiseId] = useState('fra_rajnandgaon');
  const [newTerminalId, setNewTerminalId] = useState('POS-RJN-01');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Terminals
      const termRes = await fetchApi<{ terminals: any[] }>('/api/pos/all-terminals').catch(() => ({ terminals: [] }));
      if (termRes && termRes.terminals) {
        setTerminals(termRes.terminals);
      }

      // 2. Fetch POS Users
      const userRes = await fetchApi<{ users: any[] }>('/api/pos/users').catch(() => ({ users: [] }));
      if (userRes && userRes.users) {
        setPosUsers(userRes.users);
      }
    } catch (err) {
      console.error('[AllPOSTerminalsDrawer] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAllTerminalsOpen) {
      loadData();
    }
  }, [isAllTerminalsOpen]);

  const handleSwitchToTerminal = async (term: any) => {
    const toastId = toast.loading(`Switching POS Context to ${term.terminalName}...`);
    try {
      const res = await fetchApi<any>('/api/pos/owner-context/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          franchiseId: term.franchiseId,
          branchId: term.branchId,
          terminalId: term.id,
          previousContext: session ? {
            franchiseId: session.franchiseId,
            branchId: session.branchId,
            terminalId: session.terminalId
          } : null
        })
      });

      if (!res.success || !res.session) {
        throw new Error(res.error || 'Context switch rejected');
      }

      resetOrder();
      setSession(res.session);
      setIsAllTerminalsOpen(false);
      toast.success(`Switched to ${term.franchiseName} ➔ ${term.terminalName}!`, { id: toastId });
    } catch (err: any) {
      toast.error(err.message || 'Failed to switch terminal context', { id: toastId });
    }
  };

  const handleCreatePOSUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) {
      toast.error('Email is required');
      return;
    }
    setIsSubmitting(true);
    const toastId = toast.loading('Provisioning POS Cashier Account...');
    try {
      const res = await fetchPOSApi('/api/pos/users/create', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail,
          name: newName || newEmail.split('@')[0],
          branchId: newBranchId,
          franchiseId: newFranchiseId,
          terminalId: newTerminalId,
          role: 'cashier'
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create user');
      }

      toast.success(`POS Account provisioned for ${newEmail}!`, { id: toastId });
      setIsCreateModalOpen(false);
      setNewEmail('');
      setNewName('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error provisioning account', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const toastId = toast.loading(`Updating status to ${nextStatus}...`);
    try {
      const res = await fetchPOSApi(`/api/pos/users/${userId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus })
      });
      if (!res.ok) throw new Error('Failed to update status');
      toast.success(`Account status changed to ${nextStatus}!`, { id: toastId });
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error updating status', { id: toastId });
    }
  };

  const filteredTerminals = terminals.filter((t) => {
    const matchesSearch =
      (t.terminalName || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.id || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.branchName || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.franchiseName || '').toLowerCase().includes(search.toLowerCase());

    const matchesFranchise =
      selectedFranchiseFilter === 'all' || t.franchiseId === selectedFranchiseFilter;

    return matchesSearch && matchesFranchise;
  });

  const filteredUsers = posUsers.filter((u) => {
    const matchesSearch =
      (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.branchId || '').toLowerCase().includes(search.toLowerCase());

    const matchesFranchise =
      selectedFranchiseFilter === 'all' || u.franchiseId === selectedFranchiseFilter;

    return matchesSearch && matchesFranchise;
  });

  if (!isAllTerminalsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl">
        {/* Top Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Owner POS Management Hub</h2>
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold uppercase">
                  OWNER CONTROLLED
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Multi-franchise terminals, cashier permissions, and access provisioning
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs transition cursor-pointer"
              title="Refresh Telemetry"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsAllTerminalsOpen(false)}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation & Search Bar */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => setActiveTab('terminals')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'terminals'
                    ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                POS Terminals ({terminals.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'users'
                    ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Cashier Accounts ({posUsers.length})
              </button>
            </div>

            {activeTab === 'users' && (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow"
              >
                <UserPlus className="w-4 h-4" />
                <span>Invite / Add POS User</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search terminal ID, branch, name, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <select
              value={selectedFranchiseFilter}
              onChange={(e) => setSelectedFranchiseFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Franchises</option>
              {availableBranches.map((b) => (
                <option key={b.franchiseId} value={b.franchiseId}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'terminals' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTerminals.map((term) => (
                <div
                  key={term.id}
                  className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {term.id}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        ACTIVE
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-white">{term.terminalName}</h3>
                    <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-zinc-500" />
                      {term.branchName || term.franchiseName}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">
                      Staff: {term.assignedCashierName || 'Counter Staff'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSwitchToTerminal(term)}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-lg text-xs transition cursor-pointer"
                    >
                      Switch Context →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((u) => (
                <div
                  key={u.userId}
                  className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-300 font-bold">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-white">{u.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.status === 'ACTIVE' 
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}>
                          {u.status}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 font-mono mt-0.5">{u.email}</p>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-1">
                        <span>Branch: <b className="text-zinc-300">{u.branchId}</b></span>
                        <span>•</span>
                        <span>Terminal: <b className="text-zinc-300">{u.terminalId}</b></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleUserStatus(u.userId, u.status)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        u.status === 'ACTIVE'
                          ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {u.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create POS User Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <form
              onSubmit={handleCreatePOSUser}
              className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-bold text-base text-white">Provision POS Cashier</h3>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Cashier Email (Required)</label>
                <input
                  type="email"
                  required
                  placeholder="cashier.rjn@olivepizza.in"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Staff Name</label>
                <input
                  type="text"
                  placeholder="Rahul Sharma"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Franchise Branch</label>
                  <select
                    value={newBranchId}
                    onChange={(e) => {
                      setNewBranchId(e.target.value);
                      const b = availableBranches.find((br) => br.branchId === e.target.value);
                      if (b) setNewFranchiseId(b.franchiseId);
                    }}
                    className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    {availableBranches.map((b) => (
                      <option key={b.branchId} value={b.branchId}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Terminal ID</label>
                  <input
                    type="text"
                    value={newTerminalId}
                    onChange={(e) => setNewTerminalId(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-xl text-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Provision User'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

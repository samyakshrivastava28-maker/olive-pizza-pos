import React, { useState, useEffect } from 'react';
import { usePOSStore } from '../../store/posStore';
import { PosIndexedDbService, OfflineBillRecord, LocalBackupRecord, CsvExportMeta } from '../../services/PosIndexedDbService';
import { OfflineBillingQueueService } from '../../services/OfflineBillingQueueService';
import { PosCsvExportService } from '../../services/PosCsvExportService';
import { 
  X, 
  Search, 
  RefreshCw, 
  Download, 
  Database, 
  FileSpreadsheet, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ShieldCheck, 
  HardDrive,
  Upload,
  FileText
} from 'lucide-react';
import toast from 'react-hot-toast';

export const LocalDataBackupsDrawer: React.FC = () => {
  const { isLocalDataDrawerOpen, setIsLocalDataDrawerOpen, session } = usePOSStore();
  const [activeTab, setActiveTab] = useState<'TRANSACTIONS' | 'CSV_REPORTS' | 'BACKUPS'>('TRANSACTIONS');
  
  const [bills, setBills] = useState<OfflineBillRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_SYNC' | 'SYNCED' | 'RETRY_REQUIRED' | 'REVIEW_REQUIRED'>('ALL');
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const [backups, setBackups] = useState<LocalBackupRecord[]>([]);
  const [csvExports, setCsvExports] = useState<CsvExportMeta[]>([]);
  const [inspectSummary, setInspectSummary] = useState<any | null>(null);
  const [inspectSnapshot, setInspectSnapshot] = useState<any | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Load records from IndexedDB
  const loadData = async () => {
    setLoading(true);
    try {
      const allBills = await PosIndexedDbService.getAllBills();
      setBills(allBills.reverse()); // most recent first

      const syncMeta = await OfflineBillingQueueService.getLastSyncMeta();
      setLastSyncTime(syncMeta.lastSyncTime);
      setPendingCount(syncMeta.pendingCount);

      const allBackups = await PosIndexedDbService.getAllBackupRecords();
      setBackups(allBackups.reverse());

      const allCsv = await PosIndexedDbService.getAllCsvExportRecords();
      setCsvExports(allCsv.reverse());
    } catch (err) {
      console.warn('Failed to load local IndexedDB data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLocalDataDrawerOpen) {
      loadData();
    }
  }, [isLocalDataDrawerOpen]);

  // Trigger manual sync
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      const res = await OfflineBillingQueueService.syncQueue();
      await loadData();
      if (res.synced > 0) {
        toast.success(`Successfully synchronized ${res.synced} offline transaction(s)!`);
      } else if (res.remaining === 0) {
        toast.success('All local transactions are already synchronized.');
      } else {
        toast('Transactions queued. Will retry when connection is established.', { icon: 'ℹ️' });
      }
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  // Export CSV handler
  const handleExportCsv = async (type: 'BILLS' | 'SALES' | 'ITEMS' | 'TAXES') => {
    try {
      let result;
      let label = 'Transactions';
      if (type === 'BILLS') {
        result = PosCsvExportService.exportOfflineBillsCsv(bills);
        label = 'Offline Bills';
      } else if (type === 'SALES') {
        result = PosCsvExportService.exportDailySalesCsv(bills);
        label = 'Daily Sales Summary';
      } else if (type === 'ITEMS') {
        result = PosCsvExportService.exportBillsAndItemsCsv(bills);
        label = 'Bills & Line Items';
      } else {
        result = PosCsvExportService.exportTaxesCsv(bills);
        label = 'Tax Breakdown';
      }

      PosCsvExportService.downloadCsv(result.filename, result.content);

      // Record export metadata in IndexedDB
      const meta: CsvExportMeta = {
        id: `csv_${Date.now()}`,
        reportType: label,
        filename: result.filename,
        createdAt: new Date().toISOString(),
        rowCount: result.rowCount,
        scope: {
          branchId: session?.branchId || 'main_branch',
          franchiseId: session?.franchiseId || 'fra_rajnandgaon'
        },
        status: 'SUCCESS'
      };
      await PosIndexedDbService.saveCsvExportRecord(meta);
      await loadData();
      toast.success(`Exported ${result.rowCount} rows to ${result.filename}`);
    } catch (err: any) {
      toast.error('Failed to export CSV: ' + err.message);
    }
  };

  // Create Local JSON/Database Snapshot
  const handleCreateBackup = async () => {
    try {
      const scope = {
        branchId: session?.branchId || 'main_branch',
        franchiseId: session?.franchiseId || 'fra_rajnandgaon'
      };
      const snapshot = await PosIndexedDbService.exportLocalDatabaseSnapshot(scope);

      // Trigger download
      const jsonString = JSON.stringify(snapshot, null, 2);
      const filename = `olive-pizza-pos-backup-${new Date().toISOString().split('T')[0]}-${Date.now().toString().slice(-4)}.json`;
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await loadData();
      toast.success(`Local database backup created! SHA-256: ${snapshot.checksumSha256.slice(0, 10)}...`);
    } catch (err: any) {
      toast.error('Failed to create backup: ' + err.message);
    }
  };

  // Handle Inspect / Validate File Upload
  const handleValidateBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        const check = await PosIndexedDbService.validateBackupSnapshot(parsed);
        if (check.valid) {
          setInspectSummary(check.summary);
          setInspectSnapshot(parsed);
          setInspectError(null);
          toast.success('Backup verification PASSED! Checksum and schema are intact.');
        } else {
          setInspectError(check.error || 'Verification failed');
          setInspectSummary(null);
          setInspectSnapshot(null);
          toast.error('Backup verification FAILED: ' + check.error);
        }
      } catch (err: any) {
        setInspectError('Corrupted JSON syntax: ' + err.message);
        setInspectSummary(null);
        toast.error('Invalid JSON file format');
      }
    };
    reader.readAsText(file);
  };


  const handleExecuteRestore = async (mode: 'MERGE' | 'REPLACE') => {
    if (!inspectSnapshot) return;
    setIsRestoring(true);
    try {
      const res = await PosIndexedDbService.restoreLocalDatabaseSnapshot(inspectSnapshot, { mode });
      if (res.success) {
        toast.success(`Database snapshot successfully restored! (${res.restoredBills} bills restored)`);
        await loadData();
      } else {
        toast.error(`Restore failed: ${res.error}`);
      }
    } catch (err: any) {
      toast.error(`Restore error: ${err.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isLocalDataDrawerOpen) return null;

  // Filter bills
  const filteredBills = bills.filter((b) => {
    const bill = b.bill || ({} as any);
    const textMatch = 
      (b.billNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (bill.customerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (bill.customerPhone || '').includes(searchQuery) ||
      (b.idempotencyKey || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!textMatch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'PENDING_SYNC') return b.status === 'PENDING_SYNC' || b.status === 'PENDING';
    if (statusFilter === 'SYNCED') return b.status === 'SYNCED';
    if (statusFilter === 'RETRY_REQUIRED') return b.status === 'RETRY_REQUIRED' || b.status === 'FAILED';
    if (statusFilter === 'REVIEW_REQUIRED') return b.status === 'REVIEW_REQUIRED';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-4xl bg-zinc-950 border-l border-zinc-800 flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-200 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Local Data, Offline Queue & Backups
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono font-normal">
                  IndexedDB Engine
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Authoritative central PostgreSQL sync, durable offline transactions, and human-readable CSV exports.
              </p>
            </div>
          </div>

          <button 
            onClick={() => setIsLocalDataDrawerOpen(false)}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sync Telemetry Bar */}
        <div className="px-5 py-3 bg-zinc-900/40 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${navigator.onLine ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="font-medium text-zinc-300">{navigator.onLine ? 'Network Online' : 'Offline Mode'}</span>
            </div>
            <div className="text-zinc-500">|</div>
            <div className="text-zinc-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span>Last Sync: {lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString('en-IN') : 'None in this session'}</span>
            </div>
            <div className="text-zinc-500">|</div>
            <div className="text-zinc-400">
              Pending Sync: <span className="font-bold text-amber-400">{pendingCount}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerSync}
              disabled={isSyncing || !navigator.onLine}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                isSyncing || !navigator.onLine 
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-zinc-950 active:scale-95'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Synchronizing...' : 'Sync with PostgreSQL'}</span>
            </button>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/20 px-5 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('TRANSACTIONS')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'TRANSACTIONS'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Local Bills & Queue ({bills.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('CSV_REPORTS')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'CSV_REPORTS'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Readable CSV Exports</span>
          </button>

          <button
            onClick={() => setActiveTab('BACKUPS')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'BACKUPS'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Database Snapshots & Recovery</span>
          </button>
        </div>

        {/* Tab 1: Local Bills & Queue */}
        {activeTab === 'TRANSACTIONS' && (
          <div className="flex-1 flex flex-col min-h-0 p-5">
            {/* Search and Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search by Bill #, Customer Name, Phone, Idempotency Key..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
                {(['ALL', 'PENDING_SYNC', 'SYNCED', 'RETRY_REQUIRED', 'REVIEW_REQUIRED'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer ${
                      statusFilter === st
                        ? 'bg-zinc-800 border-zinc-700 text-white font-bold'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                    }`}
                  >
                    {st === 'ALL' ? 'All Records' : st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Bills Table */}
            <div className="flex-1 overflow-auto rounded-xl border border-zinc-800 bg-zinc-900/30">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-900/80 text-zinc-400 font-semibold border-b border-zinc-800 sticky top-0 backdrop-blur-xs">
                  <tr>
                    <th className="py-2.5 px-3">Bill #</th>
                    <th className="py-2.5 px-3">Permanent Bill #</th>
                    <th className="py-2.5 px-3">Date / Time</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Payment</th>
                    <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                    <th className="py-2.5 px-3 text-center">Sync Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-300">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-500 font-sans">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
                        Loading local IndexedDB transactions...
                      </td>
                    </tr>
                  ) : filteredBills.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-500 font-sans">
                        No transactions found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredBills.map((b) => {
                      const bill = b.bill || ({} as any);
                      const isSynced = b.status === 'SYNCED';
                      const isPending = b.status === 'PENDING' || b.status === 'PENDING_SYNC';
                      const isReview = b.status === 'REVIEW_REQUIRED';

                      return (
                        <tr key={b.idempotencyKey} className="hover:bg-zinc-900/40 transition">
                          <td className="py-2 px-3 font-bold text-white">
                            {b.billNumber || bill.billNumber || 'PROVISIONAL'}
                          </td>
                          <td className="py-2 px-3">
                            {b.permanentBillNo ? (
                              <span className="text-emerald-400 font-bold">#{b.permanentBillNo}</span>
                            ) : (
                              <span className="text-zinc-500 italic">Pending Assignment</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-zinc-400 font-sans text-[11px]">
                            {b.createdAt ? new Date(b.createdAt).toLocaleString('en-IN') : '-'}
                          </td>
                          <td className="py-2 px-3 font-sans">
                            <div className="font-medium text-white">{bill.customerName || 'Walk-in'}</div>
                            <div className="text-[10px] text-zinc-500">{bill.customerPhone || 'N/A'}</div>
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-300">
                              {bill.paymentMethod || 'CASH'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-emerald-400">
                            ₹{Number(bill.finalTotal || bill.totalAmount || 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isSynced && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Synced
                              </span>
                            )}
                            {isPending && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Clock className="w-3 h-3" /> Pending Sync
                              </span>
                            )}
                            {isReview && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                <AlertTriangle className="w-3 h-3" /> Review Required
                              </span>
                            )}
                            {!isSynced && !isPending && !isReview && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                {b.status}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Readable CSV Exports */}
        {activeTab === 'CSV_REPORTS' && (
          <div className="flex-1 overflow-auto p-5 space-y-6">
            <div>
              <h3 className="text-xs uppercase font-bold text-zinc-400 tracking-wider mb-3">
                Generate Human-Readable CSV Reports (RFC 4180)
              </h3>
              <p className="text-xs text-zinc-400 mb-4">
                Export verified local and synced records directly into spreadsheet-ready CSV files with automatic formula injection protection.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => handleExportCsv('BILLS')}
                  className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 text-left transition group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-white group-hover:text-emerald-400 transition">
                      Offline & Synced Bills CSV
                    </span>
                    <Download className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition" />
                  </div>
                  <p className="text-xs text-zinc-400">
                    All stored POS bills with idempotency keys, permanent numbers, customer identity, and payment breakdown.
                  </p>
                </button>

                <button
                  onClick={() => handleExportCsv('SALES')}
                  className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 text-left transition group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-white group-hover:text-emerald-400 transition">
                      Daily Sales Summary CSV
                    </span>
                    <Download className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition" />
                  </div>
                  <p className="text-xs text-zinc-400">
                    Aggregated sales ledger grouped by date with Cash, UPI, and Card splits, discounts, and taxes.
                  </p>
                </button>

                <button
                  onClick={() => handleExportCsv('ITEMS')}
                  className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 text-left transition group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-white group-hover:text-emerald-400 transition">
                      Bills & Line Items Detail CSV
                    </span>
                    <Download className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition" />
                  </div>
                  <p className="text-xs text-zinc-400">
                    Granular line-item breakdown with item names, variants, crust selections, quantities, and line totals.
                  </p>
                </button>

                <button
                  onClick={() => handleExportCsv('TAXES')}
                  className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 text-left transition group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-white group-hover:text-emerald-400 transition">
                      GST & Tax Breakdown CSV
                    </span>
                    <Download className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition" />
                  </div>
                  <p className="text-xs text-zinc-400">
                    Statutory tax breakdown containing taxable subtotal, CGST (2.5%), SGST (2.5%), and total GST (5%).
                  </p>
                </button>
              </div>
            </div>

            {/* Export History */}
            <div>
              <h3 className="text-xs uppercase font-bold text-zinc-400 tracking-wider mb-3">
                Completed CSV Exports History ({csvExports.length})
              </h3>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900 text-zinc-400 font-semibold border-b border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-3">Report Type</th>
                      <th className="py-2.5 px-3">Filename</th>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3 text-right">Rows</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-300">
                    {csvExports.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-zinc-500 font-sans">
                          No CSV export operations recorded yet.
                        </td>
                      </tr>
                    ) : (
                      csvExports.map((c) => (
                        <tr key={c.id}>
                          <td className="py-2 px-3 font-bold text-white font-sans">{c.reportType}</td>
                          <td className="py-2 px-3 text-emerald-400">{c.filename}</td>
                          <td className="py-2 px-3 text-zinc-400 font-sans text-[11px]">
                            {new Date(c.createdAt).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 text-right">{c.rowCount}</td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 font-sans font-bold">
                              {c.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Database Snapshots & Recovery */}
        {activeTab === 'BACKUPS' && (
          <div className="flex-1 overflow-auto p-5 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Export Snapshot */}
              <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-white font-bold mb-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span>Create Local Database Snapshot</span>
                  </div>
                  <p className="text-xs text-zinc-400 mb-4">
                    Exports complete IndexedDB records (catalog, bills, offline queue) into a tamper-evident JSON archive with SHA-256 integrity checksum.
                  </p>
                </div>
                <button
                  onClick={handleCreateBackup}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Snapshot Archive</span>
                </button>
              </div>

              {/* Validate & Inspect Snapshot */}
              <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-white font-bold mb-2">
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                    <span>Validate & Inspect Backup Archive</span>
                  </div>
                  <p className="text-xs text-zinc-400 mb-4">
                    Upload an exported snapshot to verify SHA-256 cryptographic hash and schema consistency without modifying live data.
                  </p>
                </div>
                <label className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer border border-zinc-700">
                  <Upload className="w-4 h-4 text-purple-400" />
                  <span>Select Backup File to Verify</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleValidateBackupFile}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Validation Outcome Panel */}
            {inspectSummary && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs">
                <div className="font-bold text-emerald-400 flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Backup Verification Successful (Cryptographic Integrity Confirmed)</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-zinc-300">
                  <div>Total Bills: <span className="font-bold text-white">{inspectSummary.totalBills}</span></div>
                  <div>Branch: <span className="font-bold text-white">{inspectSummary.branchId}</span></div>
                  <div>Franchise: <span className="font-bold text-white">{inspectSummary.franchiseId}</span></div>
                  <div>Hash: <span className="font-bold text-emerald-400">{inspectSummary.checksum.slice(0, 10)}...</span></div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-emerald-500/20">
                  <button
                    onClick={() => handleExecuteRestore('MERGE')}
                    disabled={isRestoring}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                    <span>Restore & Merge Records</span>
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('WARNING: Replace mode will clear existing local bills before restoring. Are you sure you want to proceed?')) {
                        handleExecuteRestore('REPLACE');
                      }
                    }}
                    disabled={isRestoring}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-rose-500/20 hover:text-rose-400 text-zinc-300 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50 border border-zinc-700 cursor-pointer"
                  >
                    <HardDrive className="w-3.5 h-3.5 text-rose-400" />
                    <span>Replace All Records</span>
                  </button>
                </div>
              </div>
            )}

            {inspectError && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs">
                <div className="font-bold text-rose-400 flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Integrity Validation Failed</span>
                </div>
                <p className="text-zinc-300 font-mono">{inspectError}</p>
              </div>
            )}

            {/* Backup Records History */}
            <div>
              <h3 className="text-xs uppercase font-bold text-zinc-400 tracking-wider mb-3">
                Completed Local Database Snapshots ({backups.length})
              </h3>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900 text-zinc-400 font-semibold border-b border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-3">Filename</th>
                      <th className="py-2.5 px-3">Created At</th>
                      <th className="py-2.5 px-3 text-right">Bills</th>
                      <th className="py-2.5 px-3">SHA-256 Checksum</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-300">
                    {backups.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-zinc-500 font-sans">
                          No local database backup snapshots recorded yet.
                        </td>
                      </tr>
                    ) : (
                      backups.map((bk) => (
                        <tr key={bk.id}>
                          <td className="py-2 px-3 font-bold text-white font-sans">{bk.filename}</td>
                          <td className="py-2 px-3 text-zinc-400 font-sans text-[11px]">
                            {new Date(bk.createdAt).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 text-right">{bk.recordCount}</td>
                          <td className="py-2 px-3 text-emerald-400 text-[11px] truncate max-w-[140px]" title={bk.checksumSha256}>
                            {bk.checksumSha256.slice(0, 16)}...
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 font-sans font-bold">
                              {bk.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

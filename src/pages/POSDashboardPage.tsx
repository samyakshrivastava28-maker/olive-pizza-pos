import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Calendar,
  RefreshCw,
  CreditCard,
  QrCode,
  Globe,
  Sparkles,
  FileSpreadsheet,
  ShoppingBag,
  ArrowLeft,
  BarChart3,
  ExternalLink,
  Settings,
  Link as LinkIcon,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  Lock,
  UserCheck,
  Layers,
  ChevronRight,
  FileText,
  Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchPOSApi } from '../lib/api';
import { usePOSStore } from '../store/posStore';

interface AnalyticsSummary {
  period: string;
  dateRange: { start: string; end: string };
  grossSales: number;
  discounts: number;
  gstTotal: number;
  cgst: number;
  sgst: number;
  netSales: number;
  totalOrders: number;
  averageOrderValue: number;
  paymentBreakdown: {
    cash: { amount: number; count: number; percentage: number };
    upi: { amount: number; count: number; percentage: number };
    card: { amount: number; count: number; percentage: number };
    online: { amount: number; count: number; percentage: number };
  };
  channelBreakdown: {
    dineIn: { amount: number; count: number; percentage: number };
    takeaway: { amount: number; count: number; percentage: number };
    posDelivery: { amount: number; count: number; percentage: number };
    onlineApp: { amount: number; count: number; percentage: number };
  };
}

interface HourlyTrend {
  date: string;
  hours: Array<{ hour: string; label: string; sales: number; orders: number }>;
  peakHour: { hour: string; sales: number };
}

interface ProductItem {
  name: string;
  category: string;
  quantitySold: number;
  revenue: number;
}

export function POSDashboardPage() {
  const navigate = useNavigate();
  const { session } = usePOSStore();
  
  const [activeView, setActiveView] = useState<'terminal_bi' | 'google_sheets' | 'looker_studio' | 'monthly_reports'>('terminal_bi');
  const [period, setPeriod] = useState<'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'>('today');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [hourly, setHourly] = useState<HourlyTrend | null>(null);
  const [topProducts, setTopProducts] = useState<ProductItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Monthly Reports & PDF State
  const [selectedMonth, setSelectedMonth] = useState('2026-09');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [generatingSheets, setGeneratingSheets] = useState(false);
  const [sheetsResult, setSheetsResult] = useState<{ url?: string; spreadsheetId?: string } | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<any | null>(null);

  // Looker Studio & Google Sheets Config
  const [lookerConfig, setLookerConfig] = useState<{
    embedUrl: string;
    spreadsheetId: string | null;
    liveSheetUrl: string | null;
    lastSyncedAt: string;
  }>({
    embedUrl: '',
    spreadsheetId: null,
    liveSheetUrl: null,
    lastSyncedAt: ''
  });
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [newEmbedUrl, setNewEmbedUrl] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  // Cash Adjustment Modal
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjType, setAdjType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [submittingAdj, setSubmittingAdj] = useState(false);

  const handleDownloadMonthlyPdf = async () => {
    setDownloadingPdf(true);
    const toastId = toast.loading('Generating official Monthly PDF report for ' + selectedMonth + '...');
    try {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const monthNum = parseInt(monthStr, 10);
      const yearNum = parseInt(yearStr, 10);
      const franchiseId = session?.franchiseId || 'fra_primary';

      const res = await fetchPOSApi('/api/reports/pdf/' + monthNum + '?year=' + yearNum + '&franchiseId=' + franchiseId);
      if (!res.ok) {
        throw new Error('Failed to generate PDF on server');
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'OlivePizza_Report_' + selectedMonth + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      toast.success('Downloaded OlivePizza_Report_' + selectedMonth + '.pdf!', { id: toastId });
    } catch (err: any) {
      toast.error('PDF generation failed: ' + err.message, { id: toastId });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleGenerateGoogleSheets = async () => {
    setGeneratingSheets(true);
    const toastId = toast.loading('Provisioning Google Sheets report for ' + selectedMonth + '...');
    try {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const monthNum = parseInt(monthStr, 10);
      const yearNum = parseInt(yearStr, 10);
      const franchiseId = session?.franchiseId || 'fra_primary';

      const res = await fetchPOSApi('/api/reports/generate-monthly', {
        method: 'POST',
        body: JSON.stringify({
          month: monthNum,
          year: yearNum,
          franchiseId
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSheetsResult({ url: data.spreadsheetUrl, spreadsheetId: data.spreadsheetId });
        toast.success('Google Sheets created: ' + (data.title || 'Success'), { id: toastId });
      } else {
        toast.error('Sheets generation error: ' + (data.error || 'Server error'), { id: toastId });
      }
    } catch (err: any) {
      toast.error('Sheets error: ' + err.message, { id: toastId });
    } finally {
      setGeneratingSheets(false);
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [sumR, hourR, prodR, syncR, lookerR] = await Promise.all([
        fetchPOSApi(`/api/pos/analytics/summary?period=${period}`),
        fetchPOSApi('/api/pos/analytics/hourly-trend'),
        fetchPOSApi('/api/pos/analytics/product-performance?limit=6'),
        fetchPOSApi('/api/pos/analytics/sync-status'),
        fetchPOSApi('/api/pos/looker-studio/config')
      ]);

      const sumData = await sumR.json().catch(() => ({}));
      const hourData = await hourR.json().catch(() => ({}));
      const prodData = await prodR.json().catch(() => ({}));
      const syncData = await syncR.json().catch(() => ({}));
      const lookerData = await lookerR.json().catch(() => ({}));

      if (sumData.summary) setSummary(sumData.summary);
      if (hourData.trend) setHourly(hourData.trend);
      if (prodData.products) setTopProducts(prodData.products);
      if (syncData.syncHealth) setSyncStatus(syncData);
      if (lookerData.success) {
        setLookerConfig(lookerData);
        setNewEmbedUrl(lookerData.embedUrl || '');
      }
    } catch (err: any) {
      console.warn('[POS Dashboard] Error fetching analytics:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [period]);

  const handleSaveLookerUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmbedUrl) {
      toast.error('Please enter a Looker Studio Embed URL');
      return;
    }
    setSavingConfig(true);
    try {
      const res = await fetchPOSApi('/api/pos/looker-studio/set-embed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embedUrl: newEmbedUrl })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Looker Studio URL updated successfully!');
        setLookerConfig(prev => ({ ...prev, embedUrl: newEmbedUrl }));
        setShowConfigModal(false);
      } else {
        toast.error('Failed to update URL: ' + (data.error || 'Server error'));
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCashAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjAmount || Number(adjAmount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    setSubmittingAdj(true);
    const toastId = toast.loading('Recording drawer adjustment...');

    try {
      const res = await fetchPOSApi('/api/pos/shifts/cash-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: adjType,
          amount: Number(adjAmount),
          reason: adjReason || 'Cash adjustment'
        })
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`${adjType === 'CASH_IN' ? 'Cash In' : 'Cash Out'} of ₹${adjAmount} recorded!`, { id: toastId });
        setShowAdjModal(false);
        setAdjAmount('');
        setAdjReason('');
        loadDashboardData();
      } else {
        toast.error('Failed: ' + (data.error || 'Server error'), { id: toastId });
      }
    } catch (err: any) {
      toast.error('Adjustment failed: ' + err.message, { id: toastId });
    } finally {
      setSubmittingAdj(false);
    }
  };

  const maxHourlySales = hourly?.hours ? Math.max(...hourly.hours.map(h => h.sales), 100) : 100;

  const currentMonthName = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date());

  const sheetEmbedUrl = lookerConfig.spreadsheetId 
    ? `https://docs.google.com/spreadsheets/d/${lookerConfig.spreadsheetId}/htmlembed?widget=true&headers=false`
    : null;

  const sheetDirectEditUrl = lookerConfig.spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${lookerConfig.spreadsheetId}/edit?authuser=olivepizzarjn@gmail.com`
    : (lookerConfig.liveSheetUrl || 'https://docs.google.com/spreadsheets');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none">
      <header className="h-16 bg-zinc-950 border-b border-zinc-800 px-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/billing')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 hover:text-white transition active:scale-95 shadow-sm cursor-pointer"
            title="Return to Billing Terminal (F1)"
          >
            <ArrowLeft className="w-4 h-4 text-amber-400" />
            <span>Billing Terminal</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] rounded border border-zinc-700 font-mono">
              F1
            </kbd>
          </button>

          <div className="h-6 w-px bg-zinc-800 hidden sm:block"></div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-tight text-white">POS REPORTING & BI HUB</h1>
              <span className="text-[10px] uppercase font-bold tracking-widest bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30">
                LIVE
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              {session?.branchName || 'Olive Pizza — Rajnandgaon HQ'} • Terminal: <strong className="font-mono text-zinc-200">{session?.terminalId || 'POS-TERM-01'}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 3-View Tab Switcher */}
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setActiveView('terminal_bi')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeView === 'terminal_bi'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20 font-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Shift Metrics
            </button>
            <button
              onClick={() => setActiveView('google_sheets')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeView === 'google_sheets'
                  ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Google Sheets Reports
            </button>
            <button
              onClick={() => setActiveView('looker_studio')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeView === 'looker_studio'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20 font-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Looker Studio BI
            </button>
            <button
              onClick={() => setActiveView('monthly_reports')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeView === 'monthly_reports'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20 font-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Monthly PDF & Ledger
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-2 bg-zinc-900/90 px-3 py-1.5 rounded-xl border border-zinc-800 text-xs">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <div>
              <span className="text-[10px] text-zinc-400 block leading-tight">Google Sheets Sync</span>
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {syncStatus?.syncHealth || 'LIVE SYNCED'} (11 Structured Tabs)
              </span>
            </div>
          </div>

          <button
            onClick={loadDashboardData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition active:scale-95 cursor-pointer"
            title="Refresh Analytics (F5)"
          >
            <RefreshCw className={`w-4 h-4 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* VIEW 1: TERMINAL SHIFT BI */}
        {activeView === 'terminal_bi' && (
          <div className="space-y-6">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900 p-3 rounded-2xl border border-zinc-800">
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs font-semibold">
                {(['today', 'yesterday', 'this_week', 'this_month'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 rounded-lg transition capitalize cursor-pointer ${
                      period === p
                        ? 'bg-amber-500 text-black font-bold shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {p.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAdjModal(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 border border-zinc-700 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                  <span>Drawer Adjustment (Cash In/Out)</span>
                </button>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">Gross Sales</span>
                <div className="text-xl sm:text-2xl font-black text-white font-mono">
                  ₹{(summary?.grossSales || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-zinc-400">Total bills before discounts</div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">Discounts</span>
                <div className="text-xl sm:text-2xl font-black text-rose-400 font-mono">
                  -₹{(summary?.discounts || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-zinc-400">Promos & manual discounts</div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">GST Tax (5%)</span>
                <div className="text-xl sm:text-2xl font-black text-zinc-300 font-mono">
                  ₹{(summary?.gstTotal || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-zinc-400">CGST ₹{summary?.cgst || 0} + SGST ₹{summary?.sgst || 0}</div>
              </div>

              <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/30 p-4 rounded-2xl space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-amber-400 font-bold">Net Realized Revenue</span>
                <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
                  ₹{(summary?.netSales || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-zinc-400">{summary?.totalOrders || 0} Orders • AOV ₹{summary?.averageOrderValue || 0}</div>
              </div>
            </div>

            {/* Tenders & Channels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Payment Methods */}
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-amber-400" /> Tender & Payment Breakdown
                </h3>

                <div className="space-y-3">
                  {[
                    { label: 'Cash on Counter', data: summary?.paymentBreakdown?.cash, color: 'bg-emerald-500' },
                    { label: 'Dynamic UPI / QR', data: summary?.paymentBreakdown?.upi, color: 'bg-blue-500' },
                    { label: 'Card EDC', data: summary?.paymentBreakdown?.card, color: 'bg-purple-500' },
                    { label: 'Online Prepaid', data: summary?.paymentBreakdown?.online, color: 'bg-amber-500' },
                  ].map((t, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-zinc-300">{t.label}</span>
                        <span className="font-mono text-white font-bold">
                          ₹{(t.data?.amount || 0).toLocaleString('en-IN')}{' '}
                          <span className="text-[10px] text-zinc-500 font-normal">({t.data?.count || 0} txns)</span>
                        </span>
                      </div>
                      <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${t.color} rounded-full transition-all`}
                          style={{ width: `${t.data?.percentage || 0}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Channels */}
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-amber-400" /> Order Channel Breakdown
                </h3>

                <div className="space-y-3">
                  {[
                    { label: 'Dine-In Restaurant', data: summary?.channelBreakdown?.dineIn, color: 'bg-amber-500' },
                    { label: 'Takeaway / Parcel', data: summary?.channelBreakdown?.takeaway, color: 'bg-emerald-500' },
                    { label: 'Online App Orders', data: summary?.channelBreakdown?.onlineApp, color: 'bg-blue-500' },
                  ].map((c, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-zinc-300">{c.label}</span>
                        <span className="font-mono text-white font-bold">
                          ₹{(c.data?.amount || 0).toLocaleString('en-IN')}{' '}
                          <span className="text-[10px] text-zinc-500 font-normal">({c.data?.count || 0} orders)</span>
                        </span>
                      </div>
                      <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${c.color} rounded-full transition-all`}
                          style={{ width: `${c.data?.percentage || 0}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Products */}
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" /> Top Selling Menu Items
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {topProducts.length === 0 ? (
                  <p className="text-xs text-zinc-500 col-span-full">No product sales data in this period.</p>
                ) : (
                  topProducts.map((p, idx) => (
                    <div key={idx} className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white block">{p.name}</span>
                        <span className="text-[10px] text-zinc-500 capitalize">{p.category} • {p.quantitySold} sold</span>
                      </div>
                      <span className="font-mono text-xs font-bold text-amber-400">
                        ₹{p.revenue.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: GOOGLE SHEETS REPORTS (DIRECT 11-TAB SPREADSHEET VIEWER) */}
        {activeView === 'google_sheets' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    Dedicated Franchise Google Sheets Reports
                  </h2>
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-mono font-bold">
                    {currentMonthName}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  11 structured accounting tabs: Dashboard, Monthly Summary, Daily Sales, Order Details (1 Row = 1 Order), Product Sales, Payments, GST & Tax.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={sheetDirectEditUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Open Full Sheet (olivepizzarjn@gmail.com)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Quick 11-Tab Navigator Pill Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-xs">
              {[
                { title: '1. Dashboard', desc: 'KPIs & Channels' },
                { title: '2. Monthly Summary', desc: 'Rollup & AOV' },
                { title: '3. Daily Sales', desc: '31-Day Ledger' },
                { title: '4. Order Details', desc: '1 Order = 1 Row' },
                { title: '5. Product Sales', desc: '1 Item = 1 Row' },
                { title: '6. Payments', desc: 'Reconciliation' },
                { title: '7. GST & Tax', desc: '2.5% CGST + SGST' },
                { title: '8. Discounts', desc: 'Coupon Analytics' },
                { title: '9. Refunds', desc: 'Void Audits' },
                { title: '10. POS Summary', desc: 'Staff Shifts' },
                { title: '11. Adjustments', desc: 'Manager Audits' },
              ].map((tab, idx) => (
                <div key={idx} className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <strong className="text-white text-[11px] block">{tab.title}</strong>
                  <span className="text-[10px] text-zinc-500 block">{tab.desc}</span>
                </div>
              ))}
            </div>

            {/* Embedded Live Google Spreadsheet */}
            {sheetEmbedUrl ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
                <iframe
                  src={sheetEmbedUrl}
                  title="Olive Pizza Google Spreadsheet Reports"
                  className="w-full h-[650px] sm:h-[750px] border-0"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center space-y-4 max-w-xl mx-auto">
                <FileSpreadsheet className="w-10 h-10 mx-auto text-emerald-400" />
                <h3 className="text-base font-bold text-white">Google Spreadsheet Provisioning</h3>
                <p className="text-xs text-zinc-400">
                  Your dedicated franchise Google Spreadsheet is synced and ready. Click below to open directly in Google Sheets.
                </p>
                <a
                  href={sheetDirectEditUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl text-xs transition"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Open in Google Sheets
                </a>
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: GOOGLE LOOKER STUDIO HUB */}
        {activeView === 'looker_studio' && (
          <div className="space-y-4">
            {/* Looker Access & Permission Guidance Banner */}
            <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400 shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                    Why Looker Studio might show "You can't access it" & How to Fix:
                  </h3>
                  <div className="text-xs text-zinc-300 space-y-1 leading-relaxed">
                    <p>
                      1. <strong>Google Account:</strong> Ensure your browser or Looker Studio is logged in with{' '}
                      <strong className="text-amber-400 font-mono">olivepizzarjn@gmail.com</strong>.
                    </p>
                    <p>
                      2. <strong>Sharing Permission:</strong> In Looker Studio, click <strong>Share</strong> (top right) → Change General Access to{' '}
                      <strong>"Anyone with the link can view"</strong> (or add olivepizzarjn@gmail.com).
                    </p>
                    <p>
                      3. <strong>Embed URL:</strong> In Looker Studio, click <strong>File</strong> → <strong>Embed report</strong> → Check <strong>Enable embedding</strong> → Copy the <strong>Embed URL</strong> (must begin with <span className="font-mono text-amber-400">https://lookerstudio.google.com/embed/...</span>).
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <a
                    href="https://lookerstudio.google.com/navigation/reporting?authuser=olivepizzarjn@gmail.com"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl flex items-center gap-1.5 transition shadow-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Looker with olivepizzarjn@gmail.com</span>
                  </a>

                  <button
                    onClick={() => setShowConfigModal(true)}
                    className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition border border-zinc-700 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-amber-400" />
                    <span>Configure Embed URL</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Looker Studio iFrame Embed */}
            {lookerConfig.embedUrl ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
                <iframe
                  src={lookerConfig.embedUrl}
                  title="Olive Pizza Looker Studio POS Dashboard"
                  className="w-full h-[650px] sm:h-[750px] border-0"
                  allowFullScreen
                  sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
                />
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center space-y-4 max-w-xl mx-auto">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <BarChart3 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Google Looker Studio Integration</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Connect your published Looker Studio reporting dashboard URL to render interactive graphs and multi-branch analytics directly inside the POS terminal.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setShowConfigModal(true)}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg shadow-amber-500/20 cursor-pointer"
                  >
                    <LinkIcon className="w-3.5 h-3.5" /> Enter Looker Studio Embed URL
                  </button>

                  <a
                    href={sheetDirectEditUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border border-zinc-700"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> View Current Google Sheet
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 4: MONTHLY AUDIT & MULTI-PAGE PDF REPORT */}
        {activeView === 'monthly_reports' && (
          <div className="space-y-6">
            {/* Header / Month Selector Card */}
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-3xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white tracking-tight">Official Monthly PDF & Google Sheets Reporting</h2>
                    <p className="text-xs text-zinc-400">Deterministic multi-page audit report with complete bill-by-bill sales ledger</p>
                  </div>
                </div>

                {/* Month Picker & Actions */}
                <div className="flex items-center gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Select Month (YYYY-MM)</label>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="px-3.5 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="pt-4 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={downloadingPdf}
                      onClick={handleDownloadMonthlyPdf}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      <span>{downloadingPdf ? 'Generating PDF...' : 'Download Monthly PDF'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={generatingSheets}
                      onClick={handleGenerateGoogleSheets}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>{generatingSheets ? 'Syncing Sheets...' : 'Provision Google Sheet'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {sheetsResult && sheetsResult.url && (
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-emerald-300 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Dedicated Monthly Google Spreadsheet created with 6 structured tabs!</span>
                  </div>
                  <a
                    href={sheetsResult.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 bg-emerald-500 text-black font-bold rounded-lg text-xs hover:bg-emerald-400 transition"
                  >
                    Open Sheet ↗
                  </a>
                </div>
              )}
            </div>

            {/* 7 Mandatory Sections Documentation Card */}
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-3xl space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Official Multi-Page PDF Specification (7 Mandatory Sections)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {[
                  { num: 'Section 1', title: 'Monthly Summary & KPIs', desc: 'Total bills, gross sales, discounts, refunds, taxes, net sales, AOV' },
                  { num: 'Section 2', title: 'Complete Sales Ledger', desc: 'Every single bill in the month, date, time, customer, items, total, cashier' },
                  { num: 'Section 3', title: 'Daily Sales Summary', desc: 'Day-by-day table for all 31 days with bills count & daily totals' },
                  { num: 'Section 4', title: 'Payment Method Breakdown', desc: 'Cash, UPI, Card, Wallet, COD totals with transaction counts' },
                  { num: 'Section 5', title: 'Item Sales Breakdown', desc: 'Every product sold, total quantity, and revenue generated' },
                  { num: 'Section 6', title: 'Cancelled & Refunded Bills', desc: 'Bill #, date, customer, amount, and auditable reason' },
                  { num: 'Section 7', title: 'Final Accounting Balance', desc: 'Gross - Discounts - Refunds = Net Sales reconciliation' },
                  { num: 'Drive / Sheets', title: 'Google Drive Automation', desc: 'Saved under Olive Pizza Reports / [Franchise] / [Year]' },
                ].map((sec, i) => (
                  <div key={i} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1">
                    <span className="text-[10px] font-mono font-bold text-amber-400">{sec.num}</span>
                    <h4 className="text-xs font-bold text-white">{sec.title}</h4>
                    <p className="text-[11px] text-zinc-400 leading-tight">{sec.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Looker Studio Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Configure Looker Studio Embed URL</h3>
              </div>
              <button onClick={() => setShowConfigModal(false)} className="text-zinc-500 hover:text-white text-xs cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSaveLookerUrl} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">Looker Studio Embed URL *</label>
                <input
                  type="url"
                  required
                  value={newEmbedUrl}
                  onChange={(e) => setNewEmbedUrl(e.target.value)}
                  placeholder="https://lookerstudio.google.com/embed/reporting/..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                />
                <div className="mt-2 p-2.5 bg-zinc-950 rounded-xl border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                  <strong className="text-amber-400 block">How to get this URL in Looker Studio:</strong>
                  <p>1. Open your report in Looker Studio with <span className="text-zinc-200">olivepizzarjn@gmail.com</span>.</p>
                  <p>2. Click <strong>File → Embed report</strong>.</p>
                  <p>3. Check <strong>Enable embedding</strong> and select <strong>Embed URL</strong>.</p>
                  <p>4. Copy and paste the embed URL here.</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {savingConfig ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash Adjustment Modal */}
      {showAdjModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white">Record Cash Drawer Adjustment</h3>
              <button onClick={() => setShowAdjModal(false)} className="text-zinc-500 hover:text-white text-xs cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleCashAdjustment} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">Action</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjType('CASH_IN')}
                    className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      adjType === 'CASH_IN' ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    + Cash In (Deposit)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjType('CASH_OUT')}
                    className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      adjType === 'CASH_OUT' ? 'bg-rose-500 text-white border-rose-400' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    - Cash Out (Payout)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">Reason / Notes</label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="e.g. Petty cash for pantry supplies"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAdjModal(false)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdj}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingAdj ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

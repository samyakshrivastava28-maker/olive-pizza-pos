import React, { useState, useEffect } from 'react';
import { usePOSStore } from '../../store/posStore';
import { fetchPOSApi } from '../../lib/api';
import { 
  X, 
  Search, 
  Printer, 
  Calendar, 
  DollarSign, 
  Phone, 
  User, 
  ShoppingBag, 
  RotateCcw,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Tag,
  Receipt
} from 'lucide-react';
import { POSCompletedBill } from '../../types/pos';
import toast from 'react-hot-toast';

interface AdvancedBillSearchDrawerProps {
  onReprint: (bill: POSCompletedBill) => void;
}

export const AdvancedBillSearchDrawer: React.FC<AdvancedBillSearchDrawerProps> = ({ onReprint }) => {
  const { isHistoryOpen, setIsHistoryOpen, session, activeFranchiseId } = usePOSStore();

  // Search Filters
  const [permanentBillNo, setPermanentBillNo] = useState('');
  const [dailyOrderNo, setDailyOrderNo] = useState('');
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [orderSource, setOrderSource] = useState('');
  const [itemName, setItemName] = useState('');

  // Results State
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Execute Search against Authoritative PostgreSQL Canonical Orders Engine
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (permanentBillNo.trim()) params.set('permanentBillNo', permanentBillNo.trim());
      if (dailyOrderNo.trim()) params.set('dailyOrderNo', dailyOrderNo.trim());
      if (phone.trim()) params.set('phone', phone.trim());
      if (customerName.trim()) params.set('customerName', customerName.trim());
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      if (minAmount) params.set('minAmount', minAmount);
      if (maxAmount) params.set('maxAmount', maxAmount);
      if (paymentMethod) params.set('paymentMethod', paymentMethod);
      if (paymentStatus) params.set('paymentStatus', paymentStatus);
      if (orderSource) params.set('orderSource', orderSource);
      if (itemName.trim()) params.set('itemName', itemName.trim());
      if (activeFranchiseId) params.set('franchiseId', activeFranchiseId);

      const res = await fetchPOSApi(`/api/pos/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.orders || []);
        if ((data.orders || []).length === 0) {
          toast('No bills matched the search criteria', { icon: '🔍' });
        }
      } else {
        toast.error('Search request failed. Please check server.');
      }
    } catch (err: any) {
      toast.error('Search failed: ' + (err.message || 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  // Clear all filters and reload latest
  const handleClearFilters = () => {
    setPermanentBillNo('');
    setDailyOrderNo('');
    setPhone('');
    setCustomerName('');
    setFromDate('');
    setToDate('');
    setMinAmount('');
    setMaxAmount('');
    setPaymentMethod('');
    setPaymentStatus('');
    setOrderSource('');
    setItemName('');
    setResults([]);
  };

  // Load recent bills on open if empty
  useEffect(() => {
    if (isHistoryOpen) {
      handleSearch();
    }
  }, [isHistoryOpen]);

  if (!isHistoryOpen) return null;

  const handleReprint = (order: any) => {
    const completedBill: POSCompletedBill = {
      billNumber: order.daily_order_no ? `#${order.daily_order_no}` : (order.order_number || `#${order.id.slice(-6).toUpperCase()}`),
      permanentBillNo: order.permanent_bill_no || undefined,
      dailyOrderNumber: order.daily_order_no || undefined,
      orderId: order.id,
      orderSource: order.order_source || 'POS_DINE_IN',
      tableNumber: order.table_number || undefined,
      customerName: order.customer_name || 'Walk-in Customer',
      customerPhone: order.customer_phone || '',
      deliveryAddress: order.delivery_address || '',
      items: (order.items || []).map((it: any) => ({
        cartItemId: it.id || it.item_id || Math.random().toString(),
        productId: it.item_id || '',
        name: it.item_name || 'Menu Item',
        price: Number(it.unit_price) || 0,
        quantity: Number(it.quantity) || 1,
        size: it.size || 'Regular',
        crust: it.crust || 'Classic',
        addons: Array.isArray(it.addons) ? it.addons : []
      })),
      subtotal: Number(order.subtotal) || 0,
      discountAmount: Number(order.discount_amount) || 0,
      couponCode: order.coupon_code || undefined,
      taxAmount: Number(order.tax_amount) || 0,
      deliveryFee: Number(order.delivery_fee) || 0,
      finalTotal: Number(order.final_total) || 0,
      payment: {
        method: (order.payment_method || 'CASH').toUpperCase() as any,
        cashReceived: Number(order.final_total) || 0,
      },
      session: {
        cashierName: order.cashier_name || session?.cashierName || 'Cashier',
        cashierUid: session?.cashierUid || 'pos_uid',
        terminalId: order.terminal_id || session?.terminalId || 'POS-TERM-01',
        branchId: order.branch_id || session?.branchId || 'main_branch',
        branchName: session?.branchName || 'Olive Pizza',
        franchiseId: order.franchise_id || session?.franchiseId || 'fra_primary',
        organizationId: 'org_olive_pizza'
      },
      createdAt: order.created_at || new Date().toISOString()
    };

    onReprint(completedBill);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex justify-end animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl">
        
        {/* Drawer Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">Advanced Bill / Order Search</h2>
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-[10px] font-mono font-bold">
                  POSTGRESQL AUDIT
                </span>
              </div>
              <p className="text-xs text-zinc-400">Deterministic SQL search across all permanent bills & items</p>
            </div>
          </div>
          <button 
            onClick={() => setIsHistoryOpen(false)}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls Form */}
        <form onSubmit={handleSearch} className="p-4 border-b border-zinc-800 bg-zinc-900/40 space-y-3">
          {/* Row 1: Primary identifiers */}
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="text-[10px] uppercase font-bold text-amber-400 block mb-1">Permanent Bill #</label>
              <input
                type="number"
                placeholder="e.g. 104"
                value={permanentBillNo}
                onChange={(e) => setPermanentBillNo(e.target.value)}
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Daily Order #</label>
              <input
                type="number"
                placeholder="e.g. 12"
                value={dailyOrderNo}
                onChange={(e) => setDailyOrderNo(e.target.value)}
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Phone Number</label>
              <input
                type="text"
                placeholder="Prefix or 10-digit"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Row 2: Customer name & Item name */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Customer Name</label>
              <input
                type="text"
                placeholder="Search name..."
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Pizza / Item Name</label>
              <input
                type="text"
                placeholder="e.g. Margherita, Farmhouse..."
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Collapsible Advanced Filters */}
          {showAdvancedFilters && (
            <div className="pt-2 border-t border-zinc-800/80 space-y-2.5 animate-in fade-in duration-150">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">From Date (IST)</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">To Date (IST)</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Channel</label>
                  <select
                    value={orderSource}
                    onChange={(e) => setOrderSource(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">All Channels</option>
                    <option value="POS_DINE_IN">Dine-In</option>
                    <option value="POS_TAKEAWAY">Takeaway</option>
                    <option value="POS_DELIVERY">POS Delivery</option>
                    <option value="CUSTOMER_APP">Online App</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">All Methods</option>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                    <option value="WALLET">Wallet</option>
                    <option value="COD">COD</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Status</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">All Statuses</option>
                    <option value="PAID">Paid</option>
                    <option value="REFUNDED">Refunded</option>
                    <option value="PENDING">Pending</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Min Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Max Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="10000"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>{showAdvancedFilters ? 'Fewer Filters' : 'More Filters (Date, Amount, Channel)'}</span>
              {showAdvancedFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-xl text-xs transition flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{loading ? 'Searching...' : 'Search Bills'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Results Count Bar */}
        <div className="px-4 py-2 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
          <span>Found <strong className="text-white font-mono">{results.length}</strong> matching bills</span>
          <span className="text-[11px] text-zinc-500">Sorted by newest timestamp</span>
        </div>

        {/* Bills Results Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {results.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 space-y-2">
              <Receipt className="w-10 h-10 mx-auto text-zinc-700" />
              <div className="text-xs font-bold text-zinc-400">No Matching Bills Found</div>
              <p className="text-[11px] text-zinc-600 max-w-xs mx-auto">
                Try searching by Permanent Bill #, Customer Phone, Date, or Item Name.
              </p>
            </div>
          ) : (
            results.map((order) => {
              const isExpanded = expandedOrderId === order.id;
              const isPaid = (order.payment_status || '').toUpperCase() === 'PAID';
              const isRefunded = (order.payment_status || '').toUpperCase() === 'REFUNDED';
              const isOnline = order.order_source === 'CUSTOMER_APP' || order.order_source === 'ONLINE';

              return (
                <div 
                  key={order.id}
                  className="rounded-2xl bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 transition overflow-hidden"
                >
                  {/* Bill Card Summary Row */}
                  <div className="p-3.5 flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-black text-xs rounded-md">
                          BILL #{order.permanent_bill_no ?? '—'}
                        </span>
                        <span className="text-xs font-mono font-bold text-zinc-300">
                          {order.daily_order_no ? `Daily #${order.daily_order_no}` : (order.order_number || order.id.slice(-6).toUpperCase())}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isPaid ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                          isRefunded ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' :
                          'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}>
                          {order.payment_status || 'PAID'}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                          {order.order_source ? order.order_source.replace('POS_', '').replace('_', ' ') : 'DINE IN'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-zinc-400">
                        <span className="text-white font-semibold flex items-center gap-1">
                          <User className="w-3 h-3 text-zinc-500" />
                          {order.customer_name || 'Walk-in'}
                        </span>
                        {order.customer_phone && (
                          <span className="font-mono text-zinc-400 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-zinc-500" />
                            {order.customer_phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                          <Clock className="w-3 h-3" />
                          {order.order_date ? new Date(order.order_date).toLocaleDateString('en-IN') : ''} • {order.order_time || ''}
                        </span>
                      </div>
                    </div>

                    {/* Amount & Quick Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-base font-black text-white font-mono">
                          ₹{Number(order.final_total || 0).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-zinc-400 uppercase font-mono">
                          {order.payment_method || 'CASH'}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleReprint(order)}
                          className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition cursor-pointer"
                          title="Reprint Thermal Receipt"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                          className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
                          title="Toggle Items & Details"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Line Items Detail View */}
                  {isExpanded && (
                    <div className="px-4 py-3 bg-zinc-950/80 border-t border-zinc-800/80 space-y-2.5 text-xs">
                      <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                        Ordered Line Items ({order.items?.length || 0})
                      </div>

                      <div className="space-y-1.5">
                        {(order.items || []).map((it: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between text-zinc-300 py-1 border-b border-zinc-900">
                            <div>
                              <span className="font-bold text-white">{it.quantity}x {it.item_name}</span>
                              <span className="text-[10px] text-zinc-500 ml-2">
                                ({[it.size, it.crust].filter(Boolean).join(' • ')})
                              </span>
                            </div>
                            <span className="font-mono font-bold text-zinc-200">
                              ₹{(Number(it.unit_price || 0) * Number(it.quantity || 1)).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 flex items-center justify-between text-[11px] text-zinc-500 border-t border-zinc-900">
                        <span>Terminal: <strong className="text-zinc-400 font-mono">{order.terminal_id || 'POS-01'}</strong> • Cashier: <strong className="text-zinc-400">{order.cashier_name || 'Staff'}</strong></span>
                        <span className="font-mono">Subtotal: ₹{order.subtotal} | Tax: ₹{order.tax_amount}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { usePOSStore } from '../../store/posStore';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  X, 
  Search, 
  Printer, 
  Clock, 
  Receipt, 
  RefreshCw, 
  User, 
  Phone,
  Globe,
  UtensilsCrossed
} from 'lucide-react';
import { POSCompletedBill } from '../../types/pos';

interface BillHistoryDrawerProps {
  onReprint: (bill: POSCompletedBill) => void;
}

export const BillHistoryDrawer: React.FC<BillHistoryDrawerProps> = ({ onReprint }) => {
  const { isHistoryOpen, setIsHistoryOpen, session } = usePOSStore();
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBill, setSelectedBill] = useState<any | null>(null);
  const [filterChannel, setFilterChannel] = useState<'ALL' | 'ONLINE' | 'POS' | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'>('ALL');

  const fetchRecentBills = async () => {
    setLoading(true);
    try {
      const ordersRef = collection(db, 'orders');
      const q = query(ordersRef, orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocs(q);

      const fetched = snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          formattedDate: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'),
          formattedTime: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        };
      });

      setBills(fetched);
    } catch (err) {
      console.error('Failed to fetch bill history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isHistoryOpen) {
      fetchRecentBills();
    }
  }, [isHistoryOpen]);

  if (!isHistoryOpen) return null;

  const filteredBills = bills.filter(b => {
    const isOnline = b.orderSource === 'CUSTOMER_APP' || b.orderSource === 'ONLINE' || (!b.orderSource && b.deliveryType);
    const orderSource = (b.orderSource || '').toUpperCase();

    if (filterChannel === 'ONLINE' && !isOnline) return false;
    if (filterChannel === 'POS' && isOnline) return false;
    if (filterChannel === 'DINE_IN' && orderSource !== 'POS_DINE_IN' && b.deliveryType !== 'dine_in') return false;
    if (filterChannel === 'TAKEAWAY' && orderSource !== 'POS_TAKEAWAY' && b.deliveryType !== 'pickup') return false;
    if (filterChannel === 'DELIVERY' && orderSource !== 'POS_DELIVERY' && b.deliveryType !== 'delivery') return false;

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const orderNum = (b.daily_order_number || b.dailyOrderNumber || b.orderNumber || b.id || '').toString().toLowerCase();
    const customer = (b.customerName || '').toLowerCase();
    const phone = (b.contactPhone || b.phone || '').toLowerCase();
    return orderNum.includes(q) || customer.includes(q) || phone.includes(q);
  });

  const handlePrintBill = (b: any) => {
    const billObj: POSCompletedBill = {
      billNumber: b.daily_order_number || (b.dailyOrderNumber ? `#${b.dailyOrderNumber}` : (b.orderNumber || b.id.slice(-6).toUpperCase())),
      orderId: b.id,
      orderSource: b.orderSource || (b.deliveryType ? 'CUSTOMER_APP' : 'POS_DINE_IN'),
      tableNumber: b.tableNumber,
      customerName: b.customerName || 'Walk-in Customer',
      customerPhone: b.contactPhone || b.phone || '',
      deliveryAddress: b.deliveryAddress?.addressLine || (typeof b.deliveryAddress === 'string' ? b.deliveryAddress : ''),
      items: Array.isArray(b.items) ? b.items.map((it: any) => ({
        cartItemId: it.id || it.productId || Math.random().toString(),
        productId: it.id || it.productId || '',
        name: it.name || it.productName || 'Item',
        price: it.price || 0,
        quantity: it.quantity || 1,
        size: it.size || 'Regular',
        crust: it.crust || 'Classic Hand-Tossed',
        addons: it.addons || [],
        kitchenNotes: it.kitchenNotes || it.instructions || '',
      })) : [],
      subtotal: b.subtotal || b.totalAmount || 0,
      discountAmount: b.discountAmount || 0,
      couponCode: b.appliedCouponCode,
      taxAmount: b.taxes || Math.round((b.totalAmount || 0) * 0.05),
      deliveryFee: b.deliveryFee || 0,
      finalTotal: b.totalAmount || 0,
      payment: {
        method: (b.paymentMethod || 'CASH').toUpperCase() as any,
        transactionRef: b.paymentId,
      },
      session: {
        cashierName: b.cashierName || session?.cashierName || 'Counter Cashier',
        cashierUid: session?.cashierUid || 'cashier_uid',
        terminalId: b.terminalId || session?.terminalId || 'POS-TERM-01',
        branchId: b.branchId || session?.branchId || 'main_branch',
        branchName: b.branchName || session?.branchName || 'Olive Pizza — Rajnandgaon HQ',
        franchiseId: b.franchiseId || session?.franchiseId || 'fra_primary',
        organizationId: b.organizationId || session?.organizationId || 'org_olive_pizza',
      },
      createdAt: b.createdAt?.toDate ? b.createdAt.toDate().toISOString() : new Date().toISOString(),
    };

    onReprint(billObj);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Unified Restaurant Order History (F10)</h2>
              <p className="text-xs text-zinc-400">Canonical order records across Online, Dine-In, Takeaway, and Delivery</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchRecentBills}
              disabled={loading}
              className="p-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white transition cursor-pointer"
              title="Refresh Bills"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button
              onClick={() => setIsHistoryOpen(false)}
              className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Channel Filters */}
        <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/40 flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: 'ALL', label: 'All Orders' },
            { id: 'ONLINE', label: 'Online App' },
            { id: 'POS', label: 'Physical POS' },
            { id: 'DINE_IN', label: 'Dine-In' },
            { id: 'TAKEAWAY', label: 'Takeaway' },
            { id: 'DELIVERY', label: 'Delivery' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterChannel(tab.id as any)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                filterChannel === tab.id
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="p-3.5 border-b border-zinc-800 bg-zinc-900/80">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Bill #, Customer Name, or Phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>
        </div>

        {/* Bills List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && bills.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
              <RefreshCw className="w-6 h-6 animate-spin mb-2 text-amber-400" />
              <p className="text-xs">Loading orders from canonical backend...</p>
            </div>
          ) : filteredBills.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs font-bold text-zinc-400">No orders found in this filter</p>
            </div>
          ) : (
            filteredBills.map((b) => {
              const isSelected = selectedBill?.id === b.id;
              const isOnline = b.orderSource === 'CUSTOMER_APP' || b.orderSource === 'ONLINE' || (!b.orderSource && b.deliveryType);
              const billNo = b.daily_order_number || (b.dailyOrderNumber ? `#${b.dailyOrderNumber}` : (b.orderNumber || b.id.slice(-6).toUpperCase()));
              const isPaid = (b.paymentStatus || '').toUpperCase() === 'PAID';
              const isCOD = (b.paymentMethod || '').toUpperCase() === 'COD';

              return (
                <div
                  key={b.id}
                  className={`p-3.5 rounded-2xl border transition cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 border-amber-500/60 shadow-lg ring-1 ring-amber-500/30'
                      : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                  }`}
                  onClick={() => setSelectedBill(isSelected ? null : b)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-amber-400 text-sm">{billNo}</span>
                        
                        {isOnline ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                            <Globe className="w-3 h-3" /> ONLINE ORDER
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <UtensilsCrossed className="w-3 h-3" /> PHYSICAL BILL
                          </span>
                        )}

                        {b.tableNumber && (
                          <span className="text-[10px] bg-zinc-800 text-amber-300 px-2 py-0.5 rounded font-mono font-bold">
                            {b.tableNumber}
                          </span>
                        )}

                        {isPaid ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                            PAID ONLINE
                          </span>
                        ) : isCOD ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                            COD (PAYMENT DUE)
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-400">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-zinc-500" />
                          {b.customerName || 'Walk-in'}
                        </span>
                        {(b.contactPhone || b.phone) && (
                          <span className="flex items-center gap-1 font-mono text-[11px]">
                            <Phone className="w-3 h-3 text-zinc-500" />
                            {b.contactPhone || b.phone}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-black text-white font-mono">
                        ₹{b.totalAmount || 0}
                      </div>
                      <div className="text-[10px] text-zinc-500 flex items-center gap-1 justify-end mt-0.5 font-mono">
                        <Clock className="w-3 h-3" />
                        {b.formattedTime}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isSelected && (
                    <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2.5 animate-in fade-in duration-150">
                      <div className="text-[11px] font-bold text-zinc-300">Ordered Items:</div>
                      <div className="space-y-1 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/80">
                        {Array.isArray(b.items) && b.items.map((it: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-xs text-zinc-300">
                            <span>
                              {it.quantity || 1}x {it.name || it.productName}{' '}
                              <span className="text-zinc-500 text-[10px]">({it.size || 'Reg'}, {it.crust || 'Hand-Tossed'})</span>
                            </span>
                            <span className="font-mono text-zinc-400">₹{(it.price || 0) * (it.quantity || 1)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="text-[11px] text-zinc-400">
                          Mode: <span className="font-bold text-zinc-200">{b.paymentMethod || 'CASH'}</span>
                          {b.cashierName && <span> • Staff: {b.cashierName}</span>}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrintBill(b);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs transition active:scale-95 shadow-md cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Reprint Thermal Bill
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-500">
          <span>{filteredBills.length} records in view</span>
          <span className="font-mono">{session?.branchName || 'Olive Pizza'}</span>
        </div>
      </div>
    </div>
  );
};

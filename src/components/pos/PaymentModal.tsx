import React, { useState } from 'react';
import { usePOSStore, getPOSCalculations } from '../../store/posStore';
import { POSCompletedBill, POSPaymentDetails } from '../../types/pos';
import { fetchPOSApi } from '../../lib/api';
import { OfflineBillingQueueService } from '../../services/OfflineBillingQueueService';
import { ThermalPrinterService } from '../../services/ThermalPrinterService';
import { 
  X, Banknote, QrCode, CreditCard, Layers, CheckCircle2, 
  Printer, ArrowRight, Loader2, Sparkles 
} from 'lucide-react';

interface PaymentModalProps {
  onClose: () => void;
  onCompleteBill: (bill: POSCompletedBill) => void;
}

const QUICK_CASH_DENOMS = [100, 200, 500, 1000, 2000];

export const PaymentModal: React.FC<PaymentModalProps> = ({ onClose, onCompleteBill }) => {
  const {
    items,
    discountAmount,
    couponCode,
    deliveryFee,
    orderSource,
    tableNumber,
    customerId,
    customerName,
    customerPhone,
    isWalkinCustomer,
    deliveryAddress,
    session,
    resetOrder,
  } = usePOSStore();

  const calcs = getPOSCalculations({ items, discountAmount, deliveryFee });
  
  const [method, setMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'SPLIT'>('CASH');
  const [cashReceived, setCashReceived] = useState<number>(calcs.finalTotal);
  const [splitCash, setSplitCash] = useState<number>(Math.floor(calcs.finalTotal / 2));
  const [cardRef, setCardRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cashChange = Math.max(0, cashReceived - calcs.finalTotal);
  const splitRemaining = Math.max(0, calcs.finalTotal - splitCash);

  const handleProcessPayment = async () => {
    setLoading(true);
    setError(null);

    const paymentDetails: POSPaymentDetails = {
      method,
      cashReceived: method === 'CASH' ? cashReceived : undefined,
      cashChange: method === 'CASH' ? cashChange : undefined,
      cardAmount: method === 'CARD' ? calcs.finalTotal : undefined,
      upiAmount: method === 'UPI' ? calcs.finalTotal : undefined,
      splitCash: method === 'SPLIT' ? splitCash : undefined,
      splitUPI: method === 'SPLIT' ? splitRemaining : undefined,
      transactionRef: cardRef || undefined,
    };

    const payload = {
      userId: isWalkinCustomer ? 'pos_counter_walkin' : (customerId || 'pos_customer'),
      customerId: isWalkinCustomer ? null : (customerId || null),
      orderSource,
      tableNumber: orderSource === 'POS_DINE_IN' ? tableNumber : undefined,
      customerName: customerName || 'Walk-in Customer',
      contactPhone: customerPhone || '9999999999',
      deliveryAddress: orderSource === 'POS_DINE_IN' ? ('Dine-In Table ' + tableNumber) : 'Takeaway Counter',
      items: items.map((it) => ({
        id: it.productId,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        size: it.size,
        crust: it.crust,
        addons: it.addons,
        instructions: it.kitchenNotes,
      })),
      discountAmount: calcs.discountAmount,
      couponCode: couponCode || undefined,
      deliveryFee: calcs.deliveryFee,
      paymentMethod: method,
      paymentDetails,
      session: {
        cashierName: session?.cashierName || 'Counter Cashier',
        terminalId: session?.terminalId || 'POS-TERM-01',
        branchId: session?.branchId || 'main_branch',
        branchName: session?.branchName || 'Olive Pizza — Rajnandgaon HQ',
        franchiseId: session?.franchiseId || 'fra_primary',
        organizationId: session?.organizationId || 'org_olive_pizza',
      },
    };

    try {
      let orderId = '';
      let billNumber = '';
      let isOffline = false;

      if (!navigator.onLine) {
        isOffline = true;
      } else {
        try {
          const res = await fetchPOSApi('/api/pos/orders', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            const resData = await res.json();
            orderId = resData.orderId || ('ord_pos_' + Date.now());
            billNumber = resData.dailyOrderNumber 
              ? `#${resData.dailyOrderNumber}` 
              : (resData.orderNumber || orderId.slice(-6).toUpperCase());
          } else {
            isOffline = true;
          }
        } catch (netErr) {
          console.warn('Network error placing order on server, falling back to offline queue:', netErr);
          isOffline = true;
        }
      }

      if (isOffline) {
        orderId = 'ord_off_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        billNumber = `#OFF-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      const completedBill: POSCompletedBill = {
        billNumber,
        orderId,
        orderSource,
        tableNumber: orderSource === 'POS_DINE_IN' ? tableNumber : undefined,
        customerName: customerName || 'Walk-in Customer',
        customerPhone: customerPhone || '',
        deliveryAddress,
        items,
        subtotal: calcs.subtotal,
        discountAmount: calcs.discountAmount,
        couponCode,
        taxAmount: calcs.taxAmount,
        deliveryFee: calcs.deliveryFee,
        finalTotal: calcs.finalTotal,
        payment: paymentDetails,
        session: session || {
          cashierName: 'Counter Cashier',
          cashierUid: 'pos_uid',
          terminalId: 'POS-TERM-01',
          branchId: 'main_branch',
          branchName: 'Olive Pizza — Rajnandgaon HQ',
          franchiseId: 'fra_primary',
          organizationId: 'org_olive_pizza',
        },
        createdAt: new Date().toISOString(),
      };

      if (isOffline) {
        OfflineBillingQueueService.enqueueOfflineBill(completedBill);
      }

      // Automatically send to configured thermal printer with zero cashier intervention
      ThermalPrinterService.autoPrintCompletedBill(completedBill).catch((pErr) => {
        console.warn('[PaymentModal] Auto print background error:', pErr);
      });

      onCompleteBill(completedBill);
      resetOrder();
      onClose();
    } catch (err: any) {
      console.error('POS order settlement error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to complete transaction.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-xl rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Settle Restaurant Bill</span>
              <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20 text-base">
                ₹{calcs.finalTotal}
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {orderSource.replace('POS_', '')} • {customerName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Payment Method Selector */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-2">
              Select Payment Method
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setMethod('CASH')}
                className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1.5 active:scale-95 ${
                  method === 'CASH'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400 font-bold ring-1 ring-emerald-500/40'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <Banknote className="w-5 h-5" />
                <span className="text-xs">Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod('UPI')}
                className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1.5 active:scale-95 ${
                  method === 'UPI'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-400 font-bold ring-1 ring-amber-500/40'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <QrCode className="w-5 h-5" />
                <span className="text-xs">UPI QR</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod('CARD')}
                className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1.5 active:scale-95 ${
                  method === 'CARD'
                    ? 'bg-blue-500/15 border-blue-500 text-blue-400 font-bold ring-1 ring-blue-500/40'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <CreditCard className="w-5 h-5" />
                <span className="text-xs">Card / EDC</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod('SPLIT')}
                className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1.5 active:scale-95 ${
                  method === 'SPLIT'
                    ? 'bg-purple-500/15 border-purple-500 text-purple-400 font-bold ring-1 ring-purple-500/40'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <Layers className="w-5 h-5" />
                <span className="text-xs">Split Pay</span>
              </button>
            </div>
          </div>

          {/* Mode 1: CASH Settlement & Change Due Calculator */}
          {method === 'CASH' && (
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-4">
              <div>
                <label className="text-xs text-zinc-400 block mb-1.5 font-medium">Cash Received from Customer:</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-zinc-500 text-base">₹</span>
                  <input
                    type="number"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(Number(e.target.value) || 0)}
                    className="w-full pl-8 pr-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl text-lg font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCashReceived(calcs.finalTotal)}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono font-bold text-zinc-300 rounded-lg border border-zinc-700 transition"
                >
                  Exact (₹{calcs.finalTotal})
                </button>
                {QUICK_CASH_DENOMS.filter((d) => d >= calcs.finalTotal).map((den) => (
                  <button
                    key={den}
                    type="button"
                    onClick={() => setCashReceived(den)}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono font-bold text-zinc-300 rounded-lg border border-zinc-700 transition"
                  >
                    ₹{den}
                  </button>
                ))}
              </div>

              {/* Change Due Display */}
              <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">Return Change to Customer:</span>
                <span className={`text-xl font-mono font-black ${cashChange > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  ₹{cashChange}
                </span>
              </div>
            </div>
          )}

          {/* Mode 2: UPI QR Code Display */}
          {method === 'UPI' && (
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-center space-y-3">
              <div className="w-36 h-36 mx-auto bg-white p-2 rounded-xl shadow-inner flex items-center justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=upi://pay?pa=olivepizza.rjn@okaxis&pn=OlivePizza&am=${calcs.finalTotal}&cu=INR`}
                  alt="UPI QR Code"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="text-xs text-zinc-400">
                Customer scans with <span className="text-amber-400 font-bold">GPay, PhonePe, Paytm</span>
              </div>
              <div className="font-mono text-xs text-zinc-500 bg-zinc-900 py-1.5 px-3 rounded-lg inline-block border border-zinc-800">
                UPI ID: olivepizza.rjn@okaxis
              </div>
            </div>
          )}

          {/* Mode 3: Card / EDC Machine Reference */}
          {method === 'CARD' && (
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
              <p className="text-xs text-zinc-400">
                Swipe/Tap card on EDC machine for <span className="font-bold text-white">₹{calcs.finalTotal}</span>.
              </p>
              <div>
                <label className="text-xs text-zinc-400 block mb-1 font-medium">Approval / Reference Code (Optional):</label>
                <input
                  type="text"
                  placeholder="e.g. EDC-TXN-89421"
                  value={cardRef}
                  onChange={(e) => setCardRef(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Mode 4: Split Payment (Cash + UPI/Card) */}
          {method === 'SPLIT' && (
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1 font-medium">Cash Portion (₹):</label>
                  <input
                    type="number"
                    value={splitCash}
                    onChange={(e) => setSplitCash(Math.min(calcs.finalTotal, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono font-bold text-emerald-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1 font-medium">UPI / Card Portion (₹):</label>
                  <div className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono font-bold text-amber-400">
                    ₹{splitRemaining}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl transition"
          >
            Back
          </button>

          <button
            type="button"
            onClick={handleProcessPayment}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-zinc-950 font-black text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Bill & Syncing...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                <span>Complete Bill & Print (Enter)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

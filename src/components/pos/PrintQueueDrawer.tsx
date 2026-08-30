import React from 'react';
import { usePOSStore } from '../../store/posStore';
import { OnlineOrderPrintListener } from '../../services/OnlineOrderPrintListener';
import { 
  X, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  RefreshCw, 
  Globe,
  MapPin,
  Sparkles
} from 'lucide-react';

export const PrintQueueDrawer: React.FC = () => {
  const { 
    isPrintQueueOpen, 
    setIsPrintQueueOpen, 
    pendingOnlineOrders,
    session 
  } = usePOSStore();

  if (!isPrintQueueOpen) return null;

  const handleManualPrint = async (order: any) => {
    await OnlineOrderPrintListener.manualPrintOrder(order);
  };

  const handleRefresh = async () => {
    await OnlineOrderPrintListener.checkAndProcessPendingPrints();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Online Orders Live Queue</h2>
                <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-[10px] font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  AUTO-PRINT ACTIVE
                </span>
              </div>
              <p className="text-xs text-zinc-400">Customer app orders accepted by Restaurant Manager</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleRefresh}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl transition cursor-pointer"
              title="Refresh Orders"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setIsPrintQueueOpen(false)}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Operational Notice */}
        <div className="p-3.5 bg-zinc-900/90 border-b border-zinc-800 text-[11px] text-zinc-300 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-white block font-bold">Automatic Bill Generation Active</strong>
            Online orders are placed by customers and accepted in Restaurant Management. POS automatically creates and prints the official kitchen bill. <span className="text-amber-400 font-bold">No manual cashier re-billing required.</span>
          </div>
        </div>

        {/* Queue List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {pendingOnlineOrders.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/40" />
              <div className="text-xs font-bold text-zinc-400">No Pending Online Orders</div>
              <p className="text-[11px] text-zinc-600 max-w-xs mx-auto">
                When online orders are accepted by Restaurant Management, they will automatically appear here and trigger thermal printing.
              </p>
            </div>
          ) : (
            pendingOnlineOrders.map((order) => {
              const isPaid = (order.paymentStatus || '').toUpperCase() === 'PAID';
              const isCOD = (order.paymentMethod || '').toUpperCase() === 'COD';
              const isPrinted = order.printStatus === 'PRINTED';
              const isFailed = order.printStatus === 'PRINT_FAILED';

              return (
                <div 
                  key={order.id}
                  className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 space-y-3 transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400 text-sm">
                          {order.dailyOrderNumber ? ('#' + order.dailyOrderNumber) : (order.orderNumber || ('#' + order.id.slice(-6).toUpperCase()))}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/30 font-bold">
                          ONLINE DELIVERY
                        </span>
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

                      <div className="text-xs text-white font-bold mt-1">
                        {order.customerName || 'Online Customer'} • <span className="font-mono text-zinc-400">{order.contactPhone || order.phone || 'N/A'}</span>
                      </div>

                      {order.deliveryAddress && (
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                          <span className="truncate max-w-xs">{order.deliveryAddress?.addressLine || (typeof order.deliveryAddress === 'string' ? order.deliveryAddress : '')}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-black text-white text-base">
                        ₹{order.totalAmount || 0}
                      </div>
                      <span className="text-[10px] text-emerald-400 font-bold block mt-0.5">
                        {order.status || 'Accepted'}
                      </span>
                    </div>
                  </div>

                  {/* Items summary */}
                  <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/60 space-y-1 text-xs text-zinc-300">
                    {Array.isArray(order.items) && order.items.map((it: any, idx: number) => (
                      <div key={idx} className="flex justify-between">
                        <span>{it.quantity}x {it.name || it.productName} <span className="text-[10px] text-zinc-500">({it.size || it.selectedSize || 'Reg'})</span></span>
                        <span className="font-mono text-zinc-400">₹{(it.price || it.unitPrice || 0) * (it.quantity || 1)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Print Action Status */}
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80">
                    <div className="text-[11px] flex items-center gap-1.5">
                      {isPrinted ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Printed ✓
                        </span>
                      ) : isFailed ? (
                        <span className="text-rose-400 flex items-center gap-1 font-bold">
                          <AlertCircle className="w-3.5 h-3.5" /> Print Failed (Retry)
                        </span>
                      ) : (
                        <span className="text-zinc-400 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> Auto-Print Ready
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleManualPrint(order)}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isPrinted ? 'Reprint Bill' : 'Print Bill Now'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400">
          <span>Terminal: <strong className="font-mono text-zinc-200">{session?.terminalId || 'POS-TERM-01'}</strong></span>
          <span>{pendingOnlineOrders.length} online orders in monitor</span>
        </div>
      </div>
    </div>
  );
};

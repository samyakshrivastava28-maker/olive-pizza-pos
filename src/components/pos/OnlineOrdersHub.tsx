import React, { useState, useEffect, useRef } from 'react';
import { usePOSStore } from '../../store/posStore';
import { fetchPOSApi } from '../../lib/api';
import { ThermalPrinterService } from '../../services/ThermalPrinterService';
import { 
  Globe, 
  Clock, 
  MapPin, 
  Phone, 
  User, 
  Check, 
  X, 
  Printer, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  AlertCircle,
  CheckCircle2,
  ChefHat,
  PackageCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

export const OnlineOrdersHub: React.FC = () => {
  const { activeBranchId, activeFranchiseId, session } = usePOSStore();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('Store busy / ingredients unavailable');
  const [actionLoading, setActionLoading] = useState(false);
  const previousPendingCount = useRef<number>(0);

  // Play audio chime when new online order arrives
  const playChime = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch {
      // Audio context might be restricted before user gesture
    }
  };

  const fetchLiveOrders = async () => {
    try {
      const res = await fetchPOSApi(`/api/pos/online-orders/live?branchId=${activeBranchId}&franchiseId=${activeFranchiseId}`);
      if (res.ok) {
        const data = await res.json();
        const incoming = data.orders || [];
        
        // Count newly arrived pending orders
        const pendingCount = incoming.filter((o: any) => (o.order_status || '').toUpperCase() === 'PENDING').length;
        if (pendingCount > previousPendingCount.current) {
          playChime();
          toast('New customer online order received!', { icon: '🔔', duration: 4000 });
        }
        previousPendingCount.current = pendingCount;
        setOrders(incoming);
      }
    } catch (err) {
      console.warn('[OnlineOrdersHub] Failed to fetch live online orders:', err);
    }
  };

  // Poll live orders every 5 seconds
  useEffect(() => {
    fetchLiveOrders();
    const interval = setInterval(fetchLiveOrders, 5000);
    return () => clearInterval(interval);
  }, [activeBranchId, activeFranchiseId]);

  const handleAcceptOrder = async (order: any) => {
    setActionLoading(true);
    try {
      const res = await fetchPOSApi(`/api/pos/online-orders/${order.id}/accept`, {
        method: 'POST'
      });
      if (res.ok) {
        toast.success(`Order #${order.daily_order_no || order.order_number} Accepted!`);
        
        // Auto print KOT/receipt
        const config = ThermalPrinterService.getConfig();
        if (config.autoPrintOnline) {
          const receiptData = {
            orderId: order.id,
            billNumber: order.daily_order_no ? `#${order.daily_order_no}` : order.order_number,
            permanentBillNo: order.permanent_bill_no,
            dailyOrderNumber: order.daily_order_no,
            orderSource: 'CUSTOMER_APP',
            orderType: order.delivery_type || 'Online Delivery',
            branchName: session?.branchName || 'Olive Pizza',
            customerName: order.customer_name || 'Online Customer',
            customerPhone: order.customer_phone || '',
            deliveryAddress: order.delivery_address || '',
            cashierName: session?.cashierName || 'Auto System',
            terminalId: session?.terminalId || 'POS-TERM-01',
            items: (order.items || []).map((it: any) => ({
              name: it.item_name || it.name,
              quantity: Number(it.quantity || 1),
              price: Number(it.unit_price || it.price || 0),
              size: it.size,
              crust: it.crust,
              addons: it.addons || []
            })),
            subtotal: Number(order.subtotal || order.final_total || 0),
            discount: Number(order.discount_amount || 0),
            tax: Number(order.tax_amount || 0),
            deliveryFee: Number(order.delivery_fee || 0),
            total: Number(order.final_total || 0),
            paymentMethod: order.payment_method || 'ONLINE',
            paymentStatus: order.payment_status || 'PAID',
            createdAt: order.created_at || new Date().toISOString()
          };
          ThermalPrinterService.printReceipt(receiptData);
        }

        fetchLiveOrders();
      } else {
        toast.error('Failed to accept order on server');
      }
    } catch (err: any) {
      toast.error('Accept error: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectOrder = async () => {
    if (!rejectingOrderId) return;
    setActionLoading(true);
    try {
      const res = await fetchPOSApi(`/api/pos/online-orders/${rejectingOrderId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason })
      });
      if (res.ok) {
        toast.success('Order rejected and customer notified');
        setRejectingOrderId(null);
        fetchLiveOrders();
      } else {
        toast.error('Failed to reject order');
      }
    } catch (err: any) {
      toast.error('Reject error: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrintKOT = (order: any) => {
    const receiptData = {
      orderId: order.id,
      billNumber: order.daily_order_no ? `#${order.daily_order_no}` : order.order_number,
      permanentBillNo: order.permanent_bill_no,
      dailyOrderNumber: order.daily_order_no,
      orderSource: 'CUSTOMER_APP',
      orderType: order.delivery_type || 'Online Delivery',
      branchName: session?.branchName || 'Olive Pizza',
      customerName: order.customer_name || 'Online Customer',
      customerPhone: order.customer_phone || '',
      deliveryAddress: order.delivery_address || '',
      cashierName: session?.cashierName || 'Auto System',
      terminalId: session?.terminalId || 'POS-TERM-01',
      items: (order.items || []).map((it: any) => ({
        name: it.item_name || it.name,
        quantity: Number(it.quantity || 1),
        price: Number(it.unit_price || it.price || 0),
        size: it.size,
        crust: it.crust,
        addons: it.addons || []
      })),
      subtotal: Number(order.subtotal || order.final_total || 0),
      discount: Number(order.discount_amount || 0),
      tax: Number(order.tax_amount || 0),
      deliveryFee: Number(order.delivery_fee || 0),
      total: Number(order.final_total || 0),
      paymentMethod: order.payment_method || 'ONLINE',
      paymentStatus: order.payment_status || 'PAID',
      createdAt: order.created_at || new Date().toISOString()
    };
    ThermalPrinterService.printReceipt(receiptData);
    toast.success('KOT Printed ✓');
  };

  const pendingOrders = orders.filter(o => (o.order_status || '').toUpperCase() === 'PENDING');
  const activeOrders = orders.filter(o => (o.order_status || '').toUpperCase() !== 'PENDING' && (o.order_status || '').toUpperCase() !== 'DELIVERED' && (o.order_status || '').toUpperCase() !== 'CANCELLED');

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 overflow-hidden select-none">
      {/* Hub Top Bar */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white tracking-tight">Customer App Live Orders Hub</h2>
              {pendingOrders.length > 0 && (
                <span className="px-2.5 py-0.5 bg-purple-500 text-white font-mono font-black text-xs rounded-full animate-bounce">
                  {pendingOrders.length} ACTION REQUIRED
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">Incoming real-time orders from Olive Pizza Customer Mobile App</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              soundEnabled ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
            title="Toggle Sound Alerts"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Chime On' : 'Chime Muted'}</span>
          </button>

          <button
            onClick={fetchLiveOrders}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-xl transition cursor-pointer"
            title="Refresh Live Orders"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Grid: Pending Orders (Top) + In Preparation Orders (Bottom) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* SECTION A: NEW PENDING ORDERS (REQUIRING ACCEPT / REJECT) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
              <span>Pending Confirmation ({pendingOrders.length})</span>
            </h3>
            <span className="text-[11px] text-zinc-500">Auto-refreshing every 5 seconds</span>
          </div>

          {pendingOrders.length === 0 ? (
            <div className="p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800 text-center text-zinc-500 space-y-1">
              <CheckCircle2 className="w-8 h-8 mx-auto text-zinc-600" />
              <div className="text-xs font-bold text-zinc-400">All pending orders confirmed!</div>
              <p className="text-[11px] text-zinc-600">New customer orders will appear here with an audio chime alert.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {pendingOrders.map((order) => (
                <div 
                  key={order.id} 
                  className="rounded-2xl bg-zinc-900 border-2 border-purple-500/50 p-4 space-y-3.5 shadow-xl shadow-purple-500/5"
                >
                  {/* Order Top Meta */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-xs font-mono font-black">
                          BILL #{order.permanent_bill_no ?? '—'}
                        </span>
                        <span className="text-sm font-mono font-bold text-white">
                          Daily #{order.daily_order_no || order.order_number}
                        </span>
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-[10px] font-bold">
                          NEW ORDER
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-zinc-500" />
                        <span>Placed {new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-black text-white font-mono">
                        ₹{Number(order.final_total || 0).toFixed(2)}
                      </div>
                      <span className="text-[10px] uppercase font-bold text-emerald-400">
                        {order.payment_status || 'PAID'} ({order.payment_method || 'ONLINE'})
                      </span>
                    </div>
                  </div>

                  {/* Customer Info Box */}
                  <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-zinc-400" />
                        {order.customer_name || 'Online Customer'}
                      </span>
                      {order.customer_phone && (
                        <a 
                          href={`tel:${order.customer_phone}`} 
                          className="font-mono text-amber-400 hover:underline flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3" />
                          {order.customer_phone}
                        </a>
                      )}
                    </div>
                    {order.delivery_address && (
                      <div className="text-[11px] text-zinc-400 flex items-start gap-1 pt-0.5">
                        <MapPin className="w-3 h-3 text-zinc-500 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{order.delivery_address}</span>
                      </div>
                    )}
                  </div>

                  {/* Items List */}
                  <div className="space-y-1.5 text-xs">
                    {(order.items || []).map((it: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-zinc-300">
                        <div>
                          <strong className="text-white">{it.quantity}x {it.item_name || it.name}</strong>
                          <span className="text-[10px] text-zinc-500 ml-1.5">
                            ({[it.size, it.crust].filter(Boolean).join(' • ')})
                          </span>
                        </div>
                        <span className="font-mono font-semibold">
                          ₹{(Number(it.unit_price || it.price || 0) * Number(it.quantity || 1)).toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Actions: Accept & Reject Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800">
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => setRejectingOrderId(order.id)}
                      className="py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      <span>Reject Order</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleAcceptOrder(order)}
                      className="py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Accept & Send to Kitchen</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTION B: CONFIRMED & KITCHEN PREPARATION ORDERS */}
        <div className="space-y-3 pt-3 border-t border-zinc-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
            <ChefHat className="w-4 h-4" />
            <span>Active in Kitchen / Out for Delivery ({activeOrders.length})</span>
          </h3>

          {activeOrders.length === 0 ? (
            <div className="p-6 text-center text-zinc-600 text-xs">
              No orders currently in kitchen preparation.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {activeOrders.map((order) => (
                <div key={order.id} className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white font-mono">
                        BILL #{order.permanent_bill_no ?? '—'} (Daily #{order.daily_order_no || order.order_number})
                      </div>
                      <div className="text-[10px] text-zinc-400">{order.customer_name}</div>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded text-[10px] font-bold uppercase">
                      {order.order_status || 'ACCEPTED'}
                    </span>
                  </div>

                  <div className="text-[11px] text-zinc-400">
                    {order.items?.length || 0} item(s) • Total: <strong className="font-mono text-white">₹{order.final_total}</strong>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/80">
                    <button
                      type="button"
                      onClick={() => handlePrintKOT(order)}
                      className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-400" />
                      <span>Print KOT</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reject Reason Dialog */}
      {rejectingOrderId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-white">Reject Online Order</h4>
            <p className="text-xs text-zinc-400">
              Please specify the reason for cancellation. Customer will be notified instantly.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full h-20 p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingOrderId(null)}
                className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleRejectOrder}
                className="px-3.5 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

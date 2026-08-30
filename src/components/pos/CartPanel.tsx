import React from 'react';
import { usePOSStore, getPOSCalculations } from '../../store/posStore';
import { CustomerSection } from './CustomerSection';
import { 
  Trash2, Plus, Minus, CreditCard, Tag, UtensilsCrossed, ShoppingBag, 
  Truck, RotateCcw, PauseCircle, MapPin
} from 'lucide-react';
import toast from 'react-hot-toast';

interface CartPanelProps {
  onOpenPayment: () => void;
}

const TABLE_LIST = ['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-7', 'T-8', 'T-9', 'T-10', 'T-11', 'T-12'];

const QUICK_DISCOUNTS = [
  { label: '5%', percent: 0.05 },
  { label: '10%', percent: 0.10 },
  { label: '15%', percent: 0.15 },
  { label: 'Flat ₹50', flat: 50 },
  { label: 'Flat ₹100', flat: 100 },
];

export const CartPanel: React.FC<CartPanelProps> = ({ onOpenPayment }) => {
  const {
    items,
    updateQuantity,
    removeItem,
    orderSource,
    setOrderSource,
    tableNumber,
    setTableNumber,
    deliveryAddress,
    setCustomer,
    deliveryFee,
    discountAmount,
    setDiscountAmount,
    resetOrder,
    holdCurrentBill,
  } = usePOSStore();

  const calcs = getPOSCalculations({ items, discountAmount, deliveryFee });

  const applyDiscount = (d: { percent?: number; flat?: number }) => {
    if (d.percent) {
      setDiscountAmount(Math.round(calcs.subtotal * d.percent));
    } else if (d.flat) {
      setDiscountAmount(d.flat);
    }
  };

  const handleHoldBill = () => {
    const success = holdCurrentBill();
    if (success) {
      toast.success('Bill placed on hold. Ready for next customer.');
    } else {
      toast.error('Cart is empty.');
    }
  };

  return (
    <aside className="w-96 bg-zinc-950 border-l border-zinc-800 flex flex-col h-full select-none">
      {/* 1. Fast Order Type Selector (Dine-In, Takeaway, Delivery) */}
      <div className="p-3 border-b border-zinc-800 bg-zinc-900/60">
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-950 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setOrderSource('POS_DINE_IN')}
            className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer ${
              orderSource === 'POS_DINE_IN'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>Dine-In</span>
          </button>

          <button
            type="button"
            onClick={() => setOrderSource('POS_TAKEAWAY')}
            className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer ${
              orderSource === 'POS_TAKEAWAY'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Takeaway</span>
          </button>

          <button
            type="button"
            onClick={() => setOrderSource('POS_DELIVERY')}
            className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer ${
              orderSource === 'POS_DELIVERY'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Delivery</span>
          </button>
        </div>

        {/* Sub-mode Options: Table Picker for Dine-In */}
        {orderSource === 'POS_DINE_IN' && (
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 mb-1">
              <span>Select Dining Table:</span>
              <span className="font-mono text-amber-400 font-bold">{tableNumber}</span>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {TABLE_LIST.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTableNumber(t)}
                  className={`py-1 text-xs font-mono font-bold rounded-md border transition cursor-pointer ${
                    tableNumber === t
                      ? 'bg-amber-500 text-zinc-950 border-amber-500 font-black'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sub-mode Options: Delivery Address Input */}
        {orderSource === 'POS_DELIVERY' && (
          <div className="mt-2.5">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-zinc-400 mb-1">
              <MapPin className="w-3.5 h-3.5 text-amber-500" />
              <span>Delivery Address / Landmark:</span>
            </div>
            <input
              type="text"
              placeholder="House/Street/Landmark..."
              value={deliveryAddress}
              onChange={(e) => setCustomer({ address: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        )}
      </div>

      {/* 2. Customer Identity, Phone Lookup & Profile Section */}
      <CustomerSection />

      {/* 3. Cart Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-600 space-y-2">
            <UtensilsCrossed className="w-10 h-10 stroke-1 text-zinc-700" />
            <p className="text-xs font-medium">Cart is empty</p>
            <p className="text-[11px] text-zinc-600 max-w-[200px]">
              Tap pizzas or sides on the left to add items to this bill.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const addonsPrice = (item.addons || []).reduce((acc, a) => acc + a.price, 0);
            const lineTotal = (item.price + addonsPrice) * item.quantity;

            return (
              <div
                key={item.cartItemId}
                className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-zinc-200 leading-snug">{item.name}</h4>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      {item.size} • {item.crust}
                    </p>
                    {item.addons && item.addons.length > 0 && (
                      <div className="text-[10px] text-amber-400/90 leading-tight mt-0.5">
                        +{item.addons.map((a) => a.name).join(', ')}
                      </div>
                    )}
                    {item.kitchenNotes && (
                      <div className="text-[10px] text-purple-400 italic mt-0.5">
                        Note: {item.kitchenNotes}
                      </div>
                    )}
                  </div>
                  <span className="font-mono text-xs font-bold text-amber-400">
                    ₹{lineTotal}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-zinc-800/50">
                  <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.cartItemId, -1)}
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-mono font-bold text-zinc-200">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.cartItemId, 1)}
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(item.cartItemId)}
                    className="p-1 text-zinc-500 hover:text-red-400 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Quick Discounts */}
      {items.length > 0 && (
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/40 space-y-2">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            <span className="text-[10px] uppercase font-bold text-zinc-500 mr-1 flex items-center gap-0.5">
              <Tag className="w-3 h-3" />
              Disc:
            </span>
            {QUICK_DISCOUNTS.map((d, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyDiscount(d)}
                className="px-2 py-1 bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 text-[10px] font-mono text-zinc-300 hover:text-amber-400 rounded-md transition whitespace-nowrap cursor-pointer"
              >
                {d.label}
              </button>
            ))}
            {discountAmount > 0 && (
              <button
                type="button"
                onClick={() => setDiscountAmount(0)}
                className="px-1.5 py-1 text-[10px] text-red-400 hover:bg-red-500/10 rounded transition cursor-pointer"
                title="Remove discount"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* 5. Bill Summary, Hold Bill & Checkout Action */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-950 space-y-3">
        <div className="space-y-1.5 text-xs text-zinc-400">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="font-mono text-zinc-200">₹{calcs.subtotal}</span>
          </div>

          {calcs.discountAmount > 0 && (
            <div className="flex justify-between text-emerald-400">
              <span>Discount</span>
              <span className="font-mono">-₹{calcs.discountAmount}</span>
            </div>
          )}

          <div className="flex justify-between text-[11px] text-zinc-500">
            <span>5% F&B GST (2.5% CGST + 2.5% SGST)</span>
            <span className="font-mono">₹{calcs.taxAmount}</span>
          </div>

          <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-zinc-800">
            <span>Total Payable</span>
            <span className="font-mono text-amber-400 text-base font-black">₹{calcs.finalTotal}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {/* Reset Bill */}
          <button
            type="button"
            onClick={resetOrder}
            disabled={items.length === 0}
            className="p-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-red-400 border border-zinc-800 rounded-xl transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Clear Bill (F4)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Hold Bill */}
          <button
            type="button"
            onClick={handleHoldBill}
            disabled={items.length === 0}
            className="py-3 px-3 bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-zinc-800 hover:border-amber-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Hold Current Bill (F8)"
          >
            <PauseCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Hold</span>
          </button>

          {/* Pay / Print Action */}
          <button
            type="button"
            onClick={onOpenPayment}
            disabled={items.length === 0}
            className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            <span>PAY / PRINT (F9)</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

import React from 'react';
import { usePOSStore } from '../../store/posStore';
import { X, Play, Trash2, Clock, User, Phone, Layers, UtensilsCrossed } from 'lucide-react';

export const HeldBillsModal: React.FC = () => {
  const { heldBills, isHeldBillsOpen, setIsHeldBillsOpen, resumeBill, deleteHeldBill } = usePOSStore();

  if (!isHeldBillsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Held Bills Queue</h2>
              <p className="text-xs text-zinc-400">
                {heldBills.length} {heldBills.length === 1 ? 'bill' : 'bills'} on hold
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsHeldBillsOpen(false)}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {heldBills.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center text-zinc-500 space-y-2">
              <UtensilsCrossed className="w-10 h-10 stroke-1 text-zinc-700" />
              <p className="text-sm font-semibold">No held bills</p>
              <p className="text-xs text-zinc-600 max-w-[220px]">
                Click "Hold Bill" in the cart panel or press F8 while taking an order to put it on hold.
              </p>
            </div>
          ) : (
            heldBills.map((bill) => (
              <div
                key={bill.id}
                className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      {bill.orderSource.replace('POS_', '')}
                    </span>
                    {bill.tableNumber && (
                      <span className="font-mono text-xs font-bold text-zinc-300">
                        {bill.tableNumber}
                      </span>
                    )}
                    <span className="text-xs text-zinc-500 flex items-center gap-1 ml-auto font-mono">
                      <Clock className="w-3 h-3" />
                      {bill.heldAt}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-200 truncate">
                    <User className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{bill.customerName || 'Walk-in Customer'}</span>
                    {bill.customerPhone && (
                      <span className="text-zinc-500 text-[11px] font-normal flex items-center gap-0.5">
                        <Phone className="w-3 h-3" /> {bill.customerPhone}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-zinc-400 mt-1 truncate">
                    {bill.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
                  </div>

                  <div className="mt-2 font-mono text-xs font-black text-amber-400">
                    Total: ₹{bill.finalTotal}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => resumeBill(bill.id)}
                    className="px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Resume</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteHeldBill(bill.id)}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-900 rounded-xl transition cursor-pointer"
                    title="Discard held bill"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

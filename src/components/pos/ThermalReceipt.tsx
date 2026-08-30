import React from 'react';
import { POSCompletedBill } from '../../types/pos';
import { Printer, X, CheckCircle2 } from 'lucide-react';

interface ThermalReceiptProps {
  bill: POSCompletedBill;
  onClose: () => void;
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({ bill, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
        {/* Modal Top Bar (hidden on paper print) */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950 print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Bill Saved & Printable</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 80mm ESC/POS Thermal Receipt Preview Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-zinc-950/60 print:bg-white print:p-0">
          <div className="max-w-[320px] mx-auto bg-white text-zinc-900 p-5 rounded-xl shadow-lg print:shadow-none print:max-w-none print:p-2 print:rounded-none font-mono text-xs leading-tight">
            {/* Store Header */}
            <div className="text-center pb-3 border-b border-dashed border-zinc-400 space-y-1">
              <h1 className="text-base font-black tracking-wider uppercase">OLIVE PIZZA</h1>
              <p className="text-[11px] font-semibold text-zinc-700">{bill.session.branchName}</p>
              <p className="text-[10px] text-zinc-600">GSTIN: 22AAFCO8899K1Z4</p>
              <p className="text-[10px] text-zinc-600">Ph: +91 98765 43210</p>
            </div>

            {/* Bill Meta */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1 text-[11px]">
              <div className="flex justify-between font-bold">
                <span>BILL: {bill.billNumber}</span>
                <span className="uppercase">{bill.orderSource.replace('POS_', '')}</span>
              </div>
              <div className="flex justify-between text-zinc-600 text-[10px]">
                <span>DATE: {new Date(bill.createdAt).toLocaleDateString('en-IN')}</span>
                <span>TIME: {new Date(bill.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {bill.tableNumber && (
                <div className="font-bold text-zinc-800">TABLE: {bill.tableNumber}</div>
              )}
              <div className="text-zinc-700">
                CUSTOMER: {bill.customerName} {bill.customerPhone && `(${bill.customerPhone})`}
              </div>
              <div className="text-zinc-600 text-[10px]">
                CASHIER: {bill.session.cashierName} • TERM: {bill.session.terminalId}
              </div>
            </div>

            {/* Line Items Table */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-2">
              <div className="flex justify-between font-bold text-[10px] border-b border-zinc-300 pb-1">
                <span>ITEM</span>
                <span>QTY</span>
                <span>PRICE</span>
              </div>

              {bill.items.map((it, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex justify-between font-medium">
                    <span className="truncate max-w-[180px]">{it.name}</span>
                    <span>x{it.quantity}</span>
                    <span className="font-bold">₹{(it.price + (it.addons || []).reduce((s, a) => s + a.price, 0)) * it.quantity}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 pl-1">
                    {it.size} • {it.crust}
                  </div>
                  {it.addons && it.addons.length > 0 && (
                    <div className="text-[9px] text-zinc-600 pl-1">
                      +{it.addons.map((a) => a.name).join(', ')}
                    </div>
                  )}
                  {it.kitchenNotes && (
                    <div className="text-[9px] italic text-zinc-500 pl-1">
                      *{it.kitchenNotes}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Calculations Breakdown */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>SUBTOTAL:</span>
                <span>₹{bill.subtotal}</span>
              </div>
              {bill.discountAmount > 0 && (
                <div className="flex justify-between font-bold">
                  <span>DISCOUNT:</span>
                  <span>-₹{bill.discountAmount}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>GST TAXES (5%):</span>
                <span>₹{bill.taxAmount}</span>
              </div>
              {bill.deliveryFee > 0 && (
                <div className="flex justify-between">
                  <span>DELIVERY FEE:</span>
                  <span>₹{bill.deliveryFee}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-sm pt-1 border-t border-zinc-300">
                <span>TOTAL AMOUNT:</span>
                <span>₹{bill.finalTotal}</span>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="py-2 border-b border-dashed border-zinc-400 space-y-0.5 text-[10px] text-zinc-700">
              <div className="flex justify-between font-bold">
                <span>PAYMENT METHOD:</span>
                <span className="uppercase">{bill.payment.method}</span>
              </div>
              {bill.payment.cashReceived && (
                <>
                  <div className="flex justify-between">
                    <span>CASH RECEIVED:</span>
                    <span>₹{bill.payment.cashReceived}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>CHANGE RETURNED:</span>
                    <span>₹{bill.payment.cashChange || 0}</span>
                  </div>
                </>
              )}
            </div>

            {/* Footer Notice */}
            <div className="pt-3 text-center text-[10px] text-zinc-600 space-y-0.5">
              <p className="font-bold">THANK YOU FOR VISITING OLIVE PIZZA!</p>
              <p>For feedback: order@olivepizza.in</p>
              <p className="text-[8px] text-zinc-400">Order saved to Central Olive Pizza Cloud</p>
            </div>
          </div>
        </div>

        {/* Action Controls (hidden in print) */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs rounded-xl transition"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Print Thermal Receipt</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { POSCompletedBill } from '../../types/pos';
import { ThermalPrinterService } from '../../services/ThermalPrinterService';
import { PaperSize } from '../../types/printer';
import { Printer, X, CheckCircle2, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

interface ThermalReceiptProps {
  bill: POSCompletedBill;
  onClose: () => void;
  isReprint?: boolean;
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({ bill, onClose, isReprint = false }) => {
  const [paperSize, setPaperSize] = useState<PaperSize>(() => ThermalPrinterService.getConfig().paperSize || '80mm');
  const is58mm = paperSize === '58mm';

  const isProvisional = bill.isProvisional || (!bill.permanentBillNo && (bill.billNumber.startsWith('PROV') || bill.billNumber.startsWith('#OFF')));
  const halfTax = (bill.taxAmount / 2);

  const handlePrint = async () => {
    const toastId = toast.loading(`Printing ${paperSize} thermal receipt...`);
    const receiptData = ThermalPrinterService.convertCompletedBillToReceiptData(bill, isReprint);
    const res = await ThermalPrinterService.printReceipt(receiptData);

    if (res.success) {
      toast.success(`Printed successfully (${paperSize})`, { id: toastId });
    } else {
      toast.error(`Thermal print notice: ${res.error || 'Opening system print dialog'}`, { id: toastId });
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
        {/* Modal Top Bar (hidden on paper print) */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950 print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>ESC/POS Thermal Receipt</span>
                {isReprint && (
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-black">
                    REPRINT
                  </span>
                )}
                {isProvisional && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-black">
                    PROVISIONAL
                  </span>
                )}
              </h2>
              <span className="text-xs text-zinc-400 font-mono">
                {isProvisional ? `PROV: ${bill.billNumber}` : `Bill #${bill.permanentBillNo || bill.billNumber}`}
              </span>
            </div>
          </div>

          {/* Paper Size Selector Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setPaperSize('80mm')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  paperSize === '80mm'
                    ? 'bg-amber-500 text-zinc-950 shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('58mm')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  paperSize === '58mm'
                    ? 'bg-amber-500 text-zinc-950 shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                58mm
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ESC/POS Thermal Receipt Preview Area (Interactive 58mm / 80mm preview) */}
        <div className="flex-1 overflow-y-auto p-4 bg-zinc-950/70 print:bg-white print:p-0 flex justify-center">
          <div 
            className={`w-full bg-white text-zinc-900 p-4 rounded-xl shadow-lg print:shadow-none print:max-w-none print:p-2 print:rounded-none font-mono leading-tight ${
              is58mm ? 'max-w-[260px] text-[10px]' : 'max-w-[340px] text-xs'
            }`}
          >
            {/* Header Duplicate / Reprint Banner */}
            {isReprint && (
              <div className="text-center pb-2 mb-2 border-b-2 border-dashed border-zinc-900">
                <div className="inline-block px-2 py-0.5 border border-zinc-900 font-black text-[11px] tracking-wider uppercase">
                  *** DUPLICATE / REPRINT ***
                </div>
              </div>
            )}

            {/* Store & Restaurant Header */}
            <div className="text-center pb-3 border-b border-dashed border-zinc-400 space-y-1">
              <h1 className={`${is58mm ? 'text-sm' : 'text-base'} font-black tracking-wider uppercase`}>
                OLIVE PIZZA
              </h1>
              <p className="font-semibold text-zinc-700">{bill.session.branchName || 'Olive Pizza'}</p>
              <p className="text-[10px] text-zinc-600">Station Road, G.E. Road, Rajnandgaon, CG - 491441</p>
              <p className="text-[10px] text-zinc-600">Ph: +91 98765 43210</p>
              <p className="text-[10px] text-zinc-700 font-semibold">GSTIN: 22AAFCO8899K1Z4</p>
              <p className="text-[10px] text-zinc-700 font-semibold">FSSAI: 10422000001234</p>
            </div>

            {/* Bill Meta & Provisional Indicator */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1 text-[11px]">
              {isProvisional ? (
                <div className="p-1.5 border border-zinc-900 rounded text-center space-y-0.5 bg-zinc-50">
                  <div className="font-black text-xs">
                    PROVISIONAL RECEIPT: {bill.billNumber}
                  </div>
                  <div className="text-[9px] text-zinc-600">
                    (PENDING SERVER SYNC — NOT A TAX INVOICE)
                  </div>
                </div>
              ) : (
                <div className="flex justify-between font-bold">
                  <span>PERM BILL: #{bill.permanentBillNo ?? '—'}</span>
                  <span>DAILY ORD: {bill.dailyOrderNumber ? `#${bill.dailyOrderNumber}` : bill.billNumber}</span>
                </div>
              )}

              <div className="flex justify-between text-zinc-700 text-[10px] font-semibold">
                <span>CHANNEL:</span>
                <span className="uppercase">{bill.orderSource.replace('POS_', '').replace('_', ' ')}</span>
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
              {bill.deliveryAddress && (
                <div className="text-[10px] text-zinc-600">
                  DELIVERY: {bill.deliveryAddress}
                </div>
              )}
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
                    <span className="truncate max-w-[190px]">{it.name}</span>
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

            {/* Calculations Breakdown with Detailed GST Tax Split */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>SUBTOTAL:</span>
                <span>₹{bill.subtotal.toFixed(2)}</span>
              </div>
              {bill.discountAmount > 0 && (
                <div className="flex justify-between font-bold text-emerald-700">
                  <span>DISCOUNT:</span>
                  <span>-₹{bill.discountAmount.toFixed(2)}</span>
                </div>
              )}

              {/* Tax breakdown (CGST 2.5% + SGST 2.5% for 5% total) */}
              <div className="flex justify-between text-zinc-700">
                <span>CGST (2.5%):</span>
                <span>₹{halfTax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-zinc-700">
                <span>SGST (2.5%):</span>
                <span>₹{halfTax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>TOTAL GST (5%):</span>
                <span>₹{bill.taxAmount.toFixed(2)}</span>
              </div>

              {bill.deliveryFee > 0 && (
                <div className="flex justify-between">
                  <span>DELIVERY FEE:</span>
                  <span>₹{bill.deliveryFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-sm pt-1 border-t border-zinc-300">
                <span>TOTAL AMOUNT:</span>
                <span>₹{bill.finalTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="py-2 border-b border-dashed border-zinc-400 space-y-0.5 text-[10px] text-zinc-700">
              <div className="flex justify-between font-bold">
                <span>PAYMENT METHOD:</span>
                <span className="uppercase">{bill.payment.method}</span>
              </div>
              {bill.payment.cashReceived != null && (
                <>
                  <div className="flex justify-between">
                    <span>CASH RECEIVED:</span>
                    <span>₹{Number(bill.payment.cashReceived).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>CHANGE RETURNED:</span>
                    <span>₹{Number(bill.payment.cashChange || 0).toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="text-center font-bold pt-1">
                STATUS: PAID
              </div>
            </div>

            {/* Footer Notice */}
            <div className="pt-3 text-center text-[10px] text-zinc-600 space-y-0.5">
              <p className="font-bold">THANK YOU FOR VISITING OLIVE PIZZA!</p>
              <p>For feedback: order@olivepizza.in</p>
              <p className="text-[8px] text-zinc-400">Olive Pizza • Central Cloud Synchronized</p>
            </div>
          </div>
        </div>

        {/* Action Controls (hidden in print) */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs rounded-xl transition cursor-pointer"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition active:scale-95 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print {paperSize} Thermal Receipt</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { usePOSStore } from '../../store/posStore';
import { ThermalPrinterService } from '../../services/ThermalPrinterService';
import { PrinterConfig } from '../../types/printer';
import { 
  Printer, 
  X, 
  RefreshCw, 
  Zap
} from 'lucide-react';
import toast from 'react-hot-toast';

export const PrinterSettingsModal: React.FC = () => {
  const { isPrinterSettingsOpen, setIsPrinterSettingsOpen } = usePOSStore();
  const [config, setConfig] = useState<PrinterConfig>(ThermalPrinterService.getConfig());
  const [printers, setPrinters] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);

  const loadPrinters = async () => {
    setDiscovering(true);
    try {
      const list = await ThermalPrinterService.getAvailablePrinters();
      setPrinters(list);
    } finally {
      setDiscovering(false);
    }
  };

  useEffect(() => {
    if (isPrinterSettingsOpen) {
      setConfig(ThermalPrinterService.getConfig());
      loadPrinters();
    }
  }, [isPrinterSettingsOpen]);

  const handleSave = () => {
    ThermalPrinterService.saveConfig(config);
    toast.success('Thermal printer settings saved!');
    setIsPrinterSettingsOpen(false);
  };

  const handleTestPrint = async () => {
    const toastId = toast.loading('Sending test receipt to ' + config.printerName + ' (' + config.paperSize + ')...');
    const testData = {
      orderId: 'TEST-PRINT-01',
      billNumber: '#TEST-999',
      orderSource: 'POS_DINE_IN',
      orderType: 'Dine-In Test',
      branchName: 'Olive Pizza — Test Terminal',
      customerName: 'Test Customer',
      cashierName: 'Admin',
      terminalId: 'POS-TERM-01',
      items: [
        { name: 'Farmhouse Special Pizza', quantity: 1, price: 349, size: 'Medium (10")', crust: 'Thin Crust' },
        { name: 'Stuffed Garlic Bread', quantity: 1, price: 149 }
      ],
      subtotal: 498,
      discount: 0,
      tax: 24.90,
      total: 522.90,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      createdAt: new Date().toISOString()
    };
    const res = await ThermalPrinterService.printReceipt(testData);
    if (res.success) {
      toast.success('Test receipt printed successfully!', { id: toastId });
    } else {
      toast.error('Test print failed: ' + (res.error || 'Check printer connection'), { id: toastId });
    }
  };

  const handleTestDrawer = async () => {
    const success = await ThermalPrinterService.triggerCashDrawerPulse();
    if (success) {
      toast.success('Cash drawer pulse signal sent (ESC p 0 25 250)');
    } else {
      toast.error('Cash drawer hardware trigger failed');
    }
  };

  if (!isPrinterSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base tracking-tight">Thermal Printer Settings</h3>
              <span className="text-xs text-zinc-400">Configure ESC/POS receipt printing & cash drawer</span>
            </div>
          </div>
          <button onClick={() => setIsPrinterSettingsOpen(false)} className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="text-xs text-zinc-400 block mb-2 font-bold uppercase tracking-wider">Paper Roll Size</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConfig({ ...config, paperSize: '80mm' })}
              className={"p-3 rounded-2xl border text-left transition cursor-pointer " + (config.paperSize === '80mm' ? 'bg-amber-500/10 border-amber-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400')}
            >
              <div className="font-bold text-sm text-white">80mm (3-Inch Standard)</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">48 Columns • Wide receipt</div>
            </button>
            <button
              type="button"
              onClick={() => setConfig({ ...config, paperSize: '58mm' })}
              className={"p-3 rounded-2xl border text-left transition cursor-pointer " + (config.paperSize === '58mm' ? 'bg-amber-500/10 border-amber-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400')}
            >
              <div className="font-bold text-sm text-white">58mm (2-Inch Compact)</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">32 Columns • Mobile Bluetooth</div>
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Target Printer Device</label>
            <button onClick={loadPrinters} className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1">
              <RefreshCw className={"w-3 h-3 " + (discovering ? 'animate-spin' : '')} />
              <span>Discover</span>
            </button>
          </div>
          <select
            value={config.printerName}
            onChange={(e) => setConfig({ ...config, printerName: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
          >
            {printers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="space-y-2.5 pt-1">
          <label className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-white">Automatic Online Order Printing</div>
              <div className="text-[11px] text-zinc-400">Print receipt instantly when Manager accepts an online order</div>
            </div>
            <input
              type="checkbox"
              checked={config.autoPrintOnline}
              onChange={(e) => setConfig({ ...config, autoPrintOnline: e.target.checked })}
              className="w-4 h-4 rounded text-amber-500"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-white">Primary Print Terminal</div>
              <div className="text-[11px] text-zinc-400">This register handles automatic online print jobs for this branch</div>
            </div>
            <input
              type="checkbox"
              checked={config.isPrimaryTerminal}
              onChange={(e) => setConfig({ ...config, isPrimaryTerminal: e.target.checked })}
              className="w-4 h-4 rounded text-amber-500"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            onClick={handleTestPrint}
            className="py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-amber-400" />
            <span>Test Print Receipt</span>
          </button>
          <button
            type="button"
            onClick={handleTestDrawer}
            className="py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Test Cash Drawer</span>
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={() => setIsPrinterSettingsOpen(false)}
            className="px-4 py-2 bg-zinc-900 text-zinc-400 hover:text-white rounded-xl text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-black rounded-xl text-xs transition cursor-pointer"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
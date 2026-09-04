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
          <label className="text-xs text-zinc-400 block mb-2 font-bold uppercase tracking-wider">Printer Connection Interface</label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'SYSTEM_DEFAULT', label: 'System Print', desc: 'OS / Browser' },
              { id: 'LAN', label: 'WiFi / LAN', desc: 'Port 9100 TCP' },
              { id: 'BLUETOOTH', label: 'Bluetooth', desc: 'Wireless 58/80' },
              { id: 'USB', label: 'USB Direct', desc: 'POS Hardware' },
            ].map((conn) => (
              <button
                key={conn.id}
                type="button"
                onClick={() => setConfig({ ...config, connectionType: conn.id as any })}
                className={"p-2.5 rounded-xl border text-center transition cursor-pointer " + (config.connectionType === conn.id ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-bold' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200')}
              >
                <div className="text-xs font-bold">{conn.label}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{conn.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Network / WiFi Configuration */}
        {config.connectionType === 'LAN' && (
          <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
            <div className="text-xs font-bold text-amber-400 flex items-center justify-between">
              <span>WiFi / Network Printer (Raw ESC/POS Port 9100)</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] text-zinc-400 font-bold uppercase">Printer IP Address</label>
                <input
                  type="text"
                  placeholder="e.g. 192.168.1.100"
                  value={config.lanIp || ''}
                  onChange={(e) => setConfig({ ...config, lanIp: e.target.value })}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-bold uppercase">Port</label>
                <input
                  type="number"
                  placeholder="9100"
                  value={config.lanPort || 9100}
                  onChange={(e) => setConfig({ ...config, lanPort: Number(e.target.value) || 9100 })}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!config.lanIp) {
                  toast.error('Please enter printer IP address first');
                  return;
                }
                const toastId = toast.loading('Testing TCP connection to ' + config.lanIp + ':' + (config.lanPort || 9100) + '...');
                const res = await ThermalPrinterService.testNetworkPrinter(config.lanIp, config.lanPort || 9100);
                if (res.success) {
                  toast.success('Network printer reached successfully!', { id: toastId });
                } else {
                  toast.error('Network test failed: ' + (res.error || 'Timeout'), { id: toastId });
                }
              }}
              className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>Ping & Test Network Connection</span>
            </button>
          </div>
        )}

        {/* Bluetooth Pairing Configuration */}
        {config.connectionType === 'BLUETOOTH' && (
          <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
            <div className="text-xs font-bold text-amber-400 flex items-center justify-between">
              <span>Wireless Bluetooth Thermal Printer</span>
              {config.bluetoothDeviceName && (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono">
                  {config.bluetoothDeviceName}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Pair your mobile 58mm or 80mm ESC/POS Bluetooth receipt printer (works on Android POS and Chrome Web Bluetooth).
            </p>
            <button
              type="button"
              onClick={async () => {
                const toastId = toast.loading('Opening Bluetooth device pairing dialog...');
                const res = await ThermalPrinterService.connectBluetoothDevice();
                if (res.success) {
                  setConfig({ ...config, bluetoothDeviceName: res.deviceName });
                  toast.success('Connected to ' + res.deviceName + '!', { id: toastId });
                } else {
                  toast.error('Bluetooth failed: ' + (res.error || 'Device not paired'), { id: toastId });
                }
              }}
              className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>{config.bluetoothDeviceName ? 'Re-pair Bluetooth Printer' : 'Pair New Bluetooth Printer'}</span>
            </button>
          </div>
        )}

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
            <button onClick={loadPrinters} className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer">
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

        <div className="space-y-2 pt-1">
          <label className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-white">Auto Cut Paper (ESC m / GS V)</div>
              <div className="text-[10px] text-zinc-400">Trigger automatic paper knife blade after receipt completes</div>
            </div>
            <input
              type="checkbox"
              checked={config.autoCut ?? true}
              onChange={(e) => setConfig({ ...config, autoCut: e.target.checked })}
              className="w-4 h-4 rounded text-amber-500"
            />
          </label>

          <label className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-white">Automatic Online Order Printing</div>
              <div className="text-[10px] text-zinc-400">Print receipt instantly when Manager accepts an online order</div>
            </div>
            <input
              type="checkbox"
              checked={config.autoPrintOnline}
              onChange={(e) => setConfig({ ...config, autoPrintOnline: e.target.checked })}
              className="w-4 h-4 rounded text-amber-500"
            />
          </label>

          <label className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-white">Primary Print Terminal</div>
              <div className="text-[10px] text-zinc-400">This register handles automatic online print jobs for this branch</div>
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
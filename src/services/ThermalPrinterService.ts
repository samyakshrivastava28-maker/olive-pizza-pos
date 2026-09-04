import { PrinterConfig, PaperSize } from '../types/printer';
import { POSCompletedBill } from '../types/pos';
import { fetchPOSApi } from '../lib/api';
import toast from 'react-hot-toast';

export interface ReceiptRenderData {
  orderId: string;
  billNumber: string;
  permanentBillNo?: number;
  dailyOrderNumber?: number;
  orderSource: string;
  orderType: string;
  branchName: string;
  branchAddress?: string;
  branchPhone?: string;
  gstNumber?: string;
  customerName: string;
  customerPhone?: string;
  deliveryAddress?: string;
  tableNumber?: string;
  cashierName: string;
  terminalId: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    size?: string;
    crust?: string;
    addons?: string[];
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  deliveryFee?: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  isReprint?: boolean;
}

export class ThermalPrinterService {
  private static defaultConfig: PrinterConfig = {
    printerName: 'Default Thermal Printer',
    connectionType: 'SYSTEM_DEFAULT',
    paperSize: '80mm',
    autoPrintOnline: true,
    isPrimaryTerminal: true,
    drawerKickOnCash: true
  };

  private static printedOrderIds: Set<string> = (() => {
    try {
      const stored = localStorage.getItem('olive_pos_printed_order_ids');
      if (stored) return new Set(JSON.parse(stored));
    } catch {}
    return new Set<string>();
  })();

  private static pendingPrintQueue: ReceiptRenderData[] = (() => {
    try {
      const stored = localStorage.getItem('olive_pos_pending_print_queue');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  })();

  static isAlreadyPrinted(orderId: string): boolean {
    if (!orderId) return false;
    return this.printedOrderIds.has(orderId);
  }

  static markAsPrinted(orderId: string) {
    if (!orderId) return;
    this.printedOrderIds.add(orderId);
    try {
      // Keep only recent 500 order IDs to prevent unbounded storage
      const arr = Array.from(this.printedOrderIds).slice(-500);
      localStorage.setItem('olive_pos_printed_order_ids', JSON.stringify(arr));
    } catch {}
  }

  static enqueueFailedPrint(data: ReceiptRenderData) {
    if (!data.orderId) return;
    const exists = this.pendingPrintQueue.some(p => p.orderId === data.orderId);
    if (!exists) {
      this.pendingPrintQueue.push(data);
      try {
        localStorage.setItem('olive_pos_pending_print_queue', JSON.stringify(this.pendingPrintQueue.slice(-100)));
      } catch {}
    }
  }

  static dequeueFailedPrint(orderId: string) {
    this.pendingPrintQueue = this.pendingPrintQueue.filter(p => p.orderId !== orderId);
    try {
      localStorage.setItem('olive_pos_pending_print_queue', JSON.stringify(this.pendingPrintQueue));
    } catch {}
  }

  static convertCompletedBillToReceiptData(bill: POSCompletedBill, isReprint = false): ReceiptRenderData {
    return {
      orderId: bill.orderId,
      billNumber: bill.billNumber,
      permanentBillNo: bill.permanentBillNo,
      dailyOrderNumber: bill.dailyOrderNumber,
      orderSource: bill.orderSource,
      orderType: bill.orderSource.replace('POS_', '').replace('_', ' '),
      branchName: bill.session.branchName || 'Olive Pizza',
      customerName: bill.customerName || 'Walk-in Customer',
      customerPhone: bill.customerPhone,
      deliveryAddress: bill.deliveryAddress,
      tableNumber: bill.tableNumber,
      cashierName: bill.session.cashierName,
      terminalId: bill.session.terminalId,
      items: bill.items.map(it => ({
        name: it.name,
        quantity: it.quantity,
        price: it.price,
        size: it.size,
        crust: it.crust,
        addons: (it.addons || []).map(a => a.name)
      })),
      subtotal: bill.subtotal,
      discount: bill.discountAmount,
      tax: bill.taxAmount,
      deliveryFee: bill.deliveryFee,
      total: bill.finalTotal,
      paymentMethod: bill.payment.method,
      paymentStatus: 'PAID',
      createdAt: bill.createdAt,
      isReprint
    };
  }

  static async autoPrintCompletedBill(bill: POSCompletedBill, isReprint = false): Promise<{ success: boolean; error?: string }> {
    // 1. Deduplication guard — Never auto-print twice for the same transaction
    if (!isReprint && this.isAlreadyPrinted(bill.orderId)) {
      console.log(`🖨️ [ThermalPrinterService] Bill ${bill.billNumber} (${bill.orderId}) already printed. Skipping duplicate.`);
      return { success: true };
    }

    const receiptData = this.convertCompletedBillToReceiptData(bill, isReprint);
    const result = await this.printReceipt(receiptData);

    if (result.success) {
      if (!isReprint) {
        this.markAsPrinted(bill.orderId);
        this.dequeueFailedPrint(bill.orderId);
      }
      toast.success(`Printed ✓ (${bill.billNumber})`, { duration: 3000, icon: '🖨️' });
      return { success: true };
    } else {
      // Offline printer handling — Bill remains successfully saved in database/queue
      if (!isReprint) {
        this.enqueueFailedPrint(receiptData);
      }
      toast(`Printer unavailable — ${bill.billNumber} saved (Print Pending)`, { duration: 4000, icon: '⚠️' });
      return { success: false, error: result.error };
    }
  }

  static async retryPendingPrints(): Promise<number> {
    if (this.pendingPrintQueue.length === 0) return 0;
    let printedCount = 0;
    const queueCopy = [...this.pendingPrintQueue];

    for (const item of queueCopy) {
      const res = await this.printReceipt(item);
      if (res.success) {
        this.markAsPrinted(item.orderId);
        this.dequeueFailedPrint(item.orderId);
        printedCount++;
      } else {
        // Still offline, break and try on next cycle
        break;
      }
    }

    if (printedCount > 0) {
      toast.success(`🖨️ Auto-printed ${printedCount} pending bill(s)`);
    }
    return printedCount;
  }

  static getConfig(): PrinterConfig {
    try {
      const saved = localStorage.getItem('olive_pos_printer_config');
      if (saved) return JSON.parse(saved);
    } catch {}
    return this.defaultConfig;
  }

  static saveConfig(config: PrinterConfig) {
    localStorage.setItem('olive_pos_printer_config', JSON.stringify(config));
  }

  static async getAvailablePrinters(): Promise<string[]> {
    if ((window as any).posHardware?.getPrinters) {
      try {
        const list = await (window as any).posHardware.getPrinters();
        return list.map((p: any) => p.name);
      } catch {}
    }
    return ['System Default Printer', 'EPSON TM-T82 Thermal Printer (80mm)', 'POS-58 Series (58mm)', 'Network Receipt Printer (LAN)'];
  }

  static generateThermalHtml(data: ReceiptRenderData, paperSize: PaperSize = '80mm'): string {
    const width = paperSize === '58mm' ? '48mm' : '72mm';
    const fontSize = paperSize === '58mm' ? '10px' : '11px';
    const isOnline = data.orderSource === 'CUSTOMER_APP' || data.orderSource === 'ONLINE';
    const isPaid = data.paymentStatus?.toUpperCase() === 'PAID';

    const itemsHtml = data.items.map(item => {
      const addonsStr = item.addons && item.addons.length > 0 ? ('<div style="font-size:9px;color:#555;padding-left:8px;">+ ' + item.addons.join(', ') + '</div>') : '';
      const variantStr = (item.size || item.crust) ? ('<div style="font-size:9px;color:#555;padding-left:8px;">(' + [item.size, item.crust].filter(Boolean).join(' • ') + ')</div>') : '';
      return (
        '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
          '<div style="flex:1;">' +
            '<span>' + item.quantity + 'x ' + item.name + '</span>' +
            variantStr + addonsStr +
          '</div>' +
          '<span style="font-weight:bold;margin-left:8px;">₹' + (item.price * item.quantity).toFixed(0) + '</span>' +
        '</div>'
      );
    }).join('');

    return [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
        '<meta charset="utf-8">',
        '<style>',
          '@page { margin: 0; size: auto; }',
          'body { width: ' + width + '; margin: 0 auto; padding: 4px; font-family: monospace; font-size: ' + fontSize + '; color: #000; line-height: 1.25; }',
          '.text-center { text-align: center; }',
          '.border-b { border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px; }',
          '.flex-between { display: flex; justify-content: space-between; }',
          '.bold { font-weight: bold; }',
          '.badge { display: inline-block; padding: 2px 4px; border: 1px solid #000; font-weight: bold; font-size: 10px; margin: 2px 0; }',
        '</style>',
      '</head>',
      '<body>',
        '<div class="text-center border-b">',
          (data.isReprint ? '<div class="badge">*** DUPLICATE REPRINT ***</div><br>' : ''),
          (isOnline ? '<div class="badge">ONLINE ORDER — KITCHEN BILL</div><br>' : ''),
          '<strong style="font-size:14px;letter-spacing:1px;">OLIVE PIZZA</strong><br>',
          '<span>' + data.branchName + '</span><br>',
          (data.branchPhone ? '<span>Tel: ' + data.branchPhone + '</span><br>' : ''),
          (data.gstNumber ? '<span style="font-size:9px;">GSTIN: ' + data.gstNumber + '</span>' : ''),
        '</div>',
        '<div class="border-b" style="font-size:10px;">',
          '<div class="flex-between bold" style="font-size:11px;"><span>PERM BILL: #' + (data.permanentBillNo ?? '—') + '</span><span>DAILY ORD: ' + (data.dailyOrderNumber ? '#' + data.dailyOrderNumber : data.billNumber) + '</span></div>',
          '<div class="flex-between"><span>CHANNEL:</span><span>' + data.orderType.toUpperCase() + '</span></div>',
          '<div class="flex-between"><span>' + new Date(data.createdAt).toLocaleDateString('en-IN') + '</span><span>' + new Date(data.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + '</span></div>',
          (data.tableNumber ? '<div class="bold">TABLE: ' + data.tableNumber + '</div>' : ''),
          (data.customerName ? '<div>CUST: ' + data.customerName + (data.customerPhone ? ' (' + data.customerPhone + ')' : '') + '</div>' : ''),
          (data.deliveryAddress ? '<div style="font-size:9px;">ADDR: ' + data.deliveryAddress + '</div>' : ''),
          '<div style="font-size:9px;color:#333;">CASHIER: ' + data.cashierName + ' • ' + data.terminalId + '</div>',
        '</div>',
        '<div class="border-b">',
          itemsHtml,
        '</div>',
        '<div class="border-b" style="font-size:10px;">',
          '<div class="flex-between"><span>Subtotal:</span><span>₹' + data.subtotal.toFixed(2) + '</span></div>',
          (data.discount > 0 ? '<div class="flex-between"><span>Discount:</span><span>-₹' + data.discount.toFixed(2) + '</span></div>' : ''),
          '<div class="flex-between"><span>GST (5% F&B):</span><span>₹' + data.tax.toFixed(2) + '</span></div>',
          (data.deliveryFee && data.deliveryFee > 0 ? '<div class="flex-between"><span>Delivery Fee:</span><span>₹' + data.deliveryFee.toFixed(2) + '</span></div>' : ''),
          '<div class="flex-between bold" style="font-size:13px;padding-top:4px;"><span>TOTAL:</span><span>₹' + data.total.toFixed(2) + '</span></div>',
        '</div>',
        '<div class="text-center border-b">',
          '<div class="bold" style="font-size:11px;">STATUS: ' + (isPaid ? (isOnline ? 'PAID ONLINE (DO NOT CHARGE)' : 'PAID (' + data.paymentMethod + ')') : 'PAYMENT DUE: CASH') + '</div>',
        '</div>',
        '<div class="text-center" style="font-size:9px;padding-top:4px;">',
          '<span>Thank you for dining with Olive Pizza!</span><br>',
          '<span>www.olivepizza.in</span>',
        '</div>',
      '</body>',
      '</html>'
    ].join('');
  }

  static async printReceipt(data: ReceiptRenderData): Promise<{ success: boolean; error?: string }> {
    const config = this.getConfig();
    const htmlContent = this.generateThermalHtml(data, config.paperSize);

    if ((window as any).posHardware?.printThermalReceipt) {
      try {
        const res = await (window as any).posHardware.printThermalReceipt(htmlContent, config.printerName);
        if (res && res.success) {
          if (config.drawerKickOnCash && data.paymentMethod === 'CASH' && !data.isReprint) {
            this.triggerCashDrawerPulse();
          }
          return { success: true };
        }
        return { success: false, error: res?.error || 'Native print failed' };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1500);
        return { success: true };
      }
      return { success: false, error: 'Could not open print frame' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async triggerCashDrawerPulse(): Promise<boolean> {
    if ((window as any).posHardware?.openCashDrawer) {
      try {
        const res = await (window as any).posHardware.openCashDrawer();
        return Boolean(res?.success);
      } catch {}
    }
    console.log('[ThermalPrinterService] Cash drawer kick pulse simulated');
    return true;
  }

  static async connectBluetoothDevice(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    if (typeof navigator === 'undefined' || !(navigator as any).bluetooth) {
      return { 
        success: false, 
        error: 'Web Bluetooth API is not supported in this browser. Please use Google Chrome or Android POS App.' 
      };
    }
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
      });
      return { success: true, deviceName: device.name || 'Bluetooth Printer (' + device.id.slice(0, 6) + ')' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Bluetooth connection was cancelled or failed' };
    }
  }

  static async testNetworkPrinter(ip: string, port = 9100): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetchPOSApi('/api/pos/printer/test-network', {
        method: 'POST',
        body: JSON.stringify({ ip, port })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true };
      }
      return { success: false, error: data.error || ('Failed to reach network printer at ' + ip + ':' + port) };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network request failed' };
    }
  }
}
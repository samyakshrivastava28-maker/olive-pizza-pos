import { ThermalPrinterService, ReceiptRenderData } from './ThermalPrinterService';
import { fetchApi } from '../lib/api';
import { usePOSStore } from '../store/posStore';
import toast from 'react-hot-toast';

export class OnlineOrderPrintListener {
  private static pollTimer: any = null;
  private static isProcessing = false;

  static startListener() {
    if (this.pollTimer) return;
    console.log('🖨️ [OnlineOrderPrintListener] Started online order automatic print listener...');
    this.pollTimer = setInterval(() => {
      this.checkAndProcessPendingPrints();
    }, 6000);
    this.checkAndProcessPendingPrints();
  }

  static stopListener() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  static async checkAndProcessPendingPrints() {
    if (this.isProcessing) return;
    const config = ThermalPrinterService.getConfig();

    this.isProcessing = true;
    try {
      const res = await fetchApi('/api/pos/pending-online-prints');
      if (res && res.success && Array.isArray(res.orders)) {
        usePOSStore.getState().setPendingOnlineOrders(res.orders);

        if (config.autoPrintOnline && config.isPrimaryTerminal) {
          for (const order of res.orders) {
            await this.processSingleOrderPrint(order);
          }
        }
      }
    } catch (err: any) {
      // Silent
    } finally {
      this.isProcessing = false;
    }
  }

  static async manualPrintOrder(order: any): Promise<boolean> {
    return await this.processSingleOrderPrint(order, true);
  }

  static async processSingleOrderPrint(order: any, isManual = false): Promise<boolean> {
    // 1. Deduplication guard — Do not re-print already printed online orders on poll cycles
    if (!isManual && ThermalPrinterService.isAlreadyPrinted(order.id)) {
      return true;
    }

    const terminalId = usePOSStore.getState().session?.terminalId || 'POS-TERM-01';
    const branchName = usePOSStore.getState().session?.branchName || 'Olive Pizza';
    const cashierName = usePOSStore.getState().session?.cashierName || 'Auto System';

    try {
      if (!isManual) {
        const claimRes = await fetchApi('/api/pos/claim-print', {
          method: 'POST',
          body: JSON.stringify({
            orderId: order.id,
            terminalId
          })
        });

        if (!claimRes || !claimRes.success) {
          return false;
        }
      }

      const receiptData: ReceiptRenderData = {
        orderId: order.id,
        billNumber: order.dailyOrderNumber ? ('#' + order.dailyOrderNumber) : (order.orderNumber || ('#' + order.id.slice(-5).toUpperCase())),
        orderSource: order.orderSource || 'CUSTOMER_APP',
        orderType: order.orderType || 'Online Delivery',
        branchName,
        customerName: order.customerName || order.userPhone || 'Online Guest',
        customerPhone: order.customerPhone || order.userPhone || order.contactPhone || '',
        deliveryAddress: order.deliveryAddress?.formatted || order.deliveryAddress?.addressLine || (typeof order.deliveryAddress === 'string' ? order.deliveryAddress : ''),
        cashierName,
        terminalId,
        items: (order.items || []).map((it: any) => ({
          name: it.productName || it.name || 'Pizza',
          quantity: Number(it.quantity || 1),
          price: Number(it.unitPrice || it.price || 0),
          size: it.selectedSize || it.size,
          crust: it.selectedCrust || it.crust,
          addons: Array.isArray(it.selectedAddons) ? it.selectedAddons.map((a: any) => a.name || a) : (it.addons || [])
        })),
        subtotal: Number(order.subtotal || order.totalAmount || 0),
        discount: Number(order.discount || order.discountAmount || 0),
        tax: Number(order.tax || order.taxes || Math.round((order.totalAmount || 0) * 0.05)),
        deliveryFee: Number(order.deliveryFee || 0),
        total: Number(order.totalAmount || order.total || 0),
        paymentMethod: (order.paymentMethod || 'ONLINE').toUpperCase(),
        paymentStatus: (order.paymentStatus || 'PAID').toUpperCase(),
        createdAt: order.createdAt || new Date().toISOString()
      };

      const printResult = await ThermalPrinterService.printReceipt(receiptData);
      const finalStatus = printResult.success ? 'PRINTED' : 'PRINT_FAILED';

      await fetchApi('/api/pos/update-print-status', {
        method: 'POST',
        body: JSON.stringify({
          orderId: order.id,
          status: finalStatus,
          terminalId,
          printerName: ThermalPrinterService.getConfig().printerName,
          error: printResult.error
        })
      });

      if (printResult.success) {
        if (!isManual) {
          ThermalPrinterService.markAsPrinted(order.id);
          ThermalPrinterService.dequeueFailedPrint(order.id);
        }
        toast.success('Printed ✓ (' + receiptData.billNumber + ')', { duration: 3000, icon: '🖨️' });
        // Refresh pending list
        const res = await fetchApi('/api/pos/pending-online-prints');
        if (res && res.success && Array.isArray(res.orders)) {
          usePOSStore.getState().setPendingOnlineOrders(res.orders);
        }
        return true;
      } else {
        if (!isManual) {
          ThermalPrinterService.enqueueFailedPrint(receiptData);
        }
        toast('Printer offline — ' + receiptData.billNumber + ' saved (Print Pending)', { duration: 4000, icon: '⚠️' });
        return false;
      }
    } catch (err: any) {
      console.warn('[OnlineOrderPrintListener] Error processing print:', err.message);
      return false;
    }
  }
}

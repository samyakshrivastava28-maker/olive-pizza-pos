/**
 * PosCsvExportService.ts — Spreadsheet-Compatible CSV Reporting Engine for POS
 *
 * Requirements:
 * 1. RFC 4180 spreadsheet-compatible CSV formatting.
 * 2. CWE-1236 Formula Injection Mitigation:
 *    Prepends single quote (') to cells starting with '=', '+', '-', '@', '\t', '\r',
 *    while strictly preserving negative numbers and valid numeric literals.
 * 3. Consistent column names, date formatting, and decimal money formatting.
 * 4. Safe browser blob trigger.
 */

import { OfflineBillRecord } from './PosIndexedDbService';

export interface CsvExportResult {
  filename: string;
  content: string;
  rowCount: number;
}

export class PosCsvExportService {
  /**
   * Sanitizes a cell value for CSV output:
   * - Prevents CSV formula injection (CSV Injection / CWE-1236).
   * - Escapes quotes, commas, and newlines per RFC 4180.
   * - Strictly preserves native negative numbers (e.g. -50.00, -12.5) and valid numeric strings.
   */
  public static sanitizeCell(val: any): string {
    if (val === null || val === undefined) {
      return '';
    }

    if (val instanceof Date) {
      return val.toISOString();
    }

    // Fast-path: If value is a native number, preserve as-is (e.g. -50.00, 100, 0)
    if (typeof val === 'number') {
      return Number.isFinite(val) ? String(val) : '';
    }

    let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    const trimmed = str.trim();

    // Preserve valid numeric strings (including negative numbers and decimal points)
    // Examples: "-50.00", "+12.5", "0.00", "-0.99", "1250"
    const isPureNumeric = !isNaN(Number(trimmed)) && /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed);

    if (!isPureNumeric) {
      // Formula Injection Mitigation (CWE-1236):
      // Dangerous leading characters: =, @, \t, \r, or + / - when NOT part of a valid numeric literal
      const dangerousChars = ['=', '@', '\t', '\r'];
      if (
        str.length > 0 &&
        (dangerousChars.includes(str[0]) ||
         ((str[0] === '+' || str[0] === '-') && !isPureNumeric))
      ) {
        str = `'${str}`;
      }
    }

    // RFC 4180 escaping: If value contains comma, double-quote, or newline, wrap in double quotes
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  /**
   * Build RFC 4180 CRLF separated CSV text.
   */
  public static buildCsv(headers: string[], rows: any[][]): string {
    const headerLine = headers.map(h => this.sanitizeCell(h)).join(',');
    const bodyLines = rows.map(row => row.map(cell => this.sanitizeCell(cell)).join(','));
    return [headerLine, ...bodyLines].join('\r\n');
  }

  /**
   * Trigger safe client download of generated CSV.
   */
  public static downloadCsv(filename: string, content: string): void {
    if (typeof window === 'undefined' || !window.document) return;

    // Detect Capacitor native platform (Android/iOS)
    const isCapacitorNative = Boolean((window as any).Capacitor?.isNativePlatform && (window as any).Capacitor.isNativePlatform());
    if (isCapacitorNative) {
      console.info('[PosCsvExportService] Native Capacitor platform detected. Blob download initiated; native device filesystem access is handled via @capacitor/filesystem when provisioned.');
    }

    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * 1. Export Offline Transactions & Sync Status
   */
  public static exportOfflineBillsCsv(bills: OfflineBillRecord[]): CsvExportResult {
    const headers = [
      'Idempotency Key',
      'Bill Number',
      'Permanent Bill No',
      'Provisional Receipt No',
      'Sync Status',
      'Date Created',
      'Date Synced',
      'Customer Name',
      'Customer Phone',
      'Order Source',
      'Payment Method',
      'Payment Status',
      'Subtotal',
      'Discount',
      'Tax Amount',
      'Total Amount',
      'Terminal ID',
      'Retry Count',
      'Last Error'
    ];

    const rows = bills.map((b) => {
      const bill = b.bill || ({} as any);
      return [
        b.idempotencyKey,
        b.billNumber || bill.billNumber || '',
        b.permanentBillNo ? String(b.permanentBillNo) : (bill.permanentBillNo ? String(bill.permanentBillNo) : 'PROVISIONAL'),
        b.billNumber?.startsWith('PROV-') ? b.billNumber : (bill.provisionalReceiptNo || 'N/A'),
        b.status,
        b.createdAt,
        b.syncedAt || '',
        bill.customerName || 'Walk-in Guest',
        bill.customerPhone || 'N/A',
        bill.orderSource || 'POS_DINE_IN',
        bill.paymentMethod || 'CASH',
        bill.paymentStatus || 'PAID',
        Number(bill.subtotal || 0).toFixed(2),
        Number(bill.discountAmount || 0).toFixed(2),
        Number(bill.taxAmount || 0).toFixed(2),
        Number(bill.finalTotal || bill.totalAmount || 0).toFixed(2),
        bill.session?.terminalId || 'TERM-01',
        b.retryCount || 0,
        b.lastError || ''
      ];
    });

    const content = this.buildCsv(headers, rows);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `olive-pizza-pos-offline-bills-${dateStr}.csv`;

    return { filename, content, rowCount: rows.length };
  }

  /**
   * 2. Export Daily POS Sales Summary
   */
  public static exportDailySalesCsv(bills: OfflineBillRecord[]): CsvExportResult {
    const headers = [
      'Date',
      'Total Transactions',
      'Cash Sales',
      'UPI Sales',
      'Card Sales',
      'Total Discounts',
      'Total Taxes',
      'Gross Sales',
      'Net Revenue'
    ];

    // Group by Date
    const grouped = new Map<string, {
      count: number;
      cash: number;
      upi: number;
      card: number;
      discount: number;
      tax: number;
      gross: number;
      net: number;
    }>();

    for (const b of bills) {
      const bill = b.bill || ({} as any);
      const dateKey = (b.createdAt || new Date().toISOString()).split('T')[0];
      const entry = grouped.get(dateKey) || {
        count: 0,
        cash: 0,
        upi: 0,
        card: 0,
        discount: 0,
        tax: 0,
        gross: 0,
        net: 0
      };

      const total = Number(bill.finalTotal || bill.totalAmount || 0);
      const subtotal = Number(bill.subtotal || 0);
      const discount = Number(bill.discountAmount || 0);
      const tax = Number(bill.taxAmount || 0);
      const method = (bill.paymentMethod || 'CASH').toString().toUpperCase();

      entry.count += 1;
      entry.gross += subtotal;
      entry.discount += discount;
      entry.tax += tax;
      entry.net += total;

      if (method === 'CASH') entry.cash += total;
      else if (method === 'UPI') entry.upi += total;
      else entry.card += total;

      grouped.set(dateKey, entry);
    }

    const rows = Array.from(grouped.entries()).map(([date, d]) => [
      date,
      d.count,
      d.cash.toFixed(2),
      d.upi.toFixed(2),
      d.card.toFixed(2),
      d.discount.toFixed(2),
      d.tax.toFixed(2),
      d.gross.toFixed(2),
      d.net.toFixed(2)
    ]);

    const content = this.buildCsv(headers, rows);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `olive-pizza-pos-daily-sales-${dateStr}.csv`;

    return { filename, content, rowCount: rows.length };
  }

  /**
   * 3. Export Bills and Line Items Breakdown
   */
  public static exportBillsAndItemsCsv(bills: OfflineBillRecord[]): CsvExportResult {
    const headers = [
      'Bill Number',
      'Permanent Bill No',
      'Date',
      'Customer Name',
      'Item Name',
      'Variant',
      'Crust',
      'Quantity',
      'Unit Price',
      'Addons',
      'Line Total',
      'Payment Method',
      'Sync Status'
    ];

    const rows: any[][] = [];

    for (const b of bills) {
      const bill = b.bill || ({} as any);
      const items = Array.isArray(bill.items) ? bill.items : [];
      const billNo = b.billNumber || bill.billNumber || '';
      const permNo = b.permanentBillNo ? String(b.permanentBillNo) : (bill.permanentBillNo ? String(bill.permanentBillNo) : 'PROVISIONAL');
      const date = (b.createdAt || '').split('T')[0];
      const cust = bill.customerName || 'Walk-in Guest';
      const pay = bill.paymentMethod || 'CASH';
      const status = b.status;

      if (items.length === 0) {
        rows.push([
          billNo, permNo, date, cust,
          'Standard Order Item', 'Standard', 'Default', 1,
          Number(bill.finalTotal || 0).toFixed(2), '[]',
          Number(bill.finalTotal || 0).toFixed(2), pay, status
        ]);
      } else {
        for (const item of items) {
          const unitPrice = Number(item.price || item.unitPrice || 0);
          const qty = Number(item.quantity || 1);
          const lineTotal = Number(item.total || (unitPrice * qty));
          rows.push([
            billNo, permNo, date, cust,
            item.name || item.itemName || 'Pizza Item',
            item.size || item.sizeVariant || 'Standard',
            item.crust || 'Default',
            qty,
            unitPrice.toFixed(2),
            item.addons ? JSON.stringify(item.addons) : '[]',
            lineTotal.toFixed(2),
            pay,
            status
          ]);
        }
      }
    }

    const content = this.buildCsv(headers, rows);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `olive-pizza-pos-bills-and-items-${dateStr}.csv`;

    return { filename, content, rowCount: rows.length };
  }

  /**
   * 4. Export Taxes Breakdown CSV
   */
  public static exportTaxesCsv(bills: OfflineBillRecord[]): CsvExportResult {
    const headers = [
      'Bill Number',
      'Date',
      'Taxable Subtotal',
      'CGST (2.5%)',
      'SGST (2.5%)',
      'Total GST (5.0%)',
      'Total Bill Amount',
      'Sync Status'
    ];

    const rows = bills.map((b) => {
      const bill = b.bill || ({} as any);
      const subtotal = Number(bill.subtotal || 0);
      const tax = Number(bill.taxAmount || (subtotal * 0.05));
      const cgst = tax / 2;
      const sgst = tax / 2;
      const total = Number(bill.finalTotal || bill.totalAmount || 0);

      return [
        b.billNumber || bill.billNumber || '',
        (b.createdAt || '').split('T')[0],
        subtotal.toFixed(2),
        cgst.toFixed(2),
        sgst.toFixed(2),
        tax.toFixed(2),
        total.toFixed(2),
        b.status
      ];
    });

    const content = this.buildCsv(headers, rows);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `olive-pizza-pos-tax-breakdown-${dateStr}.csv`;

    return { filename, content, rowCount: rows.length };
  }
}

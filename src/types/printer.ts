export type PaperSize = '58mm' | '80mm';
export type PrinterConnection = 'USB' | 'LAN' | 'BLUETOOTH' | 'SYSTEM_DEFAULT';

export interface PrinterConfig {
  printerName: string;
  connectionType: PrinterConnection;
  paperSize: PaperSize;
  autoPrintOnline: boolean;
  isPrimaryTerminal: boolean;
  lanIp?: string;
  lanPort?: number;
  bluetoothDeviceId?: string;
  bluetoothDeviceName?: string;
  autoCut?: boolean;
  drawerKickOnCash: boolean;
}

export interface PrintJob {
  id: string;
  orderId: string;
  orderNumber: string;
  orderSource: string;
  orderType: string;
  customerName: string;
  totalAmount: number;
  status: 'PENDING' | 'PRINTING' | 'PRINTED' | 'FAILED';
  createdAt: string;
  printedAt?: string;
  error?: string;
  isReprint?: boolean;
}
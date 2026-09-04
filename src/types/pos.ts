export type OrderSourceType = 'POS_DINE_IN' | 'POS_TAKEAWAY' | 'POS_DELIVERY' | 'ONLINE_APP' | 'OFFLINE_RESTAURANT';

export interface POSProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  basePrice?: number;
  imageUrl?: string;
  image?: string;
  description?: string;
  isVegetarian?: boolean;
  stockStatus?: 'IN_STOCK' | 'OUT_OF_STOCK';
  isAvailable?: boolean;
  isPhysicalOnly?: boolean;
  channelAvailability?: {
    online: boolean;
    dineIn: boolean;
    takeaway: boolean;
    posDelivery: boolean;
  };
  variants?: Array<{ name: string; price: number }>;
  crusts?: Array<{ name: string; price: number }>;
  addons?: Array<{ id: string; name: string; price: number }>;
  sizes?: Array<{ name: string; price: number }>;
  availableAddons?: Array<{ id: string; name: string; price: number }>;
}

export interface POSCartItemAddon {
  id: string;
  name: string;
  price: number;
}

export interface POSCartItem {
  cartItemId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  size: string;
  crust: string;
  addons: POSCartItemAddon[];
  kitchenNotes?: string;
  image?: string;
}

export interface BranchOption {
  franchiseId: string;
  branchId: string;
  name: string;
  code: string;
  city?: string;
}

export interface HeldBill {
  id: string;
  title: string;
  orderSource: OrderSourceType;
  tableNumber?: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  items: POSCartItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  finalTotal: number;
  heldAt: string;
}

export interface POSTerminalSession {
  isOwnerMode?: boolean;
  role?: string;
  franchiseName?: string;
  terminalName?: string;
  cashierName: string;
  cashierUid: string;
  terminalId: string;
  branchId: string;
  branchName: string;
  franchiseId: string;
  organizationId: string;
  token?: string;
  activeShift?: {
    id?: string;
    openingCash?: number;
    openedAt?: string;
    cashSales?: number;
    expectedCash?: number;
  };
}

export interface POSPaymentDetails {
  method: 'CASH' | 'UPI' | 'CARD' | 'SPLIT';
  cashReceived?: number;
  cashChange?: number;
  upiAmount?: number;
  cardAmount?: number;
  splitCash?: number;
  splitUPI?: number;
  splitCard?: number;
  transactionRef?: string;
}

export interface POSCompletedBill {
  billNumber: string;
  permanentBillNo?: number;
  dailyOrderNumber?: number;
  orderId: string;
  orderSource: OrderSourceType;
  tableNumber?: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  items: POSCartItem[];
  subtotal: number;
  discountAmount: number;
  couponCode?: string;
  taxAmount: number; // 5% GST
  deliveryFee: number;
  finalTotal: number;
  payment: POSPaymentDetails;
  session: POSTerminalSession;
  createdAt: string;
}

export interface POSCustomerProfile {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  totalOrders?: number;
  isOnlineCustomer?: boolean;
  isPOSCustomer?: boolean;
  createdAt?: string | null;
}


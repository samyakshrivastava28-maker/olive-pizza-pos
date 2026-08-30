import { create } from 'zustand';
import { POSCartItem, OrderSourceType, POSTerminalSession, POSCompletedBill, POSCustomerProfile, HeldBill, BranchOption } from '../types/pos';

export type CustomerLookupStatus = 'IDLE' | 'SEARCHING' | 'FOUND' | 'NOT_FOUND' | 'ERROR';

interface POSState {
  // Session & Branch Context
  session: POSTerminalSession | null;
  setSession: (session: POSTerminalSession | null) => void;
  isOwner: boolean;
  setIsOwner: (isOwner: boolean) => void;
  availableBranches: BranchOption[];
  setAvailableBranches: (branches: BranchOption[]) => void;
  activeBranchId: string;
  activeFranchiseId: string;
  switchBranchContext: (branchId: string, franchiseId: string, branchName: string) => void;

  // Order Details
  orderSource: OrderSourceType;
  setOrderSource: (source: OrderSourceType) => void;
  tableNumber: string;
  setTableNumber: (table: string) => void;

  // Customer Identity
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryFee: number;
  isWalkinCustomer: boolean;
  customerLookupState: CustomerLookupStatus;
  customerProfile: POSCustomerProfile | null;
  isEditingCustomerName: boolean;

  setCustomerId: (id: string | null) => void;
  setIsWalkinCustomer: (isWalkin: boolean) => void;
  setCustomerLookupState: (state: CustomerLookupStatus) => void;
  setCustomerProfile: (profile: POSCustomerProfile | null) => void;
  setIsEditingCustomerName: (isEditing: boolean) => void;
  setDeliveryFee: (fee: number) => void;
  setCustomer: (details: { name?: string; phone?: string; address?: string; id?: string | null }) => void;

  // Cart Items
  items: POSCartItem[];
  addItem: (item: Omit<POSCartItem, 'cartItemId'>) => void;
  updateQuantity: (cartItemId: string, delta: number) => void;
  removeItem: (cartItemId: string) => void;
  clearCart: () => void;

  // Discounts & Coupons
  discountAmount: number;
  couponCode: string;
  setDiscountAmount: (amount: number) => void;
  setCouponCode: (code: string) => void;

  // Hold & Resume Bills
  heldBills: HeldBill[];
  isHeldBillsOpen: boolean;
  setIsHeldBillsOpen: (open: boolean) => void;
  holdCurrentBill: () => boolean;
  resumeBill: (heldId: string) => void;
  deleteHeldBill: (heldId: string) => void;

  // Bill History Drawer
  isHistoryOpen: boolean;
  setIsHistoryOpen: (open: boolean) => void;

  // Last Completed Bill
  lastCompletedBill: POSCompletedBill | null;
  setLastCompletedBill: (bill: POSCompletedBill | null) => void;

  // Multi-terminal drawer
  isAllTerminalsOpen: boolean;
  setIsAllTerminalsOpen: (open: boolean) => void;

  // Quick Stock Management Drawer (F9)
  isStockDrawerOpen: boolean;
  setIsStockDrawerOpen: (open: boolean) => void;

  // Thermal Printer Settings Modal (F8)
  isPrinterSettingsOpen: boolean;
  setIsPrinterSettingsOpen: (open: boolean) => void;

  // Live Print Queue Drawer
  isPrintQueueOpen: boolean;
  setIsPrintQueueOpen: (open: boolean) => void;
  pendingOnlineOrders: any[];
  setPendingOnlineOrders: (orders: any[]) => void;

  // Reset entire order state
  resetOrder: () => void;
}

export const getPOSCalculations = (state: { items: POSCartItem[]; discountAmount: number; deliveryFee?: number }) => {
  const subtotal = state.items.reduce((sum, it) => {
    const addonsTotal = (it.addons || []).reduce((aSum, a) => aSum + a.price, 0);
    return sum + (it.price + addonsTotal) * it.quantity;
  }, 0);

  const discount = Math.min(state.discountAmount || 0, subtotal);
  const taxableAmount = Math.max(0, subtotal - discount);
  const taxAmount = Math.round(taxableAmount * 0.05); // 5% GST
  const delivery = state.deliveryFee || 0;
  const finalTotal = taxableAmount + taxAmount + delivery;

  return {
    subtotal,
    discountAmount: discount,
    taxableAmount,
    taxAmount,
    deliveryFee: delivery,
    finalTotal,
  };
};

export const usePOSStore = create<POSState>((set, get) => ({
  session: null,
  setSession: (session) => set({ 
    session,
    activeBranchId: session?.branchId || localStorage.getItem('pos_branch_id') || 'main_branch',
    activeFranchiseId: session?.franchiseId || 'fra_primary',
    isOwner: session?.role === 'owner' || session?.isOwnerMode || false
  }),
  isOwner: false,
  setIsOwner: (isOwner) => set({ isOwner }),
  availableBranches: [
    { franchiseId: 'fra_rajnandgaon', branchId: 'main_branch', name: 'Olive Pizza — Rajnandgaon (HQ)', code: 'OP-RJN-01', city: 'Rajnandgaon' },
    { franchiseId: 'fra_durg', branchId: 'durg_branch', name: 'Olive Pizza — Durg Branch', code: 'OP-DURG-02', city: 'Durg' },
    { franchiseId: 'fra_bhilai', branchId: 'bhilai_branch', name: 'Olive Pizza — Bhilai Central', code: 'OP-BHL-03', city: 'Bhilai' },
    { franchiseId: 'fra_raipur', branchId: 'raipur_branch', name: 'Olive Pizza — Raipur Hub', code: 'OP-RPR-04', city: 'Raipur' }
  ],
  setAvailableBranches: (availableBranches) => set({ availableBranches }),
  activeBranchId: localStorage.getItem('pos_branch_id') || 'main_branch',
  activeFranchiseId: 'fra_primary',
  switchBranchContext: (branchId, franchiseId, branchName) => {
    localStorage.setItem('pos_branch_id', branchId);
    set((state) => ({
      activeBranchId: branchId,
      activeFranchiseId: franchiseId,
      session: state.session ? {
        ...state.session,
        branchId,
        franchiseId,
        branchName
      } : null,
      items: [],
      discountAmount: 0,
      customerName: '',
      customerPhone: '',
      customerId: null,
      tableNumber: 'T-1'
    }));
  },

  orderSource: 'POS_DINE_IN',
  setOrderSource: (orderSource) => set({ 
    orderSource,
    deliveryFee: 0
  }),
  tableNumber: 'T-1',
  setTableNumber: (tableNumber) => set({ tableNumber }),

  // Customer State — Empty by default (no pre-filled walk-in)
  customerId: null,
  customerName: '',
  customerPhone: '',
  deliveryAddress: '',
  deliveryFee: 0,
  isWalkinCustomer: false,
  customerLookupState: 'IDLE',
  customerProfile: null,
  isEditingCustomerName: false,

  setCustomerId: (customerId) => set({ customerId }),
  setIsWalkinCustomer: (isWalkinCustomer) => set({ 
    isWalkinCustomer,
    customerName: isWalkinCustomer ? 'Walk-in Customer' : '',
    customerPhone: isWalkinCustomer ? '' : '',
    customerId: isWalkinCustomer ? null : null,
    customerLookupState: 'IDLE',
    customerProfile: null,
    isEditingCustomerName: false
  }),
  setCustomerLookupState: (customerLookupState) => set({ customerLookupState }),
  setCustomerProfile: (customerProfile) => set({ customerProfile }),
  setIsEditingCustomerName: (isEditingCustomerName) => set({ isEditingCustomerName }),
  setDeliveryFee: (deliveryFee) => set({ deliveryFee }),

  setCustomer: (details) =>
    set((state) => ({
      customerId: details.id !== undefined ? details.id : state.customerId,
      customerName: details.name !== undefined ? details.name : state.customerName,
      customerPhone: details.phone !== undefined ? details.phone : state.customerPhone,
      deliveryAddress: details.address !== undefined ? details.address : state.deliveryAddress,
    })),

  items: [],
  addItem: (newItem) =>
    set((state) => {
      const cartItemId = `${newItem.productId}-${newItem.size}-${newItem.crust}-${(newItem.addons || []).map((a) => a.id).sort().join('_')}-${newItem.kitchenNotes || ''}`;
      const existingIdx = state.items.findIndex((it) => it.cartItemId === cartItemId);

      if (existingIdx > -1) {
        const updated = [...state.items];
        updated[existingIdx].quantity += newItem.quantity || 1;
        return { items: updated };
      }

      return {
        items: [
          ...state.items,
          {
            ...newItem,
            cartItemId,
            quantity: newItem.quantity || 1,
            addons: newItem.addons || [],
          },
        ],
      };
    }),

  updateQuantity: (cartItemId, delta) =>
    set((state) => {
      const updated = state.items
        .map((it) => {
          if (it.cartItemId === cartItemId) {
            const nextQty = it.quantity + delta;
            return nextQty > 0 ? { ...it, quantity: nextQty } : null;
          }
          return it;
        })
        .filter(Boolean) as POSCartItem[];

      return { items: updated };
    }),

  removeItem: (cartItemId) =>
    set((state) => ({
      items: state.items.filter((it) => it.cartItemId !== cartItemId),
    })),

  clearCart: () => set({ items: [] }),

  discountAmount: 0,
  couponCode: '',
  setDiscountAmount: (discountAmount) => set({ discountAmount }),
  setCouponCode: (couponCode) => set({ couponCode }),

  // Held Bills
  heldBills: [],
  isHeldBillsOpen: false,
  setIsHeldBillsOpen: (isHeldBillsOpen) => set({ isHeldBillsOpen }),
  holdCurrentBill: () => {
    const state = get();
    if (state.items.length === 0) return false;

    const calcs = getPOSCalculations({ items: state.items, discountAmount: state.discountAmount, deliveryFee: state.deliveryFee });
    const held: HeldBill = {
      id: `hold_${Date.now()}`,
      title: `${state.orderSource.replace('POS_', '')} • ${state.tableNumber || state.customerName || 'Cart'}`,
      orderSource: state.orderSource,
      tableNumber: state.tableNumber,
      customerName: state.customerName || 'Customer',
      customerPhone: state.customerPhone || '',
      deliveryAddress: state.deliveryAddress,
      items: [...state.items],
      subtotal: calcs.subtotal,
      discountAmount: calcs.discountAmount,
      taxAmount: calcs.taxAmount,
      finalTotal: calcs.finalTotal,
      heldAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };

    set((s) => ({
      heldBills: [held, ...s.heldBills],
      items: [],
      discountAmount: 0,
      couponCode: '',
      customerId: null,
      customerName: '',
      customerPhone: '',
      deliveryAddress: '',
      tableNumber: 'T-1',
      isWalkinCustomer: false
    }));

    return true;
  },
  resumeBill: (heldId: string) => {
    const state = get();
    const target = state.heldBills.find((b) => b.id === heldId);
    if (!target) return;

    set((s) => ({
      heldBills: s.heldBills.filter((b) => b.id !== heldId),
      items: target.items,
      orderSource: target.orderSource,
      tableNumber: target.tableNumber || 'T-1',
      customerName: target.customerName,
      customerPhone: target.customerPhone,
      deliveryAddress: target.deliveryAddress || '',
      discountAmount: target.discountAmount,
      isHeldBillsOpen: false
    }));
  },
  deleteHeldBill: (heldId: string) => {
    set((s) => ({
      heldBills: s.heldBills.filter((b) => b.id !== heldId)
    }));
  },

  isHistoryOpen: false,
  setIsHistoryOpen: (isHistoryOpen) => set({ isHistoryOpen }),

  lastCompletedBill: null,
  setLastCompletedBill: (lastCompletedBill) => set({ lastCompletedBill }),

  isAllTerminalsOpen: false,
  setIsAllTerminalsOpen: (isAllTerminalsOpen) => set({ isAllTerminalsOpen }),

  isStockDrawerOpen: false,
  setIsStockDrawerOpen: (isStockDrawerOpen) => set({ isStockDrawerOpen }),

  isPrinterSettingsOpen: false,
  setIsPrinterSettingsOpen: (isPrinterSettingsOpen) => set({ isPrinterSettingsOpen }),

  isPrintQueueOpen: false,
  setIsPrintQueueOpen: (isPrintQueueOpen) => set({ isPrintQueueOpen }),
  pendingOnlineOrders: [],
  setPendingOnlineOrders: (pendingOnlineOrders) => set({ pendingOnlineOrders }),

  resetOrder: () =>
    set(() => ({
      items: [],
      discountAmount: 0,
      couponCode: '',
      customerId: null,
      customerName: '',
      customerPhone: '',
      deliveryAddress: '',
      tableNumber: 'T-1',
      deliveryFee: 0,
      isWalkinCustomer: false,
      customerLookupState: 'IDLE',
      customerProfile: null,
      isEditingCustomerName: false
    })),
}));


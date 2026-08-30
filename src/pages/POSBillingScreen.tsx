import React, { useState, useEffect, useRef } from 'react';
import { POSHeader } from '../components/pos/POSHeader';
import { ProductGrid } from '../components/pos/ProductGrid';
import { CartPanel } from '../components/pos/CartPanel';
import { CustomizationModal } from '../components/pos/CustomizationModal';
import { PaymentModal } from '../components/pos/PaymentModal';
import { ThermalReceipt } from '../components/pos/ThermalReceipt';
import { BillHistoryDrawer } from '../components/pos/BillHistoryDrawer';
import { AllPOSTerminalsDrawer } from '../components/pos/AllPOSTerminalsDrawer';
import { HeldBillsModal } from '../components/pos/HeldBillsModal';
import { usePOSStore } from '../store/posStore';
import { POSProduct, POSCompletedBill } from '../types/pos';
import { ProductStockDrawer } from '../components/pos/ProductStockDrawer';
import { PrinterSettingsModal } from '../components/pos/PrinterSettingsModal';
import { PrintQueueDrawer } from '../components/pos/PrintQueueDrawer';
import { OnlineOrderPrintListener } from '../services/OnlineOrderPrintListener';
import { OfflineBillingQueueService } from '../services/OfflineBillingQueueService';
import { ThermalPrinterService } from '../services/ThermalPrinterService';
import { fetchPOSApi } from '../lib/api';

interface POSBillingScreenProps {
  onLogout: () => void;
}

const FALLBACK_PRODUCTS: POSProduct[] = [
  { id: 'prod_margherita', name: 'Classic Margherita', category: 'Veg Pizzas', price: 199, basePrice: 199, isVegetarian: true, isAvailable: true, imageUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400', description: 'Fresh mozzarella & basil' },
  { id: 'prod_farmhouse', name: 'Farmhouse Delight', category: 'Veg Pizzas', price: 299, basePrice: 299, isVegetarian: true, isAvailable: true, imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400', description: 'Capsicum, mushroom, tomato & onion' },
  { id: 'prod_paneer_tikka', name: 'Peppy Paneer Tikka', category: 'Veg Pizzas', price: 349, basePrice: 349, isVegetarian: true, isAvailable: true, imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400', description: 'Tandoori paneer with red paprika' },
  { id: 'prod_cheese_burst', name: 'Ultimate Cheese Burst', category: 'Veg Pizzas', price: 399, basePrice: 399, isVegetarian: true, isAvailable: true, imageUrl: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=400', description: 'Molten cheese crust with golden corn' },
  { id: 'prod_chicken_fiesta', name: 'Chicken Golden Delight', category: 'Non-Veg Pizzas', price: 379, basePrice: 379, isVegetarian: false, isAvailable: true, imageUrl: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400', description: 'Barbeque chicken with extra cheese' },
  { id: 'prod_garlic_bread', name: 'Stuffed Garlic Bread', category: 'Sides & Garlic Bread', price: 149, basePrice: 149, isVegetarian: true, isAvailable: true, imageUrl: 'https://images.unsplash.com/photo-1619881589880-e34927f8c92e?w=400', description: 'Garlic breadsticks with cheese dip' },
  { id: 'prod_coke', name: 'Coca-Cola (500ml)', category: 'Beverages & Shakes', price: 60, basePrice: 60, isVegetarian: true, isAvailable: true, imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400', description: 'Chilled soft drink' },
  { id: 'prod_choco_lava', name: 'Choco Lava Cake', category: 'Pastas & Desserts', price: 109, basePrice: 109, isVegetarian: true, isAvailable: true, imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400', description: 'Molten chocolate center cake' },
];

export const POSBillingScreen: React.FC<POSBillingScreenProps> = ({ onLogout }) => {
  const { 
    addItem, 
    lastCompletedBill, 
    setLastCompletedBill, 
    items, 
    resetOrder, 
    isHistoryOpen, 
    setIsHistoryOpen,
    isHeldBillsOpen,
    setIsHeldBillsOpen,
    activeBranchId,
    activeFranchiseId,
    holdCurrentBill
  } = usePOSStore();
  
  const [products, setProducts] = useState<POSProduct[]>(FALLBACK_PRODUCTS);
  const [selectedProduct, setSelectedProduct] = useState<POSProduct | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Online order live print listener & offline sync / telemetry heartbeat workers
  useEffect(() => {
    OnlineOrderPrintListener.startListener();
    OfflineBillingQueueService.startBackgroundWorkers();
    return () => {
      OnlineOrderPrintListener.stopListener();
      OfflineBillingQueueService.stopBackgroundWorkers();
    };
  }, []);

  // Fetch branch-scoped menu whenever activeBranchId changes
  useEffect(() => {
    const fetchBranchMenu = async () => {
      try {
        const res = await fetchPOSApi(`/api/pos/menu?branchId=${activeBranchId}&franchiseId=${activeFranchiseId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.items && Array.isArray(data.items) && data.items.length > 0) {
            setProducts(data.items);
            return;
          }
        }
      } catch (err) {
        console.warn('Could not fetch server branch menu, falling back to local list:', err);
      }
      setProducts(FALLBACK_PRODUCTS);
    };

    fetchBranchMenu();
  }, [activeBranchId, activeFranchiseId]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2: Focus Search
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // F4: Clear / Reset Bill
      else if (e.key === 'F4') {
        e.preventDefault();
        resetOrder();
      }
      // F8: Hold / View Held Bills
      else if (e.key === 'F8') {
        e.preventDefault();
        if (items.length > 0) {
          holdCurrentBill();
        } else {
          setIsHeldBillsOpen(!isHeldBillsOpen);
        }
      }
      // F9 or Enter: Open Payment
      else if ((e.key === 'F9' || (e.key === 'Enter' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName))) && items.length > 0 && !isPaymentOpen && !selectedProduct) {
        e.preventDefault();
        setIsPaymentOpen(true);
      }
      // F10: Order History
      else if (e.key === 'F10') {
        e.preventDefault();
        setIsHistoryOpen(!isHistoryOpen);
      }
      // Escape: Close modals
      else if (e.key === 'Escape') {
        if (selectedProduct) setSelectedProduct(null);
        if (isPaymentOpen) setIsPaymentOpen(false);
        if (lastCompletedBill) setLastCompletedBill(null);
        if (isHistoryOpen) setIsHistoryOpen(false);
        if (isHeldBillsOpen) setIsHeldBillsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items.length, isPaymentOpen, selectedProduct, lastCompletedBill, isHistoryOpen, isHeldBillsOpen]);

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-white overflow-hidden select-none font-sans">
      {/* 1. Terminal Header */}
      <POSHeader onLogout={onLogout} />

      {/* 2. Main Workspace: Product Grid (Left) + Current Bill Panel (Right) */}
      <div className="flex-1 flex overflow-hidden">
        <ProductGrid
          products={products}
          searchRef={searchInputRef}
          onSelectProduct={(p) => setSelectedProduct(p)}
        />
        <CartPanel onOpenPayment={() => setIsPaymentOpen(true)} />
      </div>

      {/* 3. Product Customization Modal */}
      {selectedProduct && (
        <CustomizationModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAdd={(item) => addItem(item)}
        />
      )}

      {/* 4. Payment & Settlement Modal */}
      {isPaymentOpen && (
        <PaymentModal
          onClose={() => setIsPaymentOpen(false)}
          onCompleteBill={(bill) => {
            // Bill is auto-printed in background; reset lastCompletedBill to keep cashier flow fluent
            setLastCompletedBill(null);
          }}
        />
      )}

      {/* 5. Last Completed Bill Thermal Print Preview (if triggered explicitly) */}
      {lastCompletedBill && (
        <ThermalReceipt
          bill={lastCompletedBill}
          onClose={() => setLastCompletedBill(null)}
        />
      )}

      {/* 6. Unified Order History Drawer — Instant Reprint without duplicate transactions */}
      <BillHistoryDrawer onReprint={(bill) => {
        ThermalPrinterService.autoPrintCompletedBill(bill, true);
      }} />

      {/* 7. Held Bills Modal */}
      <HeldBillsModal />

      {/* 8. Multi-Terminal Overview Drawer */}
      <AllPOSTerminalsDrawer />

      {/* 9. Quick Stock Availability Drawer */}
      <ProductStockDrawer />

      {/* 10. Thermal Printer Settings Modal */}
      <PrinterSettingsModal />

      {/* 11. Live Online Order Print Queue Drawer */}
      <PrintQueueDrawer />
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { POSHeader } from '../components/pos/POSHeader';
import { ProductGrid } from '../components/pos/ProductGrid';
import { CartPanel } from '../components/pos/CartPanel';
import { CustomizationModal } from '../components/pos/CustomizationModal';
import { PaymentModal } from '../components/pos/PaymentModal';
import { ThermalReceipt } from '../components/pos/ThermalReceipt';
import { AdvancedBillSearchDrawer } from '../components/pos/AdvancedBillSearchDrawer';
import { OnlineOrdersHub } from '../components/pos/OnlineOrdersHub';
import { AllPOSTerminalsDrawer } from '../components/pos/AllPOSTerminalsDrawer';
import { HeldBillsModal } from '../components/pos/HeldBillsModal';
import { usePOSStore } from '../store/posStore';
import { POSProduct, POSCompletedBill } from '../types/pos';
import { ProductStockDrawer } from '../components/pos/ProductStockDrawer';
import { PrinterSettingsModal } from '../components/pos/PrinterSettingsModal';
import { PrintQueueDrawer } from '../components/pos/PrintQueueDrawer';
import { ShiftManagementModal } from '../components/pos/ShiftManagementModal';
import { UtensilsCrossed, Globe, ShoppingBag } from 'lucide-react';
import { OnlineOrderPrintListener } from '../services/OnlineOrderPrintListener';
import { OfflineBillingQueueService } from '../services/OfflineBillingQueueService';
import { ThermalPrinterService } from '../services/ThermalPrinterService';
import { PosIndexedDbService } from '../services/PosIndexedDbService';
import { fetchPOSApi, fetchPOSMenu, invalidateMenuCache } from '../lib/api';

interface POSBillingScreenProps {
  onLogout: () => void;
}

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
    holdCurrentBill,
    isShiftModalOpen,
    setIsShiftModalOpen
  } = usePOSStore();
  
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [isProductsLoading, setIsProductsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<POSProduct | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [billingMode, setBillingMode] = useState<'PHYSICAL' | 'ONLINE'>('PHYSICAL');
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
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

  // Realtime product listener + instant SWR cache restore
  useEffect(() => {
    let isSubscribed = true;

    // 1. Instant 0ms cache restore from IndexedDB to eliminate blank screens
    PosIndexedDbService.getBranchCatalog(activeBranchId).then((cached) => {
      if (isSubscribed && cached && cached.length > 0) {
        setProducts(cached);
        setIsProductsLoading(false);
      }
    }).catch(() => {});

    // 2. Fast background revalidation using Redis Layerbase cached API (300s TTL)
    const fetchBranchMenu = async () => {
      try {
        const data = await fetchPOSMenu(activeBranchId, activeFranchiseId, false, (fresh) => {
          if (isSubscribed && fresh?.items && Array.isArray(fresh.items) && fresh.items.length > 0) {
            setProducts(fresh.items);
            setIsProductsLoading(false);
            PosIndexedDbService.saveBranchCatalog(activeBranchId, activeFranchiseId, fresh.items);
          }
        });

        if (isSubscribed && data?.items && Array.isArray(data.items) && data.items.length > 0) {
          setProducts(data.items);
          setIsProductsLoading(false);
          PosIndexedDbService.saveBranchCatalog(activeBranchId, activeFranchiseId, data.items);
        }
      } catch (err) {
        console.warn('Could not fetch server branch menu, checking IndexedDB cache:', err);
      } finally {
        if (isSubscribed) setIsProductsLoading(false);
      }
    };

    fetchBranchMenu();

    // Firestore real-time listener: Merge master products with branch overrides
    // Prevents master base prices from overwriting franchise custom prices!
    let unsubscribeProducts: (() => void) | undefined;
    let unsubscribeOverrides: (() => void) | undefined;

    import('../lib/firebase').then(({ db }) => {
      import('firebase/firestore').then(({ collection, query, where, onSnapshot }) => {
        if (!isSubscribed) return;

        let latestProductsSnap: any = null;
        const overridesMap = new Map<string, any>();

        const applyMergedCatalog = () => {
          if (!latestProductsSnap || !isSubscribed) return;

          const liveItems: POSProduct[] = latestProductsSnap.docs
            .map((doc: any) => {
              const d = doc.data();
              const override = overridesMap.get(doc.id);

              // Branch Enabled Check
              const isEnabledForBranch = override 
                ? (override.isEnabledForBranch ?? override.isAvailable ?? true) 
                : (d.isActive !== false && d.isAvailable !== false);
              if (!isEnabledForBranch) return null;

              // POS Channel Check
              const channels = override?.channelAvailability || d.channelAvailability || { online: true, dineIn: true, takeaway: true, posDelivery: true };
              const isPosEnabled = channels.dineIn !== false || channels.takeaway !== false || channels.posDelivery !== false;
              if (!isPosEnabled) return null;

              const stockStatus = override?.stockStatus || (d.isAvailable !== false ? 'IN_STOCK' : 'OUT_OF_STOCK');
              const isAvailable = stockStatus === 'IN_STOCK';

              // Retain custom franchise selling price if set
              const customPrice = override?.customPrice ?? override?.sellingPrice;
              const effectivePrice = (customPrice !== undefined && customPrice !== null && !isNaN(Number(customPrice)))
                ? Number(customPrice)
                : Number(d.price ?? d.basePrice ?? 249);

              return {
                id: doc.id,
                name: d.productName || d.name || 'Menu Item',
                category: d.category || 'Veg Pizzas',
                price: effectivePrice,
                basePrice: effectivePrice,
                customPrice: customPrice !== undefined && !isNaN(Number(customPrice)) ? Number(customPrice) : undefined,
                version: override?.version || 1,
                isVegetarian: d.isVegetarian ?? true,
                stockStatus,
                isAvailable,
                imageUrl: d.imageUrl || d.image || '',
                description: d.description || '',
                variants: override?.allowedSizes || d.variants,
                crusts: override?.allowedCrusts || d.crusts,
                addons: override?.allowedAddons || d.addons,
              } as POSProduct;
            })
            .filter(Boolean) as POSProduct[];

          if (liveItems.length > 0 && isSubscribed) {
            setProducts(liveItems);
            setIsProductsLoading(false);
            PosIndexedDbService.saveBranchCatalog(activeBranchId, activeFranchiseId, liveItems);
          }
        };

        // 1. Listen for branch_menu_overrides for activeBranchId
        const overridesQuery = query(
          collection(db, 'branch_menu_overrides'),
          where('branchId', '==', activeBranchId)
        );

        unsubscribeOverrides = onSnapshot(overridesQuery, (snap) => {
          overridesMap.clear();
          snap.docs.forEach((doc) => {
            const data = doc.data();
            if (data.productId) {
              overridesMap.set(data.productId, data);
            }
          });
          applyMergedCatalog();
        }, (err) => {
          console.warn('[POS] Firestore branch overrides realtime warning:', err);
        });

        // 2. Listen for master products
        unsubscribeProducts = onSnapshot(collection(db, 'products'), (snap) => {
          if (!snap.empty) {
            latestProductsSnap = snap;
            applyMergedCatalog();
          }
        }, (err) => {
          console.warn('[POS] Firestore products realtime fallback:', err);
        });
      });
    });

    return () => {
      isSubscribed = false;
      if (unsubscribeProducts) unsubscribeProducts();
      if (unsubscribeOverrides) unsubscribeOverrides();
    };
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
      // F6: Shift & Cash Drawer Modal
      else if (e.key === 'F6') {
        e.preventDefault();
        setIsShiftModalOpen(!isShiftModalOpen);
      }
      // F7: Toggle Physical Counter vs Online Orders Hub
      else if (e.key === 'F7') {
        e.preventDefault();
        setBillingMode(m => m === 'PHYSICAL' ? 'ONLINE' : 'PHYSICAL');
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
        if (isShiftModalOpen) setIsShiftModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items.length, isPaymentOpen, selectedProduct, lastCompletedBill, isHistoryOpen, isHeldBillsOpen, isShiftModalOpen]);

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-white overflow-hidden select-none font-sans">
      {/* 1. Terminal Header */}
      <POSHeader onLogout={onLogout} />

      {/* 1.1 Mode Switcher Bar (Counter Physical vs Customer Online Orders) */}
      <div className="h-11 bg-zinc-900 border-b border-zinc-800 px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBillingMode('PHYSICAL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              billingMode === 'PHYSICAL'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20 font-black'
                : 'text-zinc-400 hover:text-white bg-zinc-800/60'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>Counter / Physical Billing</span>
            <kbd className="hidden sm:inline-block px-1 py-0.2 bg-black/20 text-[9px] rounded font-mono">F7</kbd>
          </button>

          <button
            type="button"
            onClick={() => setBillingMode('ONLINE')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              billingMode === 'ONLINE'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-black'
                : 'text-zinc-400 hover:text-white bg-zinc-800/60'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-purple-400" />
            <span>Customer App Online Hub</span>
            <span className="px-1.5 py-0.2 bg-purple-500 text-white rounded-full text-[10px] font-mono font-black">
              LIVE
            </span>
          </button>
        </div>

        <div className="text-[11px] text-zinc-500 flex items-center gap-3">
          <span>Active Mode: <strong className="text-zinc-300">{billingMode === 'PHYSICAL' ? 'Physical Counter Orders' : 'Customer Online Stream'}</strong></span>
          <span>•</span>
          <span>Printer: <strong className="text-emerald-400 font-bold">ESC/POS Active</strong></span>
        </div>
      </div>

      {/* 2. Main Workspace: Physical Billing OR Online Orders Hub */}
      {billingMode === 'PHYSICAL' ? (
        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 overflow-hidden">
            <ProductGrid
              products={products}
              searchRef={searchInputRef}
              onSelectProduct={(p) => setSelectedProduct(p)}
            />
          </div>

          {/* Desktop Cart (Visible on lg screens and up) */}
          <div className="hidden lg:block h-full">
            <CartPanel onOpenPayment={() => setIsPaymentOpen(true)} />
          </div>

          {/* Mobile Floating Cart Trigger (Visible only on screens < lg) */}
          <div className="lg:hidden absolute bottom-4 right-4 z-20">
            <button
              type="button"
              onClick={() => setIsMobileCartOpen(true)}
              className="flex items-center gap-2.5 px-4 py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-sm rounded-full shadow-2xl shadow-amber-500/40 active:scale-95 transition"
            >
              <ShoppingBag className="w-5 h-5" />
              <span>View Cart</span>
              {items.length > 0 && (
                <span className="px-2 py-0.5 bg-zinc-950 text-amber-400 rounded-full text-xs font-mono font-bold">
                  {items.length}
                </span>
              )}
            </button>
          </div>

          {/* Mobile Bottom Sheet / Modal Drawer */}
          {isMobileCartOpen && (
            <div className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-150">
              <div className="w-full max-w-md h-full bg-zinc-950 shadow-2xl animate-in slide-in-from-right duration-200">
                <CartPanel
                  onOpenPayment={() => {
                    setIsMobileCartOpen(false);
                    setIsPaymentOpen(true);
                  }}
                  onClose={() => setIsMobileCartOpen(false)}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <OnlineOrdersHub />
      )}

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

      {/* 6. Advanced Bill Search Drawer — Fast Deterministic PostgreSQL queries & instant reprint */}
      <AdvancedBillSearchDrawer onReprint={(bill) => {
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

      {/* 12. Cashier Shift & Cash Drawer Reconciliation Modal (F6) */}
      <ShiftManagementModal />
    </div>
  );
};

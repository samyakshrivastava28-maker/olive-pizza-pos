import React, { useState, useEffect } from 'react';
import { usePOSStore } from '../../store/posStore';
import { fetchApi, invalidateMenuCache, CLIENT_CACHE_TTL } from '../../lib/api';
import { 
  Boxes, 
  X, 
  Search, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Edit2,
  Tag,
  Check,
  TrendingUp
} from 'lucide-react';
import toast from 'react-hot-toast';

interface BranchProductStock {
  productId: string;
  name: string;
  category: string;
  inStock: boolean;
  basePrice: number;       // Master Catalog Base Price
  customPrice: number;     // Branch Selling Price
  version?: number;
}

export const ProductStockDrawer: React.FC = () => {
  const { isStockDrawerOpen, setIsStockDrawerOpen, session } = usePOSStore();
  const [items, setItems] = useState<BranchProductStock[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Price Editing State
  const [editingItem, setEditingItem] = useState<BranchProductStock | null>(null);
  const [modalPrice, setModalPrice] = useState<number>(0);
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  const branchId = session?.branchId || '';
  const canEditPrice = true; // Permitted for POS operators and managers

  const loadStock = async () => {
    if (!branchId) return;
    if (items.length === 0) setLoading(true);
    try {
      const res = await fetchApi(
        '/api/menu/branch/' + branchId + '/management',
        {},
        { ttlMs: CLIENT_CACHE_TTL.BRANCH_MENU, swr: true }
      );
      if (res && res.products) {
        setItems(res.products.map((p: any) => ({
          productId: p.id,
          name: p.name || p.productName || 'Pizza Item',
          category: p.category || 'Pizzas',
          inStock: p.inStock !== false && p.stockStatus !== 'OUT_OF_STOCK',
          basePrice: Number(p.basePrice || p.price || 0),
          customPrice: Number(p.customPrice ?? p.price ?? p.basePrice ?? 0),
          version: p.version || 1
        })));
      }
    } catch (err: any) {
      console.warn('Could not load branch stock:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isStockDrawerOpen) {
      loadStock();
    }
  }, [isStockDrawerOpen, branchId]);

  const toggleStock = async (productId: string, currentStatus: boolean) => {
    setUpdatingId(productId);
    const newStatus = !currentStatus;
    try {
      const res = await fetchApi('/api/menu/branch/' + branchId + '/stock-status', {
        method: 'POST',
        body: JSON.stringify({ productId, inStock: newStatus })
      });
      if (res && res.success) {
        invalidateMenuCache(branchId);
        setItems(prev => prev.map(it => it.productId === productId ? { ...it, inStock: newStatus } : it));
        toast.success(newStatus ? 'Marked IN STOCK' : 'Marked OUT OF STOCK');
      } else {
        toast.error('Failed to update stock status');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating stock');
    } finally {
      setUpdatingId(null);
    }
  };

  const openPriceModal = (item: BranchProductStock) => {
    setEditingItem(item);
    setModalPrice(item.customPrice || item.basePrice);
  };

  const handleSavePrice = async () => {
    if (!editingItem) return;
    if (isNaN(modalPrice) || modalPrice <= 0) {
      toast.error('Please enter a valid price greater than ₹0');
      return;
    }

    setIsSavingPrice(true);
    try {
      const res = await fetchApi('/api/menu/branch/' + branchId + '/customizations', {
        method: 'PUT',
        body: JSON.stringify({
          productId: editingItem.productId,
          customPrice: Number(modalPrice),
          isEnabled: editingItem.inStock
        })
      });

      if (res && res.success !== false) {
        invalidateMenuCache(branchId);
        setItems(prev => prev.map(it => 
          it.productId === editingItem.productId 
            ? { ...it, customPrice: Number(modalPrice) } 
            : it
        ));
        toast.success(`Updated ${editingItem.name} selling price to ₹${modalPrice}!`);
        setEditingItem(null);
      } else {
        toast.error(res?.error || 'Failed to update custom price');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error updating custom price');
    } finally {
      setIsSavingPrice(false);
    }
  };

  const filteredItems = items.filter(it => 
    it.name.toLowerCase().includes(search.toLowerCase()) || 
    it.category.toLowerCase().includes(search.toLowerCase())
  );

  if (!isStockDrawerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Branch Menu & Stock (F9)</h2>
                <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[10px] font-mono">{session?.branchName || 'Current Branch'}</span>
              </div>
              <p className="text-xs text-zinc-400">Manage real-time availability and branch selling prices</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={loadStock}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs transition cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={"w-4 h-4 " + (loading ? 'animate-spin' : '')} />
            </button>
            <button 
              onClick={() => setIsStockDrawerOpen(false)}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-zinc-800">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search items by name or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Item List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading && items.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-xs">Loading items...</div>
          ) : filteredItems.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-xs">No matching products found</div>
          ) : (
            filteredItems.map(item => {
              const hasCustomPrice = item.customPrice && item.customPrice !== item.basePrice;
              const diff = item.customPrice - item.basePrice;

              return (
                <div 
                  key={item.productId}
                  className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate">{item.name}</span>
                        <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[9px] uppercase font-bold shrink-0">{item.category}</span>
                      </div>
                      
                      {/* Price Display: Master Base vs Branch Custom */}
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-zinc-500">Base:</span>
                          <span className="text-[11px] text-zinc-400 font-mono">₹{item.basePrice}</span>
                        </div>
                        <span className="text-zinc-600">•</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-zinc-400 font-medium">Selling:</span>
                          <span className="text-xs text-amber-400 font-mono font-black">₹{item.customPrice || item.basePrice}</span>
                        </div>
                        {hasCustomPrice && (
                          <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                            diff > 0 
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                          }`}>
                            {diff > 0 ? `+₹${diff}` : `-₹${Math.abs(diff)}`}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Edit Price Button */}
                      {canEditPrice && (
                        <button
                          onClick={() => openPriceModal(item)}
                          className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 rounded-xl text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                          title="Edit branch custom price"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Price</span>
                        </button>
                      )}

                      {/* Stock Status Toggle Button */}
                      <button
                        onClick={() => toggleStock(item.productId, item.inStock)}
                        disabled={updatingId === item.productId}
                        className={"px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer " + (
                          item.inStock 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20' 
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
                        )}
                      >
                        {item.inStock ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>IN STOCK</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" />
                            <span>OUT OF STOCK</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Edit Custom Price Modal inside Drawer */}
      {editingItem && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-white text-sm">Edit Branch Selling Price</h3>
              </div>
              <button 
                onClick={() => setEditingItem(null)}
                className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <div className="text-xs font-bold text-white">{editingItem.name}</div>
              <div className="text-[10px] text-zinc-400">Master Base Price: ₹{editingItem.basePrice}</div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-300">
                New Selling Price (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 font-mono font-bold text-xs">
                  ₹
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={modalPrice}
                  onChange={(e) => setModalPrice(Number(e.target.value))}
                  className="w-full pl-7 pr-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl text-white font-mono font-bold text-sm focus:outline-none"
                  placeholder="e.g. 229"
                  autoFocus
                />
              </div>
            </div>

            {/* Quick Pricing Presets */}
            <div className="flex flex-wrap gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setModalPrice(editingItem.basePrice)}
                className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-medium cursor-pointer"
              >
                Base (₹{editingItem.basePrice})
              </button>
              {[10, 20, 30, 50].map(add => (
                <button
                  key={add}
                  type="button"
                  onClick={() => setModalPrice(editingItem.basePrice + add)}
                  className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 rounded text-[10px] font-mono cursor-pointer"
                >
                  +₹{add}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                disabled={isSavingPrice}
                className="px-3 py-1.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePrice}
                disabled={isSavingPrice}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition shadow-md shadow-amber-500/20"
              >
                {isSavingPrice ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save Price</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { usePOSStore } from '../../store/posStore';
import { fetchApi } from '../../lib/api';
import { 
  Boxes, 
  X, 
  Search, 
  CheckCircle2, 
  XCircle, 
  RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';

interface BranchProductStock {
  productId: string;
  name: string;
  category: string;
  inStock: boolean;
  basePrice: number;
}

export const ProductStockDrawer: React.FC = () => {
  const { isStockDrawerOpen, setIsStockDrawerOpen, session } = usePOSStore();
  const [items, setItems] = useState<BranchProductStock[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const branchId = session?.branchId || 'main_branch';

  const loadStock = async () => {
    setLoading(true);
    try {
      const res = await fetchApi('/api/menu/branch/' + branchId + '/management');
      if (res && res.products) {
        setItems(res.products.map((p: any) => ({
          productId: p.id,
          name: p.name,
          category: p.category || 'Pizzas',
          inStock: p.inStock !== false,
          basePrice: p.price || p.basePrice || 0
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

  const filteredItems = items.filter(it => 
    it.name.toLowerCase().includes(search.toLowerCase()) || 
    it.category.toLowerCase().includes(search.toLowerCase())
  );

  if (!isStockDrawerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Branch Quick Stock (F9)</h2>
                <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[10px] font-mono">{session?.branchName || 'Current Branch'}</span>
              </div>
              <p className="text-xs text-zinc-400">Toggle instant item availability across POS & Online Store</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={loadStock}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs transition"
              title="Refresh"
            >
              <RefreshCw className={"w-4 h-4 " + (loading ? 'animate-spin' : '')} />
            </button>
            <button 
              onClick={() => setIsStockDrawerOpen(false)}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

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

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading && items.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-xs">Loading items...</div>
          ) : filteredItems.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-xs">No matching products found</div>
          ) : (
            filteredItems.map(item => (
              <div 
                key={item.productId}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{item.name}</span>
                    <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[9px] uppercase font-bold">{item.category}</span>
                  </div>
                  <span className="text-[11px] text-amber-400 font-mono">₹{item.basePrice}</span>
                </div>

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
            ))
          )}
        </div>
      </div>
    </div>
  );
};
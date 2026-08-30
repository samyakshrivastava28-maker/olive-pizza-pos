import React, { useState } from 'react';
import { POSProduct } from '../../types/pos';
import { Search, Plus, Sparkles, Ban } from 'lucide-react';

interface ProductGridProps {
  products: POSProduct[];
  searchRef?: React.RefObject<HTMLInputElement | null>;
  onSelectProduct: (p: POSProduct) => void;
}

const CATEGORIES = [
  'All Items',
  'Veg Pizzas',
  'Non-Veg Pizzas',
  'Sides & Garlic Bread',
  'Beverages & Shakes',
  'Pastas & Desserts',
  'Combos & Deals'
];

export const ProductGrid: React.FC<ProductGridProps> = ({ products, searchRef, onSelectProduct }) => {
  const [selectedCategory, setSelectedCategory] = useState('All Items');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = products.filter((p) => {
    let matchesCat = selectedCategory === 'All Items';
    if (!matchesCat) {
      const pCat = (p.category || '').toLowerCase();
      const sCat = selectedCategory.toLowerCase();
      if (sCat.includes('veg') && !sCat.includes('non')) {
        matchesCat = p.isVegetarian !== false && pCat.includes('pizza');
      } else if (sCat.includes('non-veg')) {
        matchesCat = p.isVegetarian === false || pCat.includes('non');
      } else if (sCat.includes('side') || sCat.includes('garlic')) {
        matchesCat = pCat.includes('side') || pCat.includes('garlic') || pCat.includes('bread');
      } else if (sCat.includes('beverage') || sCat.includes('shake') || sCat.includes('drink')) {
        matchesCat = pCat.includes('bev') || pCat.includes('drink') || pCat.includes('shake') || pCat.includes('coke');
      } else if (sCat.includes('pasta') || sCat.includes('dessert')) {
        matchesCat = pCat.includes('pasta') || pCat.includes('dessert') || pCat.includes('lava') || pCat.includes('cake');
      } else if (sCat.includes('combo')) {
        matchesCat = pCat.includes('combo') || pCat.includes('deal');
      } else {
        matchesCat = pCat.includes(sCat.slice(0, 4));
      }
    }

    const matchesSearch =
      !searchTerm ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesCat && matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-900 select-none overflow-hidden">
      {/* 1. Fast Search & Big Category Navigation Bar */}
      <div className="p-3.5 border-b border-zinc-800 bg-zinc-950/90 space-y-3 shadow-sm">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            ref={searchRef as any}
            type="text"
            placeholder="Quick search pizza, sides, drinks, or SKU code... (Press F2 to focus)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-12 py-2.5 bg-zinc-900 border border-zinc-700/80 hover:border-zinc-600 focus:border-amber-500 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none transition shadow-inner font-medium"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-400 font-mono rounded">
            F2
          </kbd>
        </div>

        {/* Large Touch Category Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 cursor-pointer shadow-sm ${
                  isSelected
                    ? 'bg-amber-500 text-zinc-950 font-black shadow-amber-500/20 shadow-md ring-2 ring-amber-400/40'
                    : 'bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-800'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Large High-Visibility Product Cards Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-2">
            <span className="text-4xl">🍕</span>
            <p className="text-sm font-bold text-zinc-300">No items match your search or filter</p>
            <p className="text-xs text-zinc-500">Try clearing the search query or select another category</p>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="mt-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 rounded-lg transition"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3.5">
            {filteredProducts.map((p) => {
              const isOutOfStock = p.stockStatus === 'OUT_OF_STOCK' || p.isAvailable === false;
              const isVeg = p.isVegetarian !== false;

              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={isOutOfStock}
                  onClick={() => onSelectProduct(p)}
                  className={`bg-zinc-950 border rounded-2xl p-3 text-left transition flex flex-col justify-between group active:scale-98 shadow-sm relative overflow-hidden cursor-pointer ${
                    isOutOfStock
                      ? 'border-zinc-800 opacity-60 cursor-not-allowed bg-zinc-950/40'
                      : 'border-zinc-800/90 hover:border-amber-500/70 hover:shadow-xl hover:bg-zinc-900/60'
                  }`}
                >
                  <div>
                    {/* Large Product Image with Veg/Non-Veg Badge */}
                    <div className="w-full h-32 rounded-xl bg-zinc-900 border border-zinc-800/80 overflow-hidden mb-2.5 relative flex items-center justify-center">
                      {p.imageUrl || p.image ? (
                        <img
                          src={p.imageUrl || p.image}
                          alt={p.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-zinc-600">
                          <span className="text-4xl">🍕</span>
                        </div>
                      )}

                      {/* Veg / Non-Veg Indicator */}
                      <div className="absolute top-2 left-2 bg-zinc-950/90 backdrop-blur-xs p-1 rounded border border-zinc-800 flex items-center justify-center">
                        <div
                          className={`w-2.5 h-2.5 rounded-xs border ${
                            isVeg ? 'border-emerald-500 bg-emerald-500' : 'border-rose-500 bg-rose-500'
                          }`}
                          title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                        />
                      </div>

                      {/* Physical Only Badge */}
                      {p.isPhysicalOnly && (
                        <span className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-zinc-950/90 text-amber-400 text-[9px] font-bold rounded border border-amber-500/30">
                          Dine-In Special
                        </span>
                      )}

                      {/* Plus Quick Action Icon */}
                      {!isOutOfStock && (
                        <div className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-amber-500 text-zinc-950 flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg">
                          <Plus className="w-4 h-4 stroke-[3]" />
                        </div>
                      )}

                      {/* Out of Stock Overlay */}
                      {isOutOfStock && (
                        <div className="absolute inset-0 bg-black/75 backdrop-blur-2xs flex flex-col items-center justify-center text-center p-2">
                          <Ban className="w-6 h-6 text-rose-500 mb-1" />
                          <span className="text-[10px] font-black tracking-wider uppercase text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
                            OUT OF STOCK
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Product Name & Description */}
                    <h3 className="font-black text-sm text-zinc-100 group-hover:text-white line-clamp-1 leading-snug">
                      {p.name}
                    </h3>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5 leading-tight">
                      {p.description || p.category}
                    </p>
                  </div>

                  {/* Pricing and Customization Trigger */}
                  <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-zinc-500 block uppercase font-bold">Price</span>
                      <span className="font-mono font-black text-amber-400 text-base">
                        ₹{p.price || p.basePrice || 249}
                      </span>
                    </div>

                    {!isOutOfStock && (
                      <span className="text-[11px] font-bold text-zinc-400 group-hover:text-amber-400 flex items-center gap-0.5 transition">
                        Customize →
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { POSProduct, POSCartItemAddon } from '../../types/pos';
import { X, Plus, Minus, Check, Sparkles } from 'lucide-react';

interface CustomizationModalProps {
  product: POSProduct;
  onClose: () => void;
  onAdd: (item: {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    size: string;
    crust: string;
    addons: POSCartItemAddon[];
    kitchenNotes?: string;
  }) => void;
}

const DEFAULT_SIZES = [
  { name: '8" Regular', price: 0 },
  { name: '10" Medium', price: 90 },
  { name: '12" Large', price: 180 },
];

const DEFAULT_CRUSTS = [
  { name: 'Classic Hand-Tossed', price: 0 },
  { name: 'Thin & Crispy', price: 40 },
  { name: 'Cheese Burst', price: 80 },
];

const DEFAULT_ADDONS: POSCartItemAddon[] = [
  { id: 'extra_cheese', name: 'Extra Mozzarella Cheese', price: 60 },
  { id: 'paneer', name: 'Fresh Paneer Cubes', price: 50 },
  { id: 'olives', name: 'Sliced Black Olives', price: 40 },
  { id: 'mushrooms', name: 'Grilled Mushrooms', price: 40 },
  { id: 'jalapenos', name: 'Pickled Jalapenos', price: 30 },
  { id: 'capsicum', name: 'Crispy Capsicum', price: 30 },
];

const QUICK_INSTRUCTION_CHIPS = [
  'No Onion',
  'No Capsicum',
  'Less Spicy',
  'Extra Spicy',
  'Extra Sauce',
  'Crispy Well-Done',
  'Cut into 6 Slices',
  'Cut into 8 Slices',
];

export const CustomizationModal: React.FC<CustomizationModalProps> = ({ product, onClose, onAdd }) => {
  const isPizza = product.category.toLowerCase().includes('pizza') || !product.category;
  
  const [selectedSize, setSelectedSize] = useState(DEFAULT_SIZES[1]); // Default 10" Medium
  const [selectedCrust, setSelectedCrust] = useState(DEFAULT_CRUSTS[0]);
  const [selectedAddons, setSelectedAddons] = useState<POSCartItemAddon[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [kitchenNotes, setKitchenNotes] = useState('');

  const toggleAddon = (addon: POSCartItemAddon) => {
    if (selectedAddons.some((a) => a.id === addon.id)) {
      setSelectedAddons(selectedAddons.filter((a) => a.id !== addon.id));
    } else {
      setSelectedAddons([...selectedAddons, addon]);
    }
  };

  const toggleChip = (chip: string) => {
    if (kitchenNotes.includes(chip)) {
      setKitchenNotes(kitchenNotes.replace(chip, '').replace(/,\s*,/g, ',').replace(/^,\s*|\s*,$/g, '').trim());
    } else {
      setKitchenNotes(kitchenNotes ? `${kitchenNotes}, ${chip}` : chip);
    }
  };

  const basePrice = product.price || product.basePrice || 229;
  const addonsTotal = selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const itemUnitPrice = isPizza
    ? basePrice + selectedSize.price + selectedCrust.price + addonsTotal
    : basePrice + addonsTotal;
  const itemFinalTotal = itemUnitPrice * quantity;

  const handleConfirm = () => {
    onAdd({
      productId: product.id,
      name: product.name,
      price: isPizza ? basePrice + selectedSize.price + selectedCrust.price : basePrice,
      quantity,
      size: isPizza ? selectedSize.name.split(' ')[0] : 'Standard',
      crust: isPizza ? selectedCrust.name : 'Standard',
      addons: selectedAddons,
      kitchenNotes: kitchenNotes.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>{product.name}</span>
              <span className="text-xs font-mono font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30">
                Base ₹{basePrice}
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">Customize size, crust, toppings & kitchen notes</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Pizza Size */}
          {isPizza && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-2">
                1. Select Size
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {DEFAULT_SIZES.map((sz) => {
                  const isSelected = selectedSize.name === sz.name;
                  return (
                    <button
                      key={sz.name}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      className={`p-3 rounded-xl border text-left transition relative active:scale-95 ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500 text-white ring-1 ring-amber-500/40'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50'
                      }`}
                    >
                      <div className="font-bold text-sm">{sz.name}</div>
                      <div className="text-xs text-amber-400 font-mono mt-1">
                        {sz.price > 0 ? `+₹${sz.price}` : 'Included'}
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pizza Crust */}
          {isPizza && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-2">
                2. Select Crust
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {DEFAULT_CRUSTS.map((cr) => {
                  const isSelected = selectedCrust.name === cr.name;
                  return (
                    <button
                      key={cr.name}
                      type="button"
                      onClick={() => setSelectedCrust(cr)}
                      className={`p-3 rounded-xl border text-left transition relative active:scale-95 ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500 text-white ring-1 ring-amber-500/40'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50'
                      }`}
                    >
                      <div className="font-bold text-xs">{cr.name}</div>
                      <div className="text-xs text-amber-400 font-mono mt-1">
                        {cr.price > 0 ? `+₹${cr.price}` : 'Included'}
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Extra Addons */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-2">
              {isPizza ? '3. Extra Toppings & Cheese' : 'Add-ons & Extras'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {DEFAULT_ADDONS.map((ad) => {
                const isSelected = selectedAddons.some((a) => a.id === ad.id);
                return (
                  <button
                    key={ad.id}
                    type="button"
                    onClick={() => toggleAddon(ad)}
                    className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition active:scale-95 ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500 text-white ring-1 ring-emerald-500/40'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/40'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-medium text-zinc-200">{ad.name}</div>
                      <div className="text-[11px] text-emerald-400 font-mono font-bold">+₹{ad.price}</div>
                    </div>
                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                      isSelected
                        ? 'bg-emerald-500 border-emerald-500 text-zinc-950'
                        : 'border-zinc-700 bg-zinc-900'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Kitchen Instructions */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-2">
              Special Kitchen Instructions
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {QUICK_INSTRUCTION_CHIPS.map((chip) => {
                const isSelected = kitchenNotes.includes(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleChip(chip)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition active:scale-95 ${
                      isSelected
                        ? 'bg-amber-500 text-zinc-950 border-amber-500 font-bold'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              placeholder="e.g. Less spicy, crispy base, extra oregano..."
              value={kitchenNotes}
              onChange={(e) => setKitchenNotes(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between">
          {/* Quantity Controls */}
          <div className="flex items-center gap-3 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 flex items-center justify-center transition active:scale-90"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono font-bold text-base text-white w-6 text-center">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity(quantity + 1)}
              className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 flex items-center justify-center transition active:scale-90"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add to Bill Button */}
          <button
            type="button"
            onClick={handleConfirm}
            className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition active:scale-95"
          >
            <span>Add to Current Bill</span>
            <span className="font-mono text-base border-l border-zinc-950/20 pl-3">₹{itemFinalTotal}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

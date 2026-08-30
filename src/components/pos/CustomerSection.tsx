import React, { useState, useEffect, useRef } from 'react';
import { usePOSStore } from '../../store/posStore';
import { fetchPOSApi } from '../../lib/api';
import { 
  Phone, 
  User, 
  CheckCircle2, 
  UserCheck, 
  UserPlus, 
  Edit3, 
  Loader2, 
  X, 
  Save, 
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

export const CustomerSection: React.FC = () => {
  const {
    customerId,
    customerName,
    customerPhone,
    isWalkinCustomer,
    customerLookupState,
    customerProfile,
    isEditingCustomerName,
    setCustomer,
    setCustomerId,
    setIsWalkinCustomer,
    setCustomerLookupState,
    setCustomerProfile,
    setIsEditingCustomerName
  } = usePOSStore();

  const [inputPhone, setInputPhone] = useState(customerPhone);
  const [newNameInput, setNewNameInput] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const debounceTimer = useRef<any>(null);

  // Sync internal state when store changes (e.g. after reset)
  useEffect(() => {
    setInputPhone(customerPhone);
    if (!customerPhone && !customerName) {
      setNewNameInput('');
    }
  }, [customerPhone, customerName]);

  // Handle phone input with automatic 10-digit Indian number lookup
  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const clean = raw.replace(/\D/g, '').slice(0, 10);
    setInputPhone(clean);

    if (clean.length < 10) {
      setCustomer({ phone: clean, name: '', id: null });
      setCustomerLookupState('IDLE');
      setCustomerProfile(null);
      setIsEditingCustomerName(false);
      return;
    }

    if (clean.length === 10) {
      triggerCustomerLookup(clean);
    }
  };

  const triggerCustomerLookup = async (phoneToLookup: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    setCustomerLookupState('SEARCHING');
    try {
      const res = await fetchPOSApi(`/api/pos/customers/lookup?phone=${phoneToLookup}`);
      const data = await res.json();

      if (res.ok && data.success && data.found && data.customer) {
        setCustomerId(data.customer.id);
        setCustomer({
          id: data.customer.id,
          phone: phoneToLookup,
          name: data.customer.name || 'Olive Pizza Customer'
        });
        setCustomerProfile(data.customer);
        setCustomerLookupState('FOUND');
        setIsEditingCustomerName(false);
        toast.success(`✓ Found customer: ${data.customer.name}`, { duration: 3000 });
      } else {
        setCustomerId(null);
        setCustomer({ phone: phoneToLookup, name: '', id: null });
        setCustomerProfile(null);
        setCustomerLookupState('NOT_FOUND');
        setNewNameInput('');
      }
    } catch (err: any) {
      console.warn('[CustomerLookup] Lookup notice:', err.message);
      setCustomerLookupState('NOT_FOUND');
    }
  };

  // Save new customer profile to canonical database
  const handleSaveNewCustomer = async () => {
    if (!newNameInput.trim()) {
      toast.error('Please enter customer full name');
      return;
    }

    if (inputPhone.length !== 10) {
      toast.error('Valid 10-digit mobile number required');
      return;
    }

    setSavingCustomer(true);
    const toastId = toast.loading('Saving customer to Olive Pizza database...');

    try {
      const res = await fetchPOSApi('/api/pos/customers/save', {
        method: 'POST',
        body: JSON.stringify({
          phone: inputPhone,
          name: newNameInput.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success && data.customer) {
        setCustomerId(data.customer.id);
        setCustomer({
          id: data.customer.id,
          phone: inputPhone,
          name: data.customer.name
        });
        setCustomerProfile({
          id: data.customer.id,
          name: data.customer.name,
          phone: inputPhone,
          isPOSCustomer: true
        });
        setCustomerLookupState('FOUND');
        setIsEditingCustomerName(false);
        toast.success(`✓ Customer ${data.customer.name} saved permanently!`, { id: toastId });
      } else {
        throw new Error(data.error || 'Failed to save customer profile');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving customer', { id: toastId });
    } finally {
      setSavingCustomer(false);
    }
  };

  // Update existing customer name in canonical database
  const handleUpdateCustomerName = async () => {
    if (!newNameInput.trim() || !customerId) return;

    setSavingCustomer(true);
    const toastId = toast.loading('Updating customer profile...');

    try {
      const res = await fetchPOSApi('/api/pos/customers/update-name', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          name: newNameInput.trim(),
          phone: inputPhone
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCustomer({ name: newNameInput.trim() });
        if (customerProfile) {
          setCustomerProfile({ ...customerProfile, name: newNameInput.trim() });
        }
        setIsEditingCustomerName(false);
        toast.success('✓ Customer name updated permanently', { id: toastId });
      } else {
        throw new Error(data.error || 'Update failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not update name', { id: toastId });
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleClear = () => {
    setInputPhone('');
    setNewNameInput('');
    setCustomer({ phone: '', name: '', id: null });
    setCustomerId(null);
    setCustomerLookupState('IDLE');
    setCustomerProfile(null);
    setIsEditingCustomerName(false);
  };

  return (
    <div className="p-3.5 border-b border-zinc-800 bg-zinc-900/40 space-y-3">
      {/* Top Customer Mode Switcher */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-amber-400" />
          Customer Identity
        </span>

        <div className="flex items-center gap-1 p-0.5 bg-zinc-950 rounded-lg border border-zinc-800 text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setIsWalkinCustomer(false)}
            className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
              !isWalkinCustomer
                ? 'bg-amber-500 text-zinc-950 font-black shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Phone / Profile
          </button>
          <button
            type="button"
            onClick={() => setIsWalkinCustomer(true)}
            className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
              isWalkinCustomer
                ? 'bg-amber-500 text-zinc-950 font-black shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Walk-in
          </button>
        </div>
      </div>

      {/* WALK-IN MODE */}
      {isWalkinCustomer ? (
        <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800 flex items-center justify-between text-xs animate-in fade-in duration-100">
          <div className="flex items-center gap-2 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <div>
              <strong className="text-white font-bold block">Walk-in Customer</strong>
              <span className="text-[10px] text-zinc-500">Anonymous counter order • No profile recorded</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsWalkinCustomer(false)}
            className="text-[10px] text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
          >
            Enter Phone
          </button>
        </div>
      ) : (
        /* PHONE & CUSTOMER PROFILE MODE */
        <div className="space-y-2.5">
          {/* Phone Input Box */}
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-zinc-400 font-mono text-xs font-bold pointer-events-none">
              <Phone className="w-3.5 h-3.5 text-amber-400" />
              <span>+91</span>
            </div>

            <input
              type="tel"
              inputMode="numeric"
              placeholder="10-digit mobile number..."
              maxLength={10}
              value={inputPhone}
              onChange={handlePhoneInputChange}
              className="w-full pl-16 pr-9 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl text-sm font-mono font-bold text-white placeholder-zinc-600 focus:outline-none transition shadow-inner"
            />

            {inputPhone.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-white rounded-md transition cursor-pointer"
                title="Clear Phone"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* STATE 1: SEARCHING */}
          {customerLookupState === 'SEARCHING' && (
            <div className="p-2.5 bg-zinc-950 rounded-xl border border-zinc-800/80 flex items-center gap-2 text-xs text-amber-400 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span>Searching Olive Pizza customer database...</span>
            </div>
          )}

          {/* STATE 2: EXISTING CUSTOMER FOUND */}
          {customerLookupState === 'FOUND' && (
            <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl space-y-2 animate-in fade-in duration-150">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-sm font-bold text-white tracking-tight">
                      {customerName || 'Registered Customer'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-emerald-400/90 font-mono mt-0.5">
                    <span>+91 {inputPhone}</span>
                    <span>•</span>
                    <span className="bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 font-bold uppercase">
                      {customerProfile?.isOnlineCustomer ? 'ONLINE & POS CUSTOMER' : 'OLIVE PIZZA CUSTOMER'}
                    </span>
                  </div>
                </div>

                {!isEditingCustomerName && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewNameInput(customerName);
                      setIsEditingCustomerName(true);
                    }}
                    className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                    title="Edit Name"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* In-Place Name Editor if cashier clicks Edit */}
              {isEditingCustomerName && (
                <div className="pt-2 border-t border-emerald-500/20 flex items-center gap-2">
                  <input
                    type="text"
                    value={newNameInput}
                    onChange={(e) => setNewNameInput(e.target.value)}
                    placeholder="Updated Name..."
                    className="flex-1 px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleUpdateCustomerName}
                    disabled={savingCustomer || !newNameInput.trim()}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                  >
                    {savingCustomer ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingCustomerName(false)}
                    className="p-1.5 text-zinc-400 hover:text-white rounded-lg text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STATE 3: NEW CUSTOMER (NOT FOUND) */}
          {customerLookupState === 'NOT_FOUND' && inputPhone.length === 10 && (
            <div className="p-3 bg-zinc-950 border border-purple-500/30 rounded-xl space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center gap-1.5 text-xs text-purple-400 font-bold">
                <UserPlus className="w-4 h-4" />
                <span>New Customer (+91 {inputPhone})</span>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Customer Full Name (e.g. Rahul Sharma)..."
                  value={newNameInput}
                  onChange={(e) => setNewNameInput(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-purple-500 rounded-xl text-xs font-bold text-white placeholder-zinc-500 focus:outline-none transition"
                  autoFocus
                />

                <button
                  type="button"
                  onClick={handleSaveNewCustomer}
                  disabled={savingCustomer || !newNameInput.trim()}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-purple-600/20 disabled:opacity-40 cursor-pointer"
                >
                  {savingCustomer ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save & Link Customer Profile</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

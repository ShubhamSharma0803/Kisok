import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { setNarrationContext } from '../core/screenNarration';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../core/SessionContext';
import { useHandoff } from '../core/HandoffProvider';
import { useSessionSocket } from '../core/useSessionSocket';
import { getMenu, getOrder, addOrderItem, updateOrderItemQuantity, deleteOrderItem, triggerScreenNarration } from '../core/api';
import CartSummary from './CartSummary';
import {
  Coffee,
  Utensils,
  IceCream,
  Grid,
  Plus,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  ShoppingBag,
  Volume2,
  ChevronUp,
} from 'lucide-react';

function MenuItemImage({ src, alt }) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div className="w-full h-44 rounded-2xl bg-slate-100 border-2 border-slate-200 flex flex-col items-center justify-center text-slate-500 space-y-1">
        <Utensils className="w-12 h-12 text-slate-600" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Freshly Prepared</span>
      </div>
    );
  }

  return (
    <div className="w-full h-44 rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-100 relative">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setHasError(true)}
        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-200"
      />
    </div>
  );
}

// Category icon mapper helper
const CATEGORY_ICONS = {
  all: Grid,
  drinks: Coffee,
  food: Utensils,
  dessert: IceCream,
};

export default function OrdersScreen({ onReviewOrder, onBackToStart }) {
  const navigate = useNavigate();
  const { sessionId, sessionMode, initSession } = useSession();
  const { reportFailedTap } = useHandoff();
  const { subscribe } = useSessionSocket(sessionId);

  const handleBack = () => {
    if (onBackToStart) onBackToStart();
    else navigate('/');
  };

  const handleReview = () => {
    if (onReviewOrder) onReviewOrder();
    else navigate('/order');
  };

  const [menu, setMenu] = useState([]);
  const [order, setOrder] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  const [nonInteractiveTapCount, setNonInteractiveTapCount] = useState(0);

  // Modifier picker modal state
  const [modifierItem, setModifierItem] = useState(null);
  const [selectedModifiers, setSelectedModifiers] = useState([]);

  // Mobile bottom-sheet cart toggle
  const [showMobileCart, setShowMobileCart] = useState(false);

  // 1. Initial Data Fetching (Menu + Order)
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const newSession = await initSession();
        currentSessionId = newSession?.id;
      }

      const menuData = await getMenu();

console.log("MENU DATA FROM BACKEND:", menuData);

setMenu(Array.isArray(menuData) ? menuData : []);

      if (currentSessionId) {
        const orderData = await getOrder(currentSessionId);
        setOrder(orderData);
      }
      setIsLoading(false);
    } catch (err) {
      console.error('[OrdersScreen] Failed to load menu or order:', err);
      setError('Unable to load menu right now. Please check server connection.');
      setIsLoading(false);
    }
  }, [sessionId, initSession]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 2. Real-time WebSocket listener for order_updated event (e.g. from voice ordering)
  useEffect(() => {
    if (!sessionId) return;

    const unsubscribe = subscribe('order_updated', (updatedOrderPayload) => {
      console.log('[OrdersScreen] Received order_updated WebSocket event:', updatedOrderPayload);
      setOrder(updatedOrderPayload);
    });

    return () => {
      unsubscribe();
    };
  }, [sessionId, subscribe]);

  // Derive categories list from fetched menu items
  const categories = useMemo(() => {
    const unique = Array.from(new Set(menu.map((item) => item.category).filter(Boolean)));
    return ['all', ...unique];
  }, [menu]);

  // Filter menu items by selected category
  const filteredMenuItems = useMemo(() => {
    if (selectedCategory === 'all') return menu;
    return menu.filter((item) => item.category === selectedCategory);
  }, [menu, selectedCategory]);

  useEffect(() => {
    setNarrationContext({ category: selectedCategory, count: filteredMenuItems.length });
  }, [selectedCategory, filteredMenuItems.length]);

  const narratedRef = useRef(false);
  useEffect(() => {
    if (sessionId && sessionMode === 'voice_first' && !isLoading && !narratedRef.current) {
      narratedRef.current = true;
      triggerScreenNarration(sessionId, 'menu', { category: selectedCategory, count: filteredMenuItems.length });
    }
  }, [sessionId, sessionMode, isLoading, selectedCategory, filteredMenuItems.length]);

  // Handle Add Item action
  const handleAddItemClick = (item) => {
    // Check if item has modifier options
    if (item.available_modifiers) {
      const modifierList = item.available_modifiers
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);

      if (modifierList.length > 0) {
        setModifierItem({ ...item, parsedModifiers: modifierList });
        setSelectedModifiers([]);
        return;
      }
    }

    // Direct add if no modifiers required
    executeAddItem(item.id, 1, null);
  };

  // Dispatch API call to add item
  const executeAddItem = async (menuItemId, quantity = 1, modifiers = null) => {
    if (!sessionId) return;
    setIsUpdatingOrder(true);
    try {
      const updatedOrder = await addOrderItem(sessionId, menuItemId, quantity, modifiers);
      setOrder(updatedOrder);
      setModifierItem(null);
      setSelectedModifiers([]);
    } catch (err) {
      console.error('[OrdersScreen] Failed to add item to order:', err);
      if (reportFailedTap) reportFailedTap();
      alert('Could not add item to order. Please try again.');
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  // Quantity adjustment from CartSummary using PATCH and DELETE endpoints
  const handleUpdateQuantity = async (item, newQuantity) => {
    if (!sessionId || !item?.id) return;
    setIsUpdatingOrder(true);
    try {
      let updatedOrder;
      if (newQuantity <= 0) {
        updatedOrder = await deleteOrderItem(sessionId, item.id);
      } else {
        updatedOrder = await updateOrderItemQuantity(sessionId, item.id, newQuantity);
      }
      setOrder(updatedOrder);
    } catch (err) {
      console.error('[OrdersScreen] Failed to update item quantity:', err);
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  // Toggle modifier selection
  const toggleModifier = (mod) => {
    setSelectedModifiers((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
    );
  };

  const handleConfirmModifiers = () => {
    if (!modifierItem) return;
    const modifierString = selectedModifiers.length > 0 ? selectedModifiers.join(', ') : null;
    executeAddItem(modifierItem.id, 1, modifierString);
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 flex flex-col md:flex-row overflow-hidden">
      {/* LEFT SECTION (~65-70% width): Category Rail + Menu Grid */}
      <section className="flex-1 flex flex-col h-screen overflow-hidden border-r-4 border-slate-300">
        {/* Header Bar */}
        <header className="bg-white border-b-4 border-slate-300 p-4 md:px-8 md:py-6 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleBack}
              className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-950 font-extrabold text-lg focus:outline-none focus:ring-4 focus:ring-slate-950 min-h-touch transition-all"
              aria-label="Back to Session Start"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-slate-950 tracking-tight">
                Select Your Items
              </h1>
              <p className="text-lg text-slate-700 font-medium">
                Tap items to add them to your order. Voice ordering is active.
              </p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-3 px-4 py-2 rounded-xl bg-sky-100 border-2 border-sky-400 text-sky-900 text-base font-bold">
            <Volume2 className="w-6 h-6 text-sky-700 animate-pulse" />
            <span>Voice Ready — Speak Anytime</span>
          </div>
        </header>

        {/* Loading State */}
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
            <RefreshCw className="w-16 h-16 text-sky-700 animate-spin" />
            <p className="text-3xl font-extrabold text-slate-900">Loading Menu...</p>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-xl w-full p-8 rounded-3xl bg-red-50 border-4 border-red-600 text-center space-y-6 shadow-xl">
              <AlertCircle className="w-16 h-16 text-red-600 mx-auto" />
              <h2 className="text-3xl font-black text-red-950">Failed to Load Menu</h2>
              <p className="text-xl font-semibold text-slate-800">{error}</p>
              <button
                type="button"
                onClick={fetchData}
                className="px-8 min-h-touch text-2xl font-black bg-red-700 hover:bg-red-800 text-white rounded-2xl focus:outline-none focus:ring-4 focus:ring-red-900 min-h-touch"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Category Rail + Menu Grid Container */}
        {!isLoading && !error && (
          <div className="flex-1 flex overflow-hidden">
            {/* Category Rail (Far Left) */}
            <nav
              className="w-36 md:w-48 bg-white border-r-4 border-slate-300 p-3 space-y-3 overflow-y-auto shrink-0"
              aria-label="Menu Categories"
            >
              {categories.map((cat) => {
                const IconComponent = CATEGORY_ICONS[cat.toLowerCase()] || Utensils;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`
                      w-full flex flex-col md:flex-row items-center gap-3 p-3 md:p-4 rounded-2xl
                      font-black text-lg md:text-xl capitalize transition-all duration-150
                      min-h-touch focus:outline-none focus:ring-4 focus:ring-slate-950 focus:ring-offset-2
                      ${
                        isSelected
                          ? 'bg-slate-950 text-white border-4 border-slate-950 shadow-md'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-2 border-slate-300'
                      }
                    `}
                    aria-current={isSelected ? 'page' : undefined}
                  >
                    <IconComponent className={`w-7 h-7 ${isSelected ? 'text-sky-400' : 'text-slate-700'}`} strokeWidth={2.5} />
                    <span className="truncate">{cat}</span>
                  </button>
                );
              })}
            </nav>

            {/* Menu Items Grid (Center Left) */}
            <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredMenuItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between bg-white rounded-3xl border-4 border-slate-300 hover:border-slate-800 shadow-md p-6 space-y-4 transition-all"
                  >
                    {/* Food Image */}
                    <MenuItemImage src={item.image_url} alt={item.name} />

                    {/* Item Details */}
                    <div className="space-y-1">
                      <h3 className="text-2xl font-black text-slate-950 leading-tight">
                        {item.name}
                      </h3>
                      {item.name_hi && (
                        <p className="text-lg font-bold text-slate-600">
                          {item.name_hi}
                        </p>
                      )}
                      <p className="text-2xl font-black text-emerald-700 pt-1">
                        ₹{item.price}
                      </p>
                    </div>

                    {/* Prominent Large Add Button */}
                    <button
                      type="button"
                      onClick={() => handleAddItemClick(item)}
                      disabled={isUpdatingOrder}
                      className="w-full flex items-center justify-center gap-3 px-6 min-h-touch text-xl font-black bg-slate-900 hover:bg-slate-800 text-white rounded-2xl focus:outline-none focus:ring-4 focus:ring-slate-950 focus:ring-offset-2 active:scale-[0.98] shadow-md transition-all disabled:opacity-50"
                      aria-label={`Add ${item.name} to order for ${item.price} rupees`}
                    >
                      <Plus className="w-6 h-6 stroke-[3]" />
                      <span>Add to Order</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* CART IS NOW SHOWN FROM THE BOTTOM */}
    {order?.items?.length > 0 && (
  <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">

    <button
      type="button"
      onClick={() => setShowMobileCart(!showMobileCart)}
      className="pointer-events-auto mx-auto mb-3 w-[90%] max-w-xl p-4 bg-slate-950 text-white rounded-2xl flex items-center justify-between font-black text-lg shadow-2xl border-2 border-slate-700"
    >
      <div className="flex items-center gap-3">
        <ShoppingBag className="w-7 h-7 text-sky-400" />
        <span>
          View Cart • {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-emerald-400">
          ₹{order?.total || 0}
        </span>

        <ChevronUp
          className={`w-7 h-7 transition-transform ${
            showMobileCart ? 'rotate-180' : ''
          }`}
        />
      </div>
    </button>

    {showMobileCart && (
  <div className="pointer-events-auto fixed bottom-[72px] left-0 right-0 z-50 max-h-[65vh] overflow-y-auto bg-white rounded-t-3xl shadow-2xl border-4 border-slate-300">
        <CartSummary
          order={order}
          onUpdateQuantity={handleUpdateQuantity}
          onReviewOrder={handleReview}
          isUpdating={isUpdatingOrder}
        />
      </div>
    )}

  </div>
)}


      {/* MODIFIER PICKER MODAL */}
      {modifierItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modifier-title"
        >
          <div className="bg-white rounded-3xl border-4 border-slate-950 max-w-lg w-full p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b-2 border-slate-200 pb-4">
              <div>
                <span className="px-3 py-1 rounded-md bg-sky-100 text-sky-900 text-sm font-black uppercase">Customize</span>
                <h2 id="modifier-title" className="text-3xl font-black text-slate-950 mt-1">
                  {modifierItem.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModifierItem(null)}
                className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-slate-950 min-h-touch"
                aria-label="Close modifier picker"
              >
                <X className="w-7 h-7" />
              </button>
            </div>

            <p className="text-xl font-bold text-slate-800">
              Select optional modifiers below:
            </p>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {modifierItem.parsedModifiers.map((mod) => {
                const isSelected = selectedModifiers.includes(mod);
                return (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => toggleModifier(mod)}
                    className={`
                      w-full flex items-center justify-between p-4 rounded-2xl border-4 text-xl font-black text-left
                      min-h-touch focus:outline-none focus:ring-4 focus:ring-slate-950 transition-all
                      ${
                        isSelected
                          ? 'bg-sky-50 border-sky-600 text-sky-950'
                          : 'bg-slate-50 border-slate-300 text-slate-800 hover:border-slate-400'
                      }
                    `}
                  >
                    <span className="capitalize">{mod}</span>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border-2 ${isSelected ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-400 bg-white'}`}>
                      {isSelected && <Check className="w-6 h-6 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-4 border-t-2 border-slate-200 flex gap-4">
              <button
                type="button"
                onClick={() => setModifierItem(null)}
                className="flex-1 min-h-touch text-xl font-extrabold bg-slate-200 hover:bg-slate-300 text-slate-900 rounded-2xl focus:outline-none focus:ring-4 focus:ring-slate-950"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmModifiers}
                className="flex-1 min-h-touch text-xl font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-600 shadow-lg"
              >
                Confirm Add
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

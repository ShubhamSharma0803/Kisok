import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { setNarrationContext } from '../core/screenNarration';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../core/SessionContext';
import { useHandoff } from '../core/HandoffProvider';
import { useSessionSocket } from '../core/useSessionSocket';
import { getMenu, getOrder, addOrderItem, updateOrderItemQuantity, deleteOrderItem, triggerScreenNarration } from '../core/api';
import CartSummary from './CartSummary';
import {
  ArrowLeft,
  ChefHat,
  Coffee,
  Grid,
  IceCream,
  Leaf,
  Plus,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  ShoppingBag,
  Sparkles,
  Utensils,
  Volume2,
  ChevronUp,
} from 'lucide-react';

const FALLBACK_IMAGES = {
  all: 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=900&q=80',
  drinks: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=80',
  food: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=80',
  dessert: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=80',
};

const CATEGORY_ICONS = {
  all: Grid,
  drinks: Coffee,
  food: Utensils,
  dessert: IceCream,
};

const formatPrice = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

function MenuItemImage({ src, alt, category }) {
  const [hasError, setHasError] = useState(false);
  const imageSrc = hasError || !src ? FALLBACK_IMAGES[category] || FALLBACK_IMAGES.food : src;

  return (
    <div className="relative w-full aspect-[1.18] overflow-hidden bg-[#f0e6d8]">
      <img
        src={imageSrc}
        alt={alt}
        loading="lazy"
        onError={() => setHasError(true)}
        className="h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#160f0a]/55 via-[#160f0a]/5 to-transparent" />
      <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#7b4a2f] shadow-sm backdrop-blur">
        <Sparkles className="h-3 w-3" />
        Fresh
      </div>
    </div>
  );
}

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
    else navigate('/review');
  };

  const [menu, setMenu] = useState([]);
  const [order, setOrder] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  const [modifierItem, setModifierItem] = useState(null);
  const [selectedModifiers, setSelectedModifiers] = useState([]);
  const [showMobileCart, setShowMobileCart] = useState(false);

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

  useEffect(() => {
    if (!sessionId) return;

    const unsubscribe = subscribe('order_updated', (updatedOrderPayload) => {
      setOrder(updatedOrderPayload);
    });

    return () => {
      unsubscribe();
    };
  }, [sessionId, subscribe]);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(menu.map((item) => item.category).filter(Boolean)));
    return ['all', ...unique];
  }, [menu]);

  const filteredMenuItems = useMemo(() => {
    if (selectedCategory === 'all') return menu;
    return menu.filter((item) => item.category === selectedCategory);
  }, [menu, selectedCategory]);

  const featuredItem = filteredMenuItems[0] || menu[0];

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

  const handleAddItemClick = (item) => {
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

    executeAddItem(item.id, 1, null);
  };

  const executeAddItem = async (menuItemId, quantity = 1, modifiers = null) => {
    if (!sessionId) return;
    setIsUpdatingOrder(true);
    try {
      const updatedOrder = await addOrderItem(sessionId, menuItemId, quantity, modifiers);
      setOrder(updatedOrder);
      setModifierItem(null);
      setSelectedModifiers([]);
      setShowMobileCart(true);
    } catch (err) {
      console.error('[OrdersScreen] Failed to add item to order:', err);
      if (reportFailedTap) reportFailedTap();
      alert('Could not add item to order. Please try again.');
    } finally {
      setIsUpdatingOrder(false);
    }
  };

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
    <main className="premium-shell min-h-screen overflow-hidden text-[#211b17]">
      <div className="flex h-screen">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-[#e7dccd] bg-[#fffaf3]/95 px-5 py-4 shadow-[0_10px_30px_rgba(58,39,24,.06)] backdrop-blur md:px-8">
            <div className="flex items-center justify-between gap-5">
              <div className="flex min-w-0 items-center gap-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d7c7b4] bg-white text-[#3a2c22] shadow-sm transition hover:bg-[#f5eadc] active:scale-95 focus:outline-none focus:ring-4 focus:ring-[#b66b3c]/25"
                  aria-label="Back to session start"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#a76538]">The Kiosk Kitchen</p>
                  <h1 className="font-display text-3xl font-semibold leading-none text-[#231a15] md:text-5xl">
                    Premium dining menu
                  </h1>
                </div>
              </div>

              <div className="hidden items-center gap-3 rounded-full border border-[#e7dccd] bg-white px-4 py-2.5 shadow-sm lg:flex">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#21382f] text-[#e9bd67]">
                  <Volume2 className="h-4 w-4" />
                </div>
                <div className="leading-tight">
                  <p className="text-sm font-bold text-[#2b241f]">Voice ordering</p>
                  <p className="text-xs font-medium text-[#928274]">Ready at your table</p>
                </div>
              </div>
            </div>
          </header>

          {isLoading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#f7efe5] p-12 text-center">
              <RefreshCw className="h-14 w-14 animate-spin text-[#9b5933]" />
              <p className="font-display text-4xl font-semibold text-[#241a14]">Preparing the menu</p>
              <p className="text-base font-medium text-[#817166]">Fresh dishes are loading now.</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="flex flex-1 items-center justify-center bg-[#f7efe5] p-8">
              <div className="w-full max-w-xl rounded-[1.75rem] border border-red-200 bg-white p-8 text-center shadow-xl">
                <AlertCircle className="mx-auto h-14 w-14 text-red-600" />
                <h2 className="mt-4 font-display text-4xl font-semibold text-red-950">Menu unavailable</h2>
                <p className="mt-3 text-base font-medium text-[#67594f]">{error}</p>
                <button
                  type="button"
                  onClick={fetchData}
                  className="mt-6 min-h-touch rounded-full bg-[#21382f] px-8 text-base font-bold text-white shadow-lg transition hover:bg-[#172a22] focus:outline-none focus:ring-4 focus:ring-[#21382f]/25"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!isLoading && !error && (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <nav
                className="premium-scroll w-24 shrink-0 overflow-y-auto border-r border-[#e7dccd] bg-[#f7efe5] px-3 py-5 md:w-56 md:px-5"
                aria-label="Menu categories"
              >
                <div className="hidden px-2 pb-5 md:block">
                  <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-[#a76538]">Menu</p>
                  <p className="mt-1 text-xs font-medium text-[#8c7d70]">Select a course</p>
                </div>

                <div className="space-y-2">
                  {categories.map((cat) => {
                    const IconComponent = CATEGORY_ICONS[cat.toLowerCase()] || ChefHat;
                    const isSelected = selectedCategory === cat;

                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`group flex w-full flex-col items-center gap-2 rounded-[1.35rem] px-2 py-3 text-center text-xs font-bold capitalize transition md:flex-row md:px-4 md:py-4 md:text-left md:text-sm ${
                          isSelected
                            ? 'bg-[#1f352d] text-white shadow-[0_14px_28px_rgba(31,53,45,.22)]'
                            : 'text-[#67594f] hover:bg-white hover:shadow-sm'
                        }`}
                        aria-current={isSelected ? 'page' : undefined}
                      >
                        <span
                          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                            isSelected ? 'bg-[#2d4d40] text-[#e9bd67]' : 'bg-[#eadfce] text-[#9b6a47]'
                          }`}
                        >
                          <IconComponent className="h-5 w-5" />
                        </span>
                        <span className="max-w-full truncate">{cat}</span>
                      </button>
                    );
                  })}
                </div>
              </nav>

              <div className="premium-scroll min-w-0 flex-1 overflow-y-auto bg-[#fbf6ef] px-5 pb-28 pt-5 md:px-8 md:pb-8 lg:px-10">
                <div className="relative mb-7 overflow-hidden rounded-[2rem] bg-[#1f352d] p-5 text-white shadow-[0_24px_55px_rgba(46,31,20,.16)] md:p-7">
                  <img
                    src={featuredItem?.image_url || FALLBACK_IMAGES[selectedCategory] || FALLBACK_IMAGES.all}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-35"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#17110d]/90 via-[#17110d]/58 to-[#17110d]/20" />
                  <div className="relative max-w-xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#f2c875] backdrop-blur">
                      <ChefHat className="h-3.5 w-3.5" />
                      Chef curated
                    </div>
                    <h2 className="mt-4 font-display text-4xl font-semibold leading-tight md:text-6xl">
                      Order like you are dining in.
                    </h2>
                    <p className="mt-3 max-w-lg text-sm font-medium leading-6 text-white/82 md:text-base">
                      Browse rich food photos, choose your favorites, and send a polished table order in seconds.
                    </p>
                  </div>
                </div>

                <div className="mb-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#a76538]">Today's selection</p>
                    <h2 className="mt-1 font-display text-3xl font-semibold text-[#2a201a]">Made fresh for you</h2>
                    <p className="mt-1 text-sm font-medium text-[#86766a]">{filteredMenuItems.length} dishes available</p>
                  </div>
                  <span className="hidden rounded-full border border-[#e6d9c8] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#8c7d70] md:block">
                    Tap to order
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredMenuItems.map((item) => (
                    <article
                      key={item.id}
                      className="group overflow-hidden rounded-[1.75rem] border border-[#eadfce] bg-white shadow-[0_12px_35px_rgba(70,47,31,.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_55px_rgba(70,47,31,.15)]"
                    >
                      <MenuItemImage src={item.image_url} alt={item.name} category={item.category} />

                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-display text-[1.7rem] font-semibold leading-[1.05] text-[#2a201a]">
                              {item.name}
                            </h3>
                            {item.name_hi && (
                              <p className="mt-1 truncate text-sm font-semibold text-[#9a8a7d]">{item.name_hi}</p>
                            )}
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#eef5e8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#4c7a45]">
                            <Leaf className="h-3 w-3" />
                            Veg
                          </span>
                        </div>

                        <div className="mt-5 flex items-center justify-between border-t border-[#eee3d4] pt-4">
                          <div>
                            <p className="font-display text-3xl font-semibold text-[#8b4f2d]">{formatPrice(item.price)}</p>
                            <p className="text-xs font-semibold text-[#a2968b]">Prepared on order</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddItemClick(item)}
                            disabled={isUpdatingOrder}
                            className="flex h-14 min-w-[8.75rem] items-center justify-center gap-2 rounded-full bg-[#1f352d] px-5 text-sm font-bold text-white shadow-[0_10px_20px_rgba(31,53,45,.22)] transition hover:bg-[#16261f] active:scale-[0.98] disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-[#b66b3c]/25"
                            aria-label={`Add ${item.name} to order for ${item.price} rupees`}
                          >
                            <Plus className="h-4 w-4 stroke-[3]" />
                            Add
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="hidden h-screen w-[390px] shrink-0 border-l border-[#e7dccd] bg-[#fffaf3] lg:block xl:w-[430px]">
          <CartSummary
            order={order}
            onUpdateQuantity={handleUpdateQuantity}
            onReviewOrder={handleReview}
            isUpdating={isUpdatingOrder}
          />
        </aside>
      </div>

      {order?.items?.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none lg:hidden">
          <button
            type="button"
            onClick={() => setShowMobileCart(!showMobileCart)}
            className="pointer-events-auto mx-auto mb-4 flex w-[92%] max-w-lg items-center justify-between rounded-[1.35rem] border border-[#3b554b] bg-[#1f352d] px-5 py-3.5 font-bold text-white shadow-[0_16px_40px_rgba(31,53,45,.3)] transition active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <ShoppingBag className="h-6 w-6 text-[#e9bd67]" />
              <span className="text-sm md:text-base">
                Your order · {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-semibold text-[#e9bd67]">{formatPrice(order?.total || 0)}</span>
              <ChevronUp className={`h-5 w-5 text-white/75 transition-transform ${showMobileCart ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {showMobileCart && (
            <div className="pointer-events-auto fixed bottom-[78px] left-1/2 z-50 max-h-[48vh] w-[92%] max-w-xl -translate-x-1/2 overflow-y-auto rounded-[1.75rem] border border-[#e5d9c8] bg-[#fffaf3] shadow-2xl">
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

      {modifierItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#211b17]/65 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modifier-title"
        >
          <div className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-[#e5d9c8] bg-[#fffaf3] shadow-[0_30px_80px_rgba(42,32,26,.28)]">
            <div className="h-1.5 bg-[#1f352d]" />
            <div className="p-6 md:p-8">
              <div className="flex items-start justify-between gap-4 border-b border-[#e5d9c8] pb-6">
                <div>
                  <div className="inline-flex items-center rounded-full bg-[#f3eadf] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a06036]">
                    Customize your order
                  </div>
                  <h2 id="modifier-title" className="mt-3 font-display text-4xl font-semibold leading-tight text-[#2a201a]">
                    {modifierItem.name}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-[#95877a]">Make it exactly the way you like it.</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setModifierItem(null);
                    setSelectedModifiers([]);
                  }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f3eadf] text-[#5f5044] transition hover:bg-[#eadbc9] active:scale-95 focus:outline-none focus:ring-4 focus:ring-[#b66b3c]/20"
                  aria-label="Close modifier picker"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="pt-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[#2a201a]">Choose your extras</h3>
                    <p className="mt-1 text-xs font-medium text-[#95877a]">Select any options you would like to add.</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#a06036]">Optional</span>
                </div>

                <div className="premium-scroll max-h-64 space-y-3 overflow-y-auto pr-1">
                  {modifierItem.parsedModifiers.map((mod) => {
                    const isSelected = selectedModifiers.includes(mod);

                    return (
                      <button
                        key={mod}
                        type="button"
                        onClick={() => toggleModifier(mod)}
                        className={`flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left transition active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-[#b66b3c]/15 ${
                          isSelected
                            ? 'border-[#b96235] bg-[#f3eadf] shadow-[0_6px_18px_rgba(185,98,53,.1)]'
                            : 'border-[#e5d9c8] bg-[#fffaf3] hover:bg-[#f6efe6]'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                              isSelected ? 'border-[#1f352d] bg-[#1f352d]' : 'border-[#cbbba7] bg-white'
                            }`}
                          >
                            {isSelected && <Check className="h-4 w-4 text-[#e9bd67]" strokeWidth={3} />}
                          </span>
                          <span className="text-base font-bold capitalize text-[#4f4036]">{mod}</span>
                        </div>
                        {isSelected && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#a06036]">Added</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-7 flex gap-3 border-t border-[#e5d9c8] pt-5">
                <button
                  type="button"
                  onClick={() => {
                    setModifierItem(null);
                    setSelectedModifiers([]);
                  }}
                  className="min-h-touch flex-1 rounded-full border border-[#ded2c2] bg-white text-base font-bold text-[#5f5044] transition hover:bg-[#f6efe6] active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-[#b66b3c]/15"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmModifiers}
                  className="min-h-touch flex-[1.4] rounded-full bg-[#1f352d] text-base font-bold text-white shadow-[0_8px_20px_rgba(31,53,45,.2)] transition hover:bg-[#16261f] active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-[#1f352d]/20"
                >
                  Confirm Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

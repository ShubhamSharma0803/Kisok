import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../core/SessionContext';
import { useHandoff } from '../core/HandoffProvider';
import { useSessionSocket } from '../core/useSessionSocket';
import {
  getMenu,
  getOrder,
  addOrderItem,
  updateOrderItemQuantity,
  deleteOrderItem,
  triggerScreenNarration,
  updateDetection,
  updateChannel,
} from '../core/api';
import { setNarrationContext } from '../core/screenNarration';
import { useGazeTracking } from './useGazeTracking';
import { useDwellSelect, DwellOverlay, GazeCursor } from './DwellSelect';
import {
  ArrowLeft,
  ChefHat,
  Coffee,
  Grid,
  IceCream,
  Leaf,
  Plus,
  Minus,
  Trash2,
  Eye,
  RefreshCw,
  AlertCircle,
  ShoppingBag,
  Sparkles,
  Utensils,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  ReceiptText,
  X,
  CheckCircle2,
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

export default function GazeScreen() {
  const navigate = useNavigate();
  const { sessionId, initSession } = useSession();
  const { reportFailedTap } = useHandoff();
  const { subscribe } = useSessionSocket(sessionId);

  // Immediate mode mounting without transition delay
  const [phase, setPhase] = useState('ordering');
  const [menu, setMenu] = useState([]);
  const [order, setOrder] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isBusy, setIsBusy] = useState(false);
  const [lastAdded, setLastAdded] = useState(null);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Scroll container ref for hands-free gaze scrolling
  const scrollContainerRef = useRef(null);

  const { gaze, status, resetCenter } = useGazeTracking({ enabled: true, sessionId });
  const [failedDwells, setFailedDwells] = useState(0);
  const fallbackTriggeredRef = useRef(false);

  // When unmounting or leaving GazeScreen, ensure gaze_input channel is set to false
  useEffect(() => {
    return () => {
      if (sessionId) {
        updateChannel(sessionId, 'gaze_input', false).catch(() => {});
      }
    };
  }, [sessionId]);

  // Keyboard shortcut: Pressing 'c' or 'Space' re-centers the gaze neutral baseline
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'c' || e.key === 'C' || e.code === 'Space') {
        resetCenter();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetCenter]);

  // --- Data fetching ---
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let sid = sessionId;
      if (!sid) {
        const s = await initSession();
        sid = s?.id;
      }
      const menuData = await getMenu();
      setMenu(Array.isArray(menuData) ? menuData : []);
      if (sid) {
        const orderData = await getOrder(sid);
        setOrder(orderData);
      }
      setIsLoading(false);
    } catch (err) {
      console.error('[GazeScreen] Failed to load menu or order:', err);
      setError('Unable to load menu right now. Please check server connection.');
      setIsLoading(false);
    }
  }, [sessionId, initSession]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Subscribe to order updates via WebSocket
  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = subscribe('order_updated', (updatedOrderPayload) => {
      setOrder(updatedOrderPayload);
    });
    return () => unsubscribe();
  }, [sessionId, subscribe]);

  useEffect(() => {
    if (phase === 'ordering' && sessionId) {
      triggerScreenNarration(sessionId, 'gaze', {});
    }
  }, [phase, sessionId]);

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

  // --- Hands-free Gaze Scrolling Handlers ---
  const handleScrollUp = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ top: -380, behavior: 'smooth' });
    }
  }, []);

  const handleScrollDown = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ top: 380, behavior: 'smooth' });
    }
  }, []);

  // --- Dwell Selection Handler ---
  const handleSelect = useCallback(
    async (id) => {
      if (!id) return;

      // 1. Navigation & Calibration
      if (id === 'nav:back') {
        navigate('/');
        return;
      }
      if (id === 'nav:recenter') {
        resetCenter();
        return;
      }
      if (id === 'cart:review' || id === 'review') {
        navigate('/review');
        return;
      }

      // 2. Scrolling
      if (id === 'scroll:up') {
        handleScrollUp();
        return;
      }
      if (id === 'scroll:down') {
        handleScrollDown();
        return;
      }

      // 3. Cart Drawer Toggle
      if (id === 'cart:toggle') {
        setShowMobileCart((prev) => !prev);
        return;
      }
      if (id === 'cart:close') {
        setShowMobileCart(false);
        return;
      }

      // 4. Category Filter Tabs
      if (id.startsWith('cat:')) {
        const cat = id.replace('cat:', '');
        setSelectedCategory(cat);
        return;
      }

      // 5. Cart Quantity Modification via Dwell
      if (id.startsWith('cart:inc:') || id.startsWith('cart:dec:')) {
        const isInc = id.startsWith('cart:inc:');
        const itemId = id.replace(isInc ? 'cart:inc:' : 'cart:dec:', '');
        const currentItem = order?.items?.find((it) => String(it.id || it.menu_item_id) === String(itemId));
        if (!currentItem || !sessionId || isBusy) return;

        setIsBusy(true);
        try {
          let updated;
          const newQty = isInc ? currentItem.quantity + 1 : currentItem.quantity - 1;
          if (newQty <= 0) {
            updated = await deleteOrderItem(sessionId, currentItem.id);
          } else {
            updated = await updateOrderItemQuantity(sessionId, currentItem.id, newQty);
          }
          setOrder(updated);
        } catch (err) {
          console.error('[GazeScreen] Cart update failed:', err);
        } finally {
          setIsBusy(false);
        }
        return;
      }

      // 6. Food Card Selection (Entire Item Card Dwellable)
      if (id.startsWith('item:')) {
        const itemId = id.replace('item:', '');
        const item = menu.find((m) => String(m.id) === String(itemId));
        if (!item || isBusy || !sessionId) return;

        setIsBusy(true);
        try {
          const updated = await addOrderItem(sessionId, item.id, 1, null);
          setOrder(updated);
          setLastAdded(item.name);
          setTimeout(() => setLastAdded(null), 1800);
        } catch (err) {
          console.error('[GazeScreen] dwell add failed:', err);
          if (reportFailedTap) reportFailedTap();
        } finally {
          setIsBusy(false);
        }
      }
    },
    [menu, order, sessionId, isBusy, navigate, reportFailedTap, handleScrollUp, handleScrollDown]
  );

  const { activeId, progress } = useDwellSelect({
    gaze,
    onSelect: handleSelect,
    onFailedDwell: (count) => setFailedDwells(count),
    enabled: phase === 'ordering' && !isBusy,
    dwellTimeMs: 1300,
  });

  // Watch for calibration failure or 3 failed dwell attempts -> Fallback to touch
  useEffect(() => {
    if (fallbackTriggeredRef.current) return;

    const isCalibFailed = status === 'calibration_failed' || status === 'denied' || status === 'error';
    const isDwellsFailed = failedDwells >= 3;

    if (isCalibFailed || isDwellsFailed) {
      fallbackTriggeredRef.current = true;
      const reason = isCalibFailed
        ? `gaze_calibration_failed_${status}`
        : 'failed_dwell_limit_exceeded_3';
      console.warn(`[GazeScreen] Fallback triggered due to: ${reason}`);

      const performFallback = async () => {
        if (sessionId) {
          try {
            await updateDetection(sessionId, 'standard_touch', 0.5, 'gaze_calibration_failed', reason);
            await updateChannel(sessionId, 'gaze_input', false);
          } catch (err) {
            console.warn('[GazeScreen] Failed to update fallback in DB:', err);
          }
        }
        navigate('/order');
      };

      performFallback();
    }
  }, [status, failedDwells, sessionId, navigate]);

  const handleUpdateQuantity = async (item, newQuantity) => {
    if (!sessionId || !item?.id) return;
    setIsBusy(true);
    try {
      let updatedOrder;
      if (newQuantity <= 0) {
        updatedOrder = await deleteOrderItem(sessionId, item.id);
      } else {
        updatedOrder = await updateOrderItemQuantity(sessionId, item.id, newQuantity);
      }
      setOrder(updatedOrder);
    } catch (err) {
      console.error('[GazeScreen] Failed to update item quantity:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleBack = () => navigate('/');
  const handleReview = () => navigate('/review');

  // ============================
  // CAMERA FAILURE / DENIAL
  // ============================
  if (status === 'denied') {
    return (
      <main className="premium-shell min-h-screen flex flex-col items-center justify-center p-8 text-center text-[#211b17]">
        <div className="p-10 rounded-[2.5rem] bg-[#fffaf3] border border-red-200 max-w-xl w-full space-y-6 shadow-[0_24px_55px_rgba(46,31,20,.16)]">
          <AlertCircle className="mx-auto h-14 w-14 text-red-600" />
          <h1 className="font-display text-3xl font-semibold text-red-950">Camera access was blocked</h1>
          <p className="text-lg text-[#67594f] font-medium">Let's switch to touch ordering so you don't get stuck.</p>
          <button
            type="button"
            onClick={() => navigate('/order')}
            className="w-full min-h-touch text-lg font-bold bg-[#1f352d] hover:bg-[#16261f] text-white rounded-full shadow-[0_10px_20px_rgba(31,53,45,.22)] transition focus:outline-none focus:ring-4 focus:ring-[#1f352d]/25 active:scale-[0.98]"
          >
            Switch to Tap to Order
          </button>
        </div>
      </main>
    );
  }

  // ============================
  // ORDERING PHASE — Instant Touch Menu Layout 1:1
  // ============================
  return (
    <main className="premium-shell h-screen overflow-hidden text-[#211b17] relative">
      {/* 1. Global High-Z Smooth Gaze Reticle Cursor */}
      <GazeCursor gaze={gaze} />

      {/* 2. Success Toast on Item Added via Dwell */}
      {lastAdded && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-[#1f352d] text-white px-7 py-3.5 rounded-full font-bold shadow-[0_15px_40px_rgba(33,56,47,.45)] flex items-center gap-3 border border-[#e9bd67]/50 animate-bounce">
          <CheckCircle2 className="h-5 w-5 text-[#22c55e]" />
          <span>Added {lastAdded} to order</span>
        </div>
      )}

      {/* 3. Floating Hands-Free Gaze Scroll Controls (Docked at Middle Right) */}
      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-4">
        {/* Scroll Up Target */}
        <button
          type="button"
          data-dwell-id="scroll:up"
          onClick={handleScrollUp}
          aria-label="Look here to scroll menu up"
          className="relative flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#d7c7b4] bg-[#fffaf3] text-[#1f352d] shadow-xl transition-transform hover:scale-105 active:scale-95 focus:outline-none"
        >
          {activeId === 'scroll:up' && <DwellOverlay progress={progress} className="rounded-2xl" />}
          <div className="flex flex-col items-center">
            <ChevronUp className="h-7 w-7 stroke-[3]" />
            <span className="text-[9px] font-black uppercase">Up</span>
          </div>
        </button>

        {/* Scroll Down Target */}
        <button
          type="button"
          data-dwell-id="scroll:down"
          onClick={handleScrollDown}
          aria-label="Look here to scroll menu down"
          className="relative flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#d7c7b4] bg-[#fffaf3] text-[#1f352d] shadow-xl transition-transform hover:scale-105 active:scale-95 focus:outline-none"
        >
          {activeId === 'scroll:down' && <DwellOverlay progress={progress} className="rounded-2xl" />}
          <div className="flex flex-col items-center">
            <ChevronDown className="h-7 w-7 stroke-[3]" />
            <span className="text-[9px] font-black uppercase">Down</span>
          </div>
        </button>
      </div>

      <div className="flex h-full min-h-0">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="shrink-0 border-b border-[#e7dccd] bg-[#fffaf3]/95 px-5 py-4 shadow-[0_10px_30px_rgba(58,39,24,.06)] backdrop-blur md:px-8">
            <div className="flex items-center justify-between gap-5">
              <div className="flex min-w-0 items-center gap-4">
                <button
                  type="button"
                  data-dwell-id="nav:back"
                  onClick={handleBack}
                  className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d7c7b4] bg-white text-[#3a2c22] shadow-sm transition hover:bg-[#f5eadc] active:scale-95 focus:outline-none focus:ring-4 focus:ring-[#b66b3c]/25"
                  aria-label="Back to session start"
                >
                  {activeId === 'nav:back' && <DwellOverlay progress={progress} className="rounded-full" />}
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#a76538]">The Kiosk Kitchen</p>
                  <h1 className="font-display text-3xl font-semibold leading-none text-[#231a15] md:text-5xl">
                    Premium dining menu
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  data-dwell-id="nav:recenter"
                  onClick={resetCenter}
                  className="relative hidden sm:flex items-center gap-2 rounded-full border border-[#d7c7b4] bg-[#fffaf3] px-3.5 py-2 text-xs font-bold text-[#5f5044] shadow-sm hover:bg-[#f3eadf] active:scale-95"
                  aria-label="Look here or press Space to re-center gaze"
                  title="Recenter Gaze (Space / C)"
                >
                  {activeId === 'nav:recenter' && <DwellOverlay progress={progress} className="rounded-full" />}
                  <RefreshCw className="h-3.5 w-3.5 text-[#a76538]" />
                  <span>Center Gaze</span>
                </button>

                <div className="hidden items-center gap-3 rounded-full border border-[#e7dccd] bg-white px-4 py-2.5 shadow-sm lg:flex">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f352d] text-[#e9bd67]">
                    <Eye className="h-4 w-4" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-sm font-bold text-[#2b241f]">Gaze ordering</p>
                    <p className="text-xs font-medium text-[#928274]">Look at entire card to add</p>
                  </div>
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
              {/* Category Sidebar Navigation with Gaze Dwell */}
              <nav
                className="premium-scroll w-24 shrink-0 overflow-y-auto border-r border-[#e7dccd] bg-[#f7efe5] px-3 py-5 md:w-56 md:px-5"
                aria-label="Menu categories"
              >
                <div className="hidden px-2 pb-5 md:block">
                  <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-[#a76538]">Menu</p>
                  <p className="mt-1 text-xs font-medium text-[#8c7d70]">Look at course to select</p>
                </div>

                <div className="space-y-2.5">
                  {categories.map((cat) => {
                    const IconComponent = CATEGORY_ICONS[cat.toLowerCase()] || ChefHat;
                    const isSelected = selectedCategory === cat;
                    const dwellId = `cat:${cat}`;
                    const isActive = activeId === dwellId;

                    return (
                      <button
                        key={cat}
                        type="button"
                        data-dwell-id={dwellId}
                        onClick={() => setSelectedCategory(cat)}
                        className={`group relative flex w-full flex-col items-center gap-2 rounded-[1.35rem] px-2 py-3.5 text-center text-xs font-bold capitalize transition md:flex-row md:px-4 md:py-4 md:text-left md:text-sm ${
                          isSelected
                            ? 'bg-[#1f352d] text-white shadow-[0_14px_28px_rgba(31,53,45,.22)]'
                            : 'text-[#67594f] hover:bg-white hover:shadow-sm'
                        }`}
                        aria-current={isSelected ? 'page' : undefined}
                      >
                        {isActive && <DwellOverlay progress={progress} className="rounded-[1.35rem]" />}
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

              {/* Main Scrollable Menu Content */}
              <div
                ref={scrollContainerRef}
                className="premium-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[#fbf6ef] px-5 pb-32 pt-5 md:px-8 md:pb-32 lg:px-10"
              >
                {/* Hero Banner */}
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
                      <Eye className="h-3.5 w-3.5" />
                      Gaze Powered
                    </div>
                    <h2 className="mt-4 font-display text-4xl font-semibold leading-tight md:text-6xl">
                      Look to order your favorites.
                    </h2>
                    <p className="mt-3 max-w-lg text-sm font-medium leading-6 text-white/82 md:text-base">
                      Look anywhere on a dish card for 1.3 seconds to add it to your order.
                    </p>
                  </div>
                </div>

                {/* Section Header */}
                <div className="mb-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#a76538]">Today's selection</p>
                    <h2 className="mt-1 font-display text-3xl font-semibold text-[#2a201a]">Made fresh for you</h2>
                    <p className="mt-1 text-sm font-medium text-[#86766a]">{filteredMenuItems.length} dishes available</p>
                  </div>
                  <span className="hidden rounded-full border border-[#e6d9c8] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#8c7d70] md:block">
                    Look at any card to add
                  </span>
                </div>

                {/* Food Cards Grid (ENTIRE CARD IS DWELLABLE HITBOX) */}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredMenuItems.map((item) => {
                    const itemDwellId = `item:${item.id}`;
                    const isActive = activeId === itemDwellId;

                    return (
                      <article
                        key={item.id}
                        data-dwell-id={itemDwellId}
                        onClick={() => handleSelect(itemDwellId)}
                        className={`group relative overflow-hidden rounded-[1.75rem] border-2 bg-white shadow-[0_12px_35px_rgba(70,47,31,.08)] transition-all duration-200 cursor-pointer ${
                          isActive
                            ? 'border-[#22c55e] shadow-[0_0_30px_rgba(34,197,94,0.35)] scale-[1.02]'
                            : 'border-[#eadfce] hover:-translate-y-1 hover:shadow-[0_24px_55px_rgba(70,47,31,.15)]'
                        }`}
                        role="button"
                        aria-label={`Look to add ${item.name} for ${item.price} rupees`}
                      >
                        {/* Green Dwell Progress Ring & Overlay over the ENTIRE card */}
                        {isActive && <DwellOverlay progress={progress} className="rounded-[1.75rem]" />}

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
                              <p className="font-display text-3xl font-semibold text-[#8b4f2d]">
                                {formatPrice(item.price)}
                              </p>
                              <p className="text-xs font-semibold text-[#a2968b]">Look here to add</p>
                            </div>
                            <div
                              className={`flex h-14 min-w-[8.75rem] items-center justify-center gap-2 rounded-full px-5 text-sm font-bold text-white shadow-[0_10px_20px_rgba(31,53,45,.22)] transition ${
                                isActive ? 'bg-[#22c55e]' : 'bg-[#1f352d]'
                              }`}
                            >
                              <Plus className="h-4 w-4 stroke-[3]" />
                              Add
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Floating Bottom Cart Bar with Gaze Dwell */}
      {order?.items?.length > 0 && (
        <>
          <div className="fixed inset-x-0 bottom-0 z-50 pointer-events-none">
            <button
              type="button"
              data-dwell-id="cart:toggle"
              onClick={() => setShowMobileCart(!showMobileCart)}
              className="pointer-events-auto relative mx-auto mb-5 flex w-[92%] max-w-md items-center justify-between rounded-2xl border-2 border-[#3b554b] bg-[#21382f] px-5 py-3.5 font-bold text-white shadow-[0_12px_35px_rgba(33,56,47,.30)] transition-all duration-200 hover:bg-[#172a22] active:scale-[0.98]"
              aria-label="Look here to view or review your order"
            >
              {activeId === 'cart:toggle' && <DwellOverlay progress={progress} className="rounded-2xl" />}
              <div className="flex items-center gap-3">
                <ShoppingBag className="h-6 w-6 text-[#e8b65a]" />
                <div className="text-left">
                  <p className="text-sm md:text-base font-bold">View your order</p>
                  <p className="text-xs text-white/70">
                    {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-semibold text-[#e8b65a]">
                  {formatPrice(order?.total || 0)}
                </span>
                <ChevronUp
                  className={`h-5 w-5 text-white/75 transition-transform duration-300 ${
                    showMobileCart ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
          </div>

          {/* Dwell-Accessible Cart Drawer / Summary */}
          {showMobileCart && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#211b17]/60 p-4 backdrop-blur-sm">
              <div className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto overscroll-contain rounded-[2rem] border-2 border-[#e5d9c8] bg-[#fffaf3] p-6 shadow-2xl space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[#e5d9c8] pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1f352d] text-[#e9bd67]">
                      <ReceiptText className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a76538]">Your table</p>
                      <h2 className="font-display text-2xl font-bold text-[#2a201a]">Order Summary</h2>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-dwell-id="cart:close"
                    onClick={() => setShowMobileCart(false)}
                    className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[#f3eadf] text-[#5f5044] hover:bg-[#eadbc9]"
                    aria-label="Close cart"
                  >
                    {activeId === 'cart:close' && <DwellOverlay progress={progress} className="rounded-full" />}
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Items list with Dwellable [+] and [-] buttons */}
                <div className="space-y-3.5 max-h-[45vh] overflow-y-auto pr-1">
                  {order.items.map((item) => {
                    const incDwellId = `cart:inc:${item.id || item.menu_item_id}`;
                    const decDwellId = `cart:dec:${item.id || item.menu_item_id}`;
                    const isIncActive = activeId === incDwellId;
                    const isDecActive = activeId === decDwellId;

                    return (
                      <div
                        key={item.id || item.menu_item_id}
                        className="rounded-2xl border border-[#ebe0d1] bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-display text-lg font-bold text-[#2a201a]">{item.item_name}</h3>
                            <p className="text-xs text-[#95877a]">{formatPrice(item.unit_price)} each</p>
                          </div>
                          <span className="font-display text-lg font-bold text-[#8b4f2d]">
                            {formatPrice(item.unit_price * item.quantity)}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-[#eee3d4] pt-3">
                          <span className="text-xs font-semibold text-[#a2968b]">Look at buttons to adjust:</span>
                          <div className="flex items-center gap-3">
                            {/* Decrement Button */}
                            <button
                              type="button"
                              data-dwell-id={decDwellId}
                              onClick={() => handleUpdateQuantity(item, item.quantity - 1)}
                              disabled={isBusy}
                              className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-[#f3eadf] text-[#5f5044] hover:bg-[#eadbc9] active:scale-95 disabled:opacity-50"
                              aria-label={`Look to decrease ${item.item_name}`}
                            >
                              {isDecActive && <DwellOverlay progress={progress} className="rounded-xl" />}
                              {item.quantity === 1 ? (
                                <Trash2 className="h-5 w-5 text-red-600" />
                              ) : (
                                <Minus className="h-5 w-5" />
                              )}
                            </button>

                            <span className="w-8 text-center text-lg font-black text-[#2a201a]">{item.quantity}</span>

                            {/* Increment Button */}
                            <button
                              type="button"
                              data-dwell-id={incDwellId}
                              onClick={() => handleUpdateQuantity(item, item.quantity + 1)}
                              disabled={isBusy}
                              className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-[#1f352d] text-white hover:bg-[#16261f] active:scale-95 disabled:opacity-50"
                              aria-label={`Look to increase ${item.item_name}`}
                            >
                              {isIncActive && <DwellOverlay progress={progress} className="rounded-xl" />}
                              <Plus className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total & Review Order Dwell Action */}
                <div className="border-t border-[#e5d9c8] pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-[#2a201a]">Amount Payable</span>
                    <span className="font-display text-3xl font-bold text-[#8b4f2d]">
                      {formatPrice(order.total || 0)}
                    </span>
                  </div>

                  <button
                    type="button"
                    data-dwell-id="cart:review"
                    onClick={handleReview}
                    className="relative flex min-h-touch w-full items-center justify-center gap-3 rounded-full bg-[#b95f35] px-6 text-lg font-bold text-white shadow-xl hover:bg-[#9f4f29] active:scale-[0.98]"
                    aria-label="Look here to review and confirm your order"
                  >
                    {activeId === 'cart:review' && <DwellOverlay progress={progress} className="rounded-full" />}
                    <span>Proceed to Review</span>
                    <ArrowRight className="h-5 w-5 stroke-[3]" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Plus, ShoppingBag, Minus, Trash2, Utensils } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../core/SessionContext';
import {
  getMenu,
  getOrder,
  addOrderItem,
  updateOrderItemQuantity,
  deleteOrderItem,
} from '../core/api';

const formatPrice = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function LargeUIScreen() {
  const navigate = useNavigate();
  const { sessionId, initSession } = useSession();
  const [activeSessionId, setActiveSessionId] = useState(null);

  const [menu, setMenu] = useState([]);
  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
  setIsLoading(true);
  setError(null);

  try {
    // Load menu first
    const menuData = await getMenu();
    setMenu(Array.isArray(menuData) ? menuData : []);
  } catch (err) {
    console.error('[LargeUIScreen] Menu loading failed:', err);
    setError('Unable to load the menu. Please try again.');
    setIsLoading(false);
    return;
  }

  // Load/create session separately
  try {
    let currentSessionId = sessionId;

    if (!currentSessionId) {
      const newSession = await initSession();
      currentSessionId = newSession?.id;
    }
      setActiveSessionId(currentSessionId);

    if (currentSessionId) {
      const orderData = await getOrder(currentSessionId);
      setOrder(orderData);
    }
  } catch (err) {
    console.error('[LargeUIScreen] Order/session loading failed:', err);

    // Menu can still be displayed even if the order fails
    setOrder(null);
  } finally {
    setIsLoading(false);
  }
}, [sessionId, initSession]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddItem = async (item) => {
  setIsUpdating(true);

  try {
    let currentSessionId = sessionId;

    // If session doesn't exist yet, create one
    if (!currentSessionId) {
      const newSession = await initSession();
      currentSessionId = newSession?.id;
    }

    // Still no session = cannot add
    if (!currentSessionId) {
      throw new Error('No active session available');
    }

    const updatedOrder = await addOrderItem(
      currentSessionId,
      item.id,
      1,
      null
    );

    setOrder(updatedOrder);
  } catch (err) {
    console.error('[LargeUIScreen] Failed to add item:', err);
    alert('Could not add this item. Please try again.');
  } finally {
    setIsUpdating(false);
  }
};

  const handleQuantity = async (item, quantity) => {
    if (!activeSessionId || !item?.id) return;

    setIsUpdating(true);

    try {
      let updatedOrder;

      if (quantity <= 0) {
        updatedOrder = await deleteOrderItem(activeSessionId, item.id);
      } else {
        updatedOrder = await updateOrderItemQuantity(
          activeSessionId,
          item.id,
          quantity
        );
      }

      setOrder(updatedOrder);
    } catch (err) {
      console.error('[LargeUIScreen] Failed to update quantity:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f0e6] text-[#211b17]">

      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b-2 border-[#d8c7b4] bg-[#fffaf3] px-6 py-5 shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">

          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex min-h-[72px] items-center gap-3 rounded-2xl border-2 border-[#bda991] bg-white px-6 text-xl font-bold text-[#3b2d24] shadow-sm transition active:scale-95"
          >
            <ArrowLeft className="h-8 w-8" />
            Back
          </button>

          <div className="text-center">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-[#8b5e34]">
              Big Icons
            </p>

            <h1 className="mt-1 text-4xl font-black md:text-5xl">
              Choose Your Food
            </h1>
          </div>

          <div className="flex h-[72px] min-w-[72px] items-center justify-center rounded-2xl bg-[#21382f] text-[#e9bd67]">
            <Utensils className="h-9 w-9" />
          </div>

        </div>
      </header>

      {/* LOADING */}
      {isLoading && (
        <div className="flex min-h-[70vh] items-center justify-center px-6 text-center">
          <div>
            <Utensils className="mx-auto h-20 w-20 animate-pulse text-[#8b5e34]" />

            <h2 className="mt-6 text-4xl font-black">
              Loading Menu...
            </h2>

            <p className="mt-3 text-2xl font-semibold text-[#796a5d]">
              Please wait
            </p>
          </div>
        </div>
      )}

      {/* ERROR */}
      {!isLoading && error && (
        <div className="flex min-h-[70vh] items-center justify-center px-6">
          <div className="max-w-xl rounded-3xl border-2 border-red-200 bg-white p-10 text-center shadow-xl">

            <h2 className="text-4xl font-black text-red-900">
              Menu Unavailable
            </h2>

            <p className="mt-4 text-2xl font-semibold text-[#67594f]">
              {error}
            </p>

            <button
              type="button"
              onClick={fetchData}
              className="mt-8 min-h-[72px] rounded-2xl bg-[#21382f] px-10 text-xl font-black text-white"
            >
              Try Again
            </button>

          </div>
        </div>
      )}

      {/* MENU */}
      {!isLoading && !error && (
        <div className="mx-auto max-w-7xl px-6 py-8 pb-40">

          <div className="mb-8 rounded-3xl border-2 border-[#d8c7b4] bg-white p-6 shadow-md">

            <p className="text-xl font-bold text-[#8b5e34]">
              BIG ICONS MODE
            </p>

            <h2 className="mt-2 text-4xl font-black md:text-5xl">
              Take your time and choose what you like.
            </h2>

            <p className="mt-3 text-xl font-semibold text-[#796a5d]">
              Large pictures, large text and simple buttons make ordering easier.
            </p>

          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">

            {menu.map((item) => {
              const orderItem = order?.items?.find((oi) => oi.menu_item_id === item.id);

              return (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-3xl border-2 border-[#d8c7b4] bg-white shadow-lg"
                >

                  {/* FOOD IMAGE */}
                  <div className="h-64 overflow-hidden bg-[#eadfce]">
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>

                  {/* FOOD DETAILS */}
                  <div className="p-7">

                    <h3 className="text-3xl font-black leading-tight text-[#2a201a] md:text-4xl">
                      {item.name}
                    </h3>

                    {item.name_hi && (
                      <p className="mt-2 text-xl font-bold text-[#8c7d70]">
                        {item.name_hi}
                      </p>
                    )}

                    <div className="mt-6 flex items-center justify-between gap-4">

                      <div>
                        <p className="text-3xl font-black text-[#8b4f2d]">
                          {formatPrice(item.price)}
                        </p>

                        <p className="mt-1 text-base font-bold text-[#95877a]">
                          Freshly prepared
                        </p>
                      </div>

                      {orderItem ? (
                        <div className="flex items-center gap-3 rounded-2xl bg-[#21382f] px-3 py-2">
                          <button
                            type="button"
                            onClick={() => handleQuantity(orderItem, orderItem.quantity - 1)}
                            disabled={isUpdating}
                            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white disabled:opacity-50"
                            aria-label={`Remove one ${item.name}`}
                          >
                            <Minus className="h-6 w-6" />
                          </button>

                          <span className="min-w-[2ch] text-center text-2xl font-black text-white">
                            {orderItem.quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleQuantity(orderItem, orderItem.quantity + 1)}
                            disabled={isUpdating}
                            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white disabled:opacity-50"
                            aria-label={`Add one more ${item.name}`}
                          >
                            <Plus className="h-6 w-6" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddItem(item)}
                          disabled={isUpdating}
                          className="flex min-h-[72px] min-w-[140px] items-center justify-center gap-3 rounded-2xl bg-[#21382f] px-6 text-xl font-black text-white shadow-lg transition active:scale-95 disabled:opacity-50"
                        >
                          <Plus className="h-7 w-7" />
                          ADD
                        </button>
                      )}

                    </div>

                  </div>

                </article>
              );
            })}

          </div>
        </div>
      )}

      {/* CART */}
      {order?.items?.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-[#d8c7b4] bg-[#fffaf3] p-5 shadow-[0_-10px_30px_rgba(0,0,0,.15)]">

          <div className="mx-auto flex max-w-7xl items-center justify-between gap-5">

            <div className="flex items-center gap-4">

              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#21382f] text-[#e9bd67]">
                <ShoppingBag className="h-8 w-8" />
              </div>

              <div>
                <p className="text-xl font-bold">
                  Your Order
                </p>

                <p className="text-lg font-semibold text-[#796a5d]">
                  {order.items.length}{' '}
                  {order.items.length === 1 ? 'item' : 'items'}
                </p>
              </div>

            </div>

            <div className="flex items-center gap-6">

              <span className="text-3xl font-black text-[#8b4f2d]">
                {formatPrice(order.total)}
              </span>

              <button
                type="button"
                onClick={() => navigate('/review')}
                className="min-h-[72px] rounded-2xl bg-[#b95f35] px-8 text-xl font-black text-white shadow-lg active:scale-95"
              >
                REVIEW ORDER
              </button>

            </div>

          </div>
        </div>
      )}

    </main>
  );
}
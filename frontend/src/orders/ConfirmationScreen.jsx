import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../core/SessionContext';
import { getOrder, confirmOrder } from '../core/api';
import {
  ArrowLeft,
  ArrowRight,
  ReceiptText,
  ShoppingBag,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

const formatPrice = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function ConfirmationScreen() {
  const navigate = useNavigate();
  const { sessionId } = useSession();

  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(null);

  const fetchCurrentOrder = useCallback(async () => {
    if (!sessionId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await getOrder(sessionId);
      setOrder(data);
    } catch (err) {
      console.error('[ConfirmationScreen] Failed to fetch order:', err);
      setFetchError(err.message || 'Unable to load order details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchCurrentOrder();
  }, [fetchCurrentOrder]);

  const handleConfirmOrder = async () => {
    if (!sessionId || isConfirming) return;
    setIsConfirming(true);
    setConfirmError(null);

    try {
      await confirmOrder(sessionId);
      navigate('/payment');
    } catch (err) {
      console.error('[ConfirmationScreen] Failed to confirm order:', err);
      setConfirmError(err.message || 'Failed to confirm order. Please try again.');
    } finally {
      setIsConfirming(false);
    }
  };

  const items = order?.items || [];
  const total = order?.total || 0;
  const isPending = order?.status === 'pending';

  return (
    <main className="min-h-screen bg-[#f5f0e8] text-[#211b17] font-sans">
      {/* Header */}
      <header className="border-b border-[#e7dccd] bg-[#fffaf3] px-6 py-5 md:px-10 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {isPending && (
              <button
                type="button"
                onClick={() => navigate('/order')}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-[#d8cbb9] bg-white text-[#211b17] shadow-sm transition hover:bg-[#f4eadc] active:scale-95 focus:outline-none focus:ring-4 focus:ring-[#b66b3c]/25"
                aria-label="Back to menu"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a66b3f]">
                THE KIOSK KITCHEN
              </p>
              <h1 className="font-display text-3xl md:text-4xl font-bold text-[#211b17]">
                Review Your Order
              </h1>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 rounded-full border border-[#e7dccd] bg-white px-4 py-2 text-xs font-bold text-[#806f60] shadow-sm">
            <ReceiptText className="h-4 w-4 text-[#a66b3f]" />
            <span>Order Summary</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <section className="mx-auto max-w-5xl px-5 py-8 md:px-10">
        {isLoading && (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-[2rem] border border-[#e5d9c8] bg-[#fffaf3] p-12 text-center shadow-sm">
            <RefreshCw className="h-12 w-12 animate-spin text-[#9b5933]" />
            <p className="font-display text-3xl font-semibold text-[#241a14]">Loading your order</p>
            <p className="text-sm font-medium text-[#817166]">Retrieving your items...</p>
          </div>
        )}

        {fetchError && !isLoading && (
          <div className="flex min-h-[50vh] items-center justify-center">
            <div className="w-full max-w-lg rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-xl">
              <AlertCircle className="mx-auto h-12 w-12 text-red-600" />
              <h2 className="mt-4 font-display text-3xl font-semibold text-red-950">Unable to load order</h2>
              <p className="mt-2 text-sm font-medium text-[#67594f]">{fetchError}</p>
              <button
                type="button"
                onClick={fetchCurrentOrder}
                className="mt-6 min-h-touch rounded-full bg-[#1f352d] px-8 text-base font-bold text-white shadow-lg transition hover:bg-[#16261f] focus:outline-none focus:ring-4 focus:ring-[#1f352d]/25"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!isLoading && !fetchError && items.length === 0 && (
          <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-[2rem] border border-dashed border-[#d9c8b6] bg-white p-8 text-center shadow-sm">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b5e34]">
              <ShoppingBag className="h-10 w-10" />
            </div>
            <h2 className="mt-5 font-display text-3xl font-semibold text-[#2a201a]">Your order is empty</h2>
            <p className="mt-2 max-w-md text-base font-medium text-[#8c7d70]">
              You haven't added any dishes yet. Browse our menu to choose your favorite items.
            </p>
            <button
              type="button"
              onClick={() => navigate('/order')}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1f352d] px-8 py-4 text-base font-bold text-white shadow-lg transition hover:bg-[#29483d] focus:outline-none focus:ring-4 focus:ring-[#1f352d]/25"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Menu</span>
            </button>
          </div>
        )}

        {!isLoading && !fetchError && items.length > 0 && (
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            {/* Itemized Order List */}
            <div className="rounded-[2rem] border border-[#e5d9c8] bg-[#fffaf3] p-6 md:p-8 shadow-[0_15px_40px_rgba(80,60,40,.06)]">
              <div className="flex items-center justify-between border-b border-[#e7dccd] pb-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#a66b3f]">
                    Items Selected
                  </p>
                  <h2 className="mt-1 font-display text-2xl md:text-3xl font-bold text-[#211b17]">
                    Order Details
                  </h2>
                </div>
                <span className="rounded-full bg-[#eadfce] px-3.5 py-1.5 text-xs font-bold text-[#7b4a2f]">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <div className="mt-5 space-y-4">
                {items.map((item) => (
                  <div
                    key={item.id || item.menu_item_id}
                    className="flex items-start justify-between gap-4 rounded-[1.35rem] border border-[#ebe0d1] bg-white p-4 shadow-[0_4px_16px_rgba(76,49,28,.04)]"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-xl font-semibold leading-tight text-[#2a201a]">
                        {item.item_name}
                      </h3>
                      {item.modifiers && (
                        <p className="mt-1 text-xs font-bold capitalize text-[#96735a]">
                          + {item.modifiers}
                        </p>
                      )}
                      <p className="mt-2 text-xs font-semibold text-[#8c7d70]">
                        Qty: <span className="font-bold text-[#2a201a]">{item.quantity}</span> × {formatPrice(item.unit_price)}
                      </p>
                    </div>
                    <span className="font-display text-xl font-semibold text-[#8b4f2d]">
                      {formatPrice(item.unit_price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment & Confirmation Summary Card */}
            <div className="flex flex-col gap-6">
              <div className="rounded-[2rem] bg-[#1f352d] p-6 md:p-8 text-white shadow-[0_20px_50px_rgba(31,53,45,.18)]">
                <div className="flex items-center gap-3 border-b border-white/10 pb-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 text-[#e9bd67]">
                    <ReceiptText className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#e9bd67]">
                      Total Summary
                    </p>
                    <h2 className="font-display text-2xl md:text-3xl font-semibold">Payment Due</h2>
                  </div>
                </div>

                <div className="mt-6 space-y-3 text-sm">
                  <div className="flex justify-between text-white/80">
                    <span>Total Items</span>
                    <span className="font-bold text-white">{items.length}</span>
                  </div>
                  <div className="flex justify-between text-white/80">
                    <span>Order Status</span>
                    <span className="font-bold uppercase tracking-wider text-[#e9bd67]">
                      {order?.status || 'Pending'}
                    </span>
                  </div>
                  <div className="border-t border-white/10 pt-4 flex items-baseline justify-between">
                    <span className="text-base font-bold text-white">Amount Payable</span>
                    <span className="font-display text-3xl md:text-4xl font-semibold text-[#e9bd67]">
                      {formatPrice(total)}
                    </span>
                  </div>
                </div>

                {/* Inline Confirmation Error */}
                {confirmError && (
                  <div className="mt-5 flex items-center gap-2 rounded-2xl border border-red-500/50 bg-red-950/60 p-4 text-xs font-bold text-red-200">
                    <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                    <span>{confirmError}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="mt-7 space-y-3">
                  <button
                    type="button"
                    onClick={handleConfirmOrder}
                    disabled={isConfirming || items.length === 0}
                    className="flex min-h-touch w-full items-center justify-center gap-3 rounded-full bg-[#b95f35] px-6 text-base font-bold text-white shadow-[0_12px_24px_rgba(185,95,53,.25)] transition hover:bg-[#9f4f29] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#7d695b] focus:outline-none focus:ring-4 focus:ring-[#b95f35]/25"
                  >
                    {isConfirming ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Confirming Order...</span>
                      </>
                    ) : (
                      <>
                        <span>Confirm Order</span>
                        <ArrowRight className="h-5 w-5 stroke-[3]" />
                      </>
                    )}
                  </button>

                  {isPending && (
                    <button
                      type="button"
                      onClick={() => navigate('/order')}
                      disabled={isConfirming}
                      className="flex min-h-touch w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 text-sm font-bold text-white transition hover:bg-white/20 active:scale-[0.98] disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-white/20"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Back to Menu</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

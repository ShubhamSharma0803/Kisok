import React from 'react';
import { ArrowRight, Minus, Plus, ReceiptText, ShoppingBag, Trash2 } from 'lucide-react';

const formatPrice = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function CartSummary({
  order,
  onUpdateQuantity,
  onReviewOrder,
  isUpdating = false,
}) {
  const items = order?.items || [];
  const total = order?.total || 0;

  return (
    <aside
  className="flex flex-col bg-[#fffdfa] p-5 md:p-6"
  aria-label="Order summary panel"
>
      <div className="shrink-0 rounded-[1.5rem] bg-[#1f352d] p-5 text-white shadow-[0_18px_36px_rgba(31,53,45,.2)]">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 text-[#e9bd67]">
            <ReceiptText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#e9bd67]">Your table</p>
            <h2 className="font-display text-3xl font-semibold leading-tight">Order summary</h2>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-white/12 bg-white/8 p-3">
            <p className="text-xs font-semibold text-white/62">Items</p>
            <p className="mt-1 text-2xl font-bold">{items.length}</p>
          </div>
          <div className="rounded-2xl border border-white/12 bg-white/8 p-3">
            <p className="text-xs font-semibold text-white/62">Total</p>
            <p className="mt-1 font-display text-2xl font-semibold text-[#e9bd67]">{formatPrice(total)}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 pr-1">
        {items.length === 0 ? (
          <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[#d9c8b6] bg-white p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b5e34]">
              <ShoppingBag className="h-8 w-8" />
            </div>
            <p className="mt-4 font-display text-2xl font-semibold text-[#2a201a]">Your table is empty</p>
            <p className="mt-2 text-sm font-medium leading-6 text-[#8c7d70]">
              Add dishes from the menu and they will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id || item.menu_item_id}
                className="rounded-[1.35rem] border border-[#ebe0d1] bg-white p-4 shadow-[0_8px_22px_rgba(76,49,28,.06)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl font-semibold leading-tight text-[#2a201a]">
                      {item.item_name}
                    </h3>
                    {item.modifiers && (
                      <p className="mt-1 text-xs font-bold capitalize text-[#96735a]">+ {item.modifiers}</p>
                    )}
                  </div>
                  <span className="shrink-0 font-display text-xl font-semibold text-[#8b4f2d]">
                    {formatPrice(item.unit_price * item.quantity)}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#eee3d4] pt-3">
                  <span className="text-xs font-semibold text-[#95877a]">{formatPrice(item.unit_price)} each</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity && onUpdateQuantity(item, item.quantity - 1)}
                      disabled={isUpdating}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3eadf] text-[#5f5044] transition hover:bg-[#eadbc9] active:scale-95 disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-[#b66b3c]/20"
                      aria-label={`Decrease quantity of ${item.item_name}`}
                    >
                      {item.quantity === 1 ? <Trash2 className="h-4 w-4 text-red-600" /> : <Minus className="h-5 w-5" />}
                    </button>
                    <span className="w-8 text-center text-lg font-bold text-[#2a201a]" aria-live="polite">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity && onUpdateQuantity(item, item.quantity + 1)}
                      disabled={isUpdating}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f352d] text-white transition hover:bg-[#16261f] active:scale-95 disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-[#1f352d]/20"
                      aria-label={`Increase quantity of ${item.item_name}`}
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 shrink-0 border-t border-[#e5d9c8] pt-4">
        <div className="mb-4 flex items-center justify-between text-[#2a201a]">
          <span className="text-base font-bold">Amount payable</span>
          <span className="font-display text-4xl font-semibold text-[#8b4f2d]">{formatPrice(total)}</span>
        </div>

        <button
          type="button"
          onClick={onReviewOrder}
          disabled={items.length === 0 || isUpdating}
          className="flex min-h-touch w-full items-center justify-center gap-3 rounded-full bg-[#b95f35] px-6 text-base font-bold text-white shadow-[0_12px_24px_rgba(185,95,53,.22)] transition hover:bg-[#9f4f29] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#ddd6cc] disabled:text-[#9b9289] focus:outline-none focus:ring-4 focus:ring-[#b95f35]/25"
          aria-label="Review order"
        >
          <span>Review Order</span>
          <ArrowRight className="h-5 w-5 stroke-[3]" />
        </button>
      </div>
    </aside>
  );
}

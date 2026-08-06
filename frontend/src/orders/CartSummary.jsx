import React from 'react';
import { ShoppingBag, Plus, Minus, ArrowRight, Trash2 } from 'lucide-react';

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
      className="flex flex-col justify-between bg-white border-l-4 border-slate-300 shadow-2xl h-full p-6 md:p-8"
      aria-label="Order Summary Panel"
    >
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b-2 border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-sky-100 border-2 border-sky-300 flex items-center justify-center text-sky-800">
              <ShoppingBag className="w-7 h-7" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-950">Your Order</h2>
              <p className="text-sm font-semibold text-slate-600">
                {items.length} {items.length === 1 ? 'item' : 'items'} added
              </p>
            </div>
          </div>
        </div>

        {/* Item List Container */}
        <div className="overflow-y-auto max-h-[calc(100vh-340px)] pr-1 space-y-4">
          {items.length === 0 ? (
            /* Empty Cart State */
            <div className="py-12 px-4 text-center space-y-4 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-300">
              <div className="w-16 h-16 mx-auto rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <p className="text-xl font-bold text-slate-800 leading-snug">
                Your order is empty — add items from the menu to get started.
              </p>
            </div>
          ) : (
            /* Item List */
            items.map((item) => (
              <div
                key={item.id || item.menu_item_id}
                className="p-4 rounded-2xl bg-slate-50 border-2 border-slate-200 flex flex-col gap-3 shadow-sm hover:border-slate-400 transition-colors"
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-950 leading-tight">
                      {item.item_name}
                    </h3>
                    {item.modifiers && (
                      <p className="text-sm font-bold text-sky-800 mt-0.5">
                        + {item.modifiers}
                      </p>
                    )}
                  </div>
                  <span className="text-xl font-black text-slate-950 whitespace-nowrap">
                    ₹{item.unit_price * item.quantity}
                  </span>
                </div>

                {/* Large Stepper Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="text-sm font-bold text-slate-600">
                    ₹{item.unit_price} each
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity && onUpdateQuantity(item, item.quantity - 1)}
                      disabled={isUpdating}
                      className="w-12 h-12 rounded-xl bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-950 flex items-center justify-center font-black focus:outline-none focus:ring-4 focus:ring-slate-950 focus:ring-offset-2 min-h-touch min-w-touch disabled:opacity-50"
                      aria-label={`Decrease quantity of ${item.item_name}`}
                    >
                      {item.quantity === 1 ? <Trash2 className="w-5 h-5 text-red-600" /> : <Minus className="w-6 h-6 stroke-[3]" />}
                    </button>

                    <span className="w-10 text-center text-2xl font-black text-slate-950" aria-live="polite">
                      {item.quantity}
                    </span>

                    <button
                      type="button"
                      onClick={() => onUpdateQuantity && onUpdateQuantity(item, item.quantity + 1)}
                      disabled={isUpdating}
                      className="w-12 h-12 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white flex items-center justify-center font-black focus:outline-none focus:ring-4 focus:ring-slate-950 focus:ring-offset-2 min-h-touch min-w-touch disabled:opacity-50"
                      aria-label={`Increase quantity of ${item.item_name}`}
                    >
                      <Plus className="w-6 h-6 stroke-[3]" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Fixed Bottom Total & Action */}
      <div className="pt-6 border-t-4 border-slate-300 space-y-4 mt-4 bg-white">
        <div className="flex items-center justify-between text-2xl md:text-3xl font-black text-slate-950">
          <span>Total</span>
          <span className="text-emerald-700">₹{total}</span>
        </div>

        <button
          type="button"
          onClick={onReviewOrder}
          disabled={items.length === 0 || isUpdating}
          className="w-full flex items-center justify-center gap-3 px-6 min-h-touch text-2xl font-black bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-600 focus:ring-offset-4 active:scale-[0.98] shadow-lg transition-all"
          aria-label="Review order"
        >
          <span>Review Order</span>
          <ArrowRight className="w-7 h-7 stroke-[3]" />
        </button>
      </div>
    </aside>
  );
}

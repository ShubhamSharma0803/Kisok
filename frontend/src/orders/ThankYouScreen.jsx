import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Sparkles,
  Utensils,
  ArrowRight,
  Receipt,
  Heart,
} from 'lucide-react';

const AUTO_REDIRECT_SECONDS = 8;

const formatPrice = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function ThankYouScreen() {
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state || {};
  const { itemCount, amountRupees } = state;

  const [secondsRemaining, setSecondsRemaining] = useState(AUTO_REDIRECT_SECONDS);

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/');
    }, AUTO_REDIRECT_SECONDS * 1000);

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [navigate]);

  const hasSpecifics = amountRupees !== undefined && amountRupees !== null && amountRupees > 0;

  return (
    <main className="min-h-screen bg-[#f5f0e8] text-[#211b17] font-sans flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-[#e7dccd] bg-[#fffaf3] px-6 py-5 md:px-10 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a66b3f]">
              THE KIOSK KITCHEN
            </p>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-[#211b17]">
              Order Confirmed
            </h1>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[#e7dccd] bg-white px-4 py-2 text-xs font-bold text-[#806f60] shadow-sm">
            <Heart className="h-4 w-4 text-[#a66b3f]" />
            <span>Thank You</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-8 md:px-10">
        <div className="overflow-hidden rounded-[2rem] border border-[#e5d9c8] bg-[#fffaf3] p-8 text-center shadow-[0_20px_50px_rgba(80,60,40,.08)] md:p-12">
          {/* Animated Success Badge */}
          <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#1f352d] text-[#e9bd67] shadow-xl md:h-28 md:w-28">
            <CheckCircle2 className="h-14 w-14 md:h-16 md:w-16" />
            <span className="absolute -top-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#b95f35] text-white shadow-md">
              <Sparkles className="h-4 w-4" />
            </span>
          </div>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#e8f0eb] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[#29483d]">
            <Utensils className="h-3.5 w-3.5" />
            Kitchen Order Placed
          </div>

          <h2 className="mt-4 font-display text-4xl font-bold text-[#211b17] md:text-5xl">
            Thank you for your order!
          </h2>

          <p className="mt-3 text-base leading-relaxed text-[#806f60] md:text-lg">
            Your meal is being prepared with fresh ingredients. Please take your receipt or note your order.
          </p>

          {/* Optional Order Specifics */}
          {hasSpecifics && (
            <div className="mt-8 rounded-2xl border border-[#e7dccd] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#f0e6d8] pb-3 text-xs font-bold uppercase tracking-wider text-[#a66b3f]">
                <div className="flex items-center gap-1.5">
                  <Receipt className="h-4 w-4" />
                  <span>Order Summary</span>
                </div>
                <span>Paid</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#806f60]">
                  {itemCount ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : 'Items confirmed'}
                </span>
                <span className="font-display text-2xl font-bold text-[#1f352d]">
                  {formatPrice(amountRupees)}
                </span>
              </div>
            </div>
          )}

          {/* Auto redirect notification */}
          <div className="mt-8 rounded-2xl bg-[#f7efe5] p-4 text-center">
            <p className="text-sm font-semibold text-[#806f60]">
              Returning to start screen in{' '}
              <span className="font-bold text-[#1f352d]">{secondsRemaining}s</span>...
            </p>
          </div>

          {/* Instant Return Button */}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-full bg-[#1f352d] px-8 text-base font-bold text-white shadow-lg transition hover:bg-[#29483d] active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-[#1f352d]/25"
            >
              <span>Start New Order</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e7dccd] bg-[#fffaf3] px-6 py-4 text-center text-xs font-medium text-[#a69688]">
        Enjoy your meal at The Kiosk Kitchen
      </footer>
    </main>
  );
}

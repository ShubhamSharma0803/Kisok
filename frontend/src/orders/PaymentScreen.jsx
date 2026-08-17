import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { useSession } from '../core/SessionContext';
import { useSessionSocket } from '../core/useSessionSocket';
import { createPayment, getOrder } from '../core/api';
import {
  QrCode,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  CreditCard,
  Sparkles,
} from 'lucide-react';

const formatPrice = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function PaymentScreen() {
  const navigate = useNavigate();
  const { sessionId } = useSession();
  const { subscribe } = useSessionSocket(sessionId);

  const [paymentLinkUrl, setPaymentLinkUrl] = useState('');
  const [amountRupees, setAmountRupees] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPaid, setIsPaid] = useState(false);

  const paidTimerRef = useRef(null);

  // 1. Initialize payment link and fetch order details on mount
  const generatePaymentLink = useCallback(async () => {
    if (!sessionId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [paymentData, orderData] = await Promise.all([
        createPayment(sessionId),
        getOrder(sessionId).catch(() => null),
      ]);

      if (orderData?.items) {
        setItemCount(orderData.items.length);
      }

      if (paymentData?.payment_link_url) {
        setPaymentLinkUrl(paymentData.payment_link_url);
        setAmountRupees(paymentData.amount_rupees || 0);

        try {
          const qrUrl = await QRCode.toDataURL(paymentData.payment_link_url, {
            width: 300,
            margin: 2,
            color: {
              dark: '#1f352d',
              light: '#ffffff',
            },
          });
          setQrDataUrl(qrUrl);
        } catch (qrErr) {
          console.error('[PaymentScreen] Failed to generate QR code data URL:', qrErr);
        }
      } else {
        throw new Error('No payment link received from server.');
      }
    } catch (err) {
      console.error('[PaymentScreen] Failed to create payment:', err);
      setError(err.message || 'Unable to generate payment link. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    generatePaymentLink();
  }, [generatePaymentLink]);

  // 2. Subscribe to WebSocket "order_paid" event and navigate to Thank You screen
  useEffect(() => {
    if (!sessionId) return;

    const unsubscribe = subscribe('order_paid', (payload) => {
      console.log('[PaymentScreen] order_paid event received:', payload);
      setIsPaid(true);

      if (paidTimerRef.current) {
        clearTimeout(paidTimerRef.current);
      }

      paidTimerRef.current = setTimeout(() => {
        navigate('/thank-you', {
          state: {
            itemCount,
            amountRupees,
          },
        });
      }, 1500);
    });

    return () => {
      unsubscribe();
      if (paidTimerRef.current) {
        clearTimeout(paidTimerRef.current);
      }
    };
  }, [sessionId, subscribe, navigate, itemCount, amountRupees]);

  return (
    <main className="min-h-screen bg-[#f5f0e8] text-[#211b17] font-sans">
      {/* Header */}
      <header className="border-b border-[#e7dccd] bg-[#fffaf3] px-6 py-5 md:px-10 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a66b3f]">
              THE KIOSK KITCHEN
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-[#211b17]">
              {isPaid ? 'Payment Received' : 'Scan & Pay'}
            </h1>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[#e7dccd] bg-white px-4 py-2 text-xs font-bold text-[#806f60] shadow-sm">
            <CreditCard className="h-4 w-4 text-[#a66b3f]" />
            <span>Razorpay Secure</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <section className="mx-auto max-w-4xl px-5 py-8 md:px-10">
        {/* State 1: Paid Success State */}
        {isPaid ? (
          <div className="mx-auto max-w-xl overflow-hidden rounded-[2rem] border border-[#d2dfd6] bg-[#fffaf3] p-8 text-center shadow-[0_20px_50px_rgba(31,53,45,.14)] md:p-12">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#e8f3ed] text-[#246b4f] shadow-inner">
              <CheckCircle2 className="h-14 w-14" />
            </div>

            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#e8f3ed] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[#246b4f]">
              <Sparkles className="h-3.5 w-3.5" />
              Confirmed
            </div>

            <h2 className="mt-4 font-display text-4xl font-bold text-[#1f352d] md:text-5xl">
              Payment received!
            </h2>
            <p className="mt-3 text-lg font-medium text-[#65584e]">
              Thank you! Your payment of{' '}
              <span className="font-bold text-[#1f352d]">{formatPrice(amountRupees)}</span> has been
              successfully verified.
            </p>
            <div className="mt-6 rounded-2xl border border-[#e7dccd] bg-white p-5">
              <p className="text-sm font-semibold text-[#806f60]">
                Your order has been sent to the kitchen and is being freshly prepared.
              </p>
            </div>
          </div>
        ) : isLoading ? (
          /* State 2: Loading State */
          <div className="mx-auto flex max-w-xl min-h-[55vh] flex-col items-center justify-center gap-4 rounded-[2rem] border border-[#e5d9c8] bg-[#fffaf3] p-12 text-center shadow-sm">
            <RefreshCw className="h-14 w-14 animate-spin text-[#9b5933]" />
            <p className="font-display text-3xl font-semibold text-[#241a14]">
              Generating Payment QR
            </p>
            <p className="text-base font-medium text-[#817166]">
              Connecting to secure payment gateway...
            </p>
          </div>
        ) : error ? (
          /* State 3: Error State */
          <div className="mx-auto max-w-xl rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-xl md:p-12">
            <AlertCircle className="mx-auto h-14 w-14 text-red-600" />
            <h2 className="mt-4 font-display text-3xl font-semibold text-red-950">
              Payment Generation Failed
            </h2>
            <p className="mt-3 text-base font-medium text-[#67594f]">{error}</p>
            <button
              type="button"
              onClick={generatePaymentLink}
              className="mt-6 min-h-touch rounded-full bg-[#1f352d] px-8 text-base font-bold text-white shadow-lg transition hover:bg-[#16261f] focus:outline-none focus:ring-4 focus:ring-[#1f352d]/25"
            >
              Retry Payment
            </button>
          </div>
        ) : (
          /* State 4: Active QR Payment View */
          <div className="mx-auto max-w-xl rounded-[2rem] border border-[#e5d9c8] bg-[#fffaf3] p-6 shadow-[0_20px_50px_rgba(80,60,40,.08)] md:p-10">
            {/* Amount Banner */}
            <div className="rounded-[1.5rem] bg-[#1f352d] p-6 text-center text-white shadow-[0_12px_28px_rgba(31,53,45,.2)]">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#e9bd67]">
                Amount to Pay
              </p>
              <p className="mt-2 font-display text-4xl md:text-5xl font-bold text-white">
                {formatPrice(amountRupees)}
              </p>
            </div>

            {/* QR Code Container */}
            <div className="mt-8 flex flex-col items-center justify-center">
              <div className="relative rounded-3xl border-4 border-[#e7dccd] bg-white p-4 shadow-md">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Scan to pay QR code"
                    className="h-64 w-64 md:h-72 md:w-72 rounded-2xl object-contain"
                  />
                ) : (
                  <div className="flex h-64 w-64 items-center justify-center bg-[#f7efe5] rounded-2xl text-[#806f60]">
                    <QrCode className="h-16 w-16 text-[#a66b3f] animate-pulse" />
                  </div>
                )}
              </div>

              <div className="mt-5 text-center">
                <p className="font-display text-2xl font-bold text-[#211b17]">
                  Scan with any UPI app
                </p>
                <p className="mt-1 text-sm font-medium text-[#806f60]">
                  GPay, PhonePe, Paytm, BHIM, or any banking app
                </p>
              </div>

              {/* Direct Link Fallback */}
              {paymentLinkUrl && (
                <div className="mt-6 w-full rounded-2xl border border-[#e7dccd] bg-white p-4 text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#928274]">
                    Cannot scan QR?
                  </p>
                  <a
                    href={paymentLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-[#b95f35] hover:text-[#9f4f29] hover:underline"
                  >
                    <span>Click here to open payment page</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              )}

              {/* Waiting Indicator */}
              <div className="mt-6 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-[#7b6b5d]">
                <RefreshCw className="h-4 w-4 animate-spin text-[#a66b3f]" />
                <span>Waiting for payment confirmation...</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

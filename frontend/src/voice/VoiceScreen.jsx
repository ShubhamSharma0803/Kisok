import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../core/SessionContext';
import { useHandoff } from '../core/HandoffProvider';
import { useSessionSocket } from '../core/useSessionSocket';
import {
  sendVoiceAudio,
  getOrder,
  deleteOrderItem,
  updateOrderItemQuantity,
} from '../core/api';
import CartSummary from '../orders/CartSummary';
import {
  Mic,
  Volume2,
  RefreshCw,
  Send,
  Hand,
  MessageSquare,
  ShoppingBag,
  ChevronUp,
} from 'lucide-react';

/**
 * State machine enum:
 * 'idle' | 'listening' | 'processing' | 'speaking'
 */
export default function VoiceScreen() {
  const navigate = useNavigate();
  const { sessionId } = useSession();
  const { reportFailedTap } = useHandoff();
  const { subscribe } = useSessionSocket(sessionId);

  const [voiceState, setVoiceState] = useState('idle'); // idle, listening, processing, speaking
  const [transcript, setTranscript] = useState('');
  const [latestCaption, setLatestCaption] = useState('Welcome! Say what you would like to order, e.g. "Add a Veg Burger and Cold Coffee"');
  const [order, setOrder] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  const [textInputStatus, setTextInputStatus] = useState('');

  const [autoListenEnabled, setAutoListenEnabled] = useState(true);
  const autoListenRef = useRef(true);
  const startRecordingRef = useRef(null);

  useEffect(() => {
    autoListenRef.current = autoListenEnabled;
  }, [autoListenEnabled]);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const maxRecordTimerRef = useRef(null);

  // Monotonically increasing counter: every new voice interaction increments this.
  // Used to discard stale WebSocket caption events from a previous interaction.
  const interactionIdRef = useRef(0);

  // Helper: Resume listening automatically if auto-listen mode is active
  const resumeListeningIfAuto = useCallback(() => {
    if (autoListenRef.current && startRecordingRef.current) {
      setTimeout(() => {
        if (autoListenRef.current && startRecordingRef.current) {
          startRecordingRef.current();
        } else {
          setVoiceState('idle');
        }
      }, 400); // 400ms buffer to prevent mic from picking up TTS audio tail
    } else {
      setVoiceState('idle');
    }
  }, []);

  // 1. Initial cart fetch
  useEffect(() => {
    if (!sessionId) return;
    getOrder(sessionId).then(setOrder).catch(() => {});
  }, [sessionId]);

  // 2. Subscribe to live WebSocket events
  useEffect(() => {
    if (!sessionId) return;

    const unsubTranscript = subscribe('voice_transcript', (payload) => {
      if (payload?.transcript) {
        setTranscript(payload.transcript);
      }
    });

    const unsubCaption = subscribe('caption', (payload) => {
      const eventInteraction = payload?._interaction_id;
      if (eventInteraction !== undefined && eventInteraction !== interactionIdRef.current) {
        return; // stale event — discard
      }
      if (payload?.text || payload?.caption) {
        setLatestCaption(payload.text || payload.caption);
      }
    });

    const unsubOrder = subscribe('order_updated', (payload) => {
      setOrder(payload);
    });

    const unsubProcessing = subscribe('processing', (payload) => {
      if (payload?.sub_state) {
        setVoiceState(payload.sub_state);
      }
    });

    const unsubNavigate = subscribe('navigate', (payload) => {
      if (payload?.target === 'menu' || payload?.target === 'order') {
        navigate('/order');
      } else if (payload?.target === 'start') {
        navigate('/');
      }
    });

    return () => {
      unsubTranscript();
      unsubCaption();
      unsubOrder();
      unsubProcessing();
      unsubNavigate();
    };
  }, [sessionId, subscribe, navigate]);

  // Helper: Play TTS audio base64 payload
  const playAudioB64 = useCallback((b64Audio) => {
    if (!b64Audio) {
      resumeListeningIfAuto();
      return;
    }
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      const audioUrl = `data:audio/mp3;base64,${b64Audio}`;
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      setVoiceState('speaking');
      audio.play().catch(() => {
        resumeListeningIfAuto();
      });
      audio.onended = () => {
        resumeListeningIfAuto();
      };
    } catch (e) {
      console.error('[VoiceScreen] TTS playback error:', e);
      resumeListeningIfAuto();
    }
  }, [resumeListeningIfAuto]);

  // Helper: Send captured audio blob to FastAPI voice backend
  const processAudioBlob = useCallback(async (blob) => {
    if (!sessionId) return;

    interactionIdRef.current += 1;
    setVoiceState('processing');
    setLatestCaption('Processing your voice...');
    setTranscript('');

    try {
      const response = await sendVoiceAudio(sessionId, blob);

      if (response.transcript) {
        setTranscript(response.transcript);
      }
      setLatestCaption(response.message || 'Done! Say your next item or "read my order".');
      if (response.order) {
        setOrder(response.order);
      }

      if (response.action === 'repeat_narration') {
        // ScreenNarrationBridge plays narration audio via WebSocket trigger
        resumeListeningIfAuto();
      } else if (response.tts_audio_b64) {
        playAudioB64(response.tts_audio_b64);
      } else {
        resumeListeningIfAuto();
      }
    } catch (err) {
      console.error('[VoiceScreen] Voice pipeline POST error:', err);
      setLatestCaption('Unable to process voice right now. Please try again or tap Touch Menu.');
      setVoiceState('idle');
      if (reportFailedTap) reportFailedTap();
    }
  }, [sessionId, reportFailedTap, playAudioB64, resumeListeningIfAuto]);

  // Clear timers
  const clearRecordTimers = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (maxRecordTimerRef.current) {
      clearTimeout(maxRecordTimerRef.current);
      maxRecordTimerRef.current = null;
    }
  };

  // Start MediaRecorder audio capture with 1.5s sustained silence auto-stop fallback
  const startRecording = useCallback(async () => {
    clearRecordTimers();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        clearRecordTimers();
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        stream.getTracks().forEach((track) => track.stop());
        if (audioBlob.size > 0) {
          processAudioBlob(audioBlob);
        } else {
          setVoiceState('idle');
        }
      };

      mediaRecorder.start();
      setVoiceState('listening');

      // Safety timeout: auto-stop after 10 seconds max recording duration
      maxRecordTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 10000);

    } catch (err) {
      console.error('[VoiceScreen] Mic access error:', err);
      alert('Microphone access required for voice ordering. You can also switch to Touch Menu.');
      setVoiceState('idle');
    }
  }, [processAudioBlob]);

  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  // Stop MediaRecorder capture
  const stopRecording = () => {
    clearRecordTimers();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  // Primary manual tap-to-stop handler
  const handleMicToggle = () => {
    if (voiceState === 'listening') {
      stopRecording();
    } else {
      startRecording();
    }
  };

  /**
   * ISSUE 1 FIX: Text fallback input mechanics.
   * Synthesizes typed text into a spoken audio Blob using Web Speech API SpeechSynthesisUtterance + Web Audio API stream recording,
   * then POSTs the generated audio blob to /sessions/{session_id}/voice!
   */
  const handleTextSubmit = async (e) => {
    e.preventDefault();
    const textToSpeak = textInput.trim();
    if (!textToSpeak || !sessionId) return;

    setTextInputStatus('Converting typed order to speech...');
    setVoiceState('processing');

    try {
      const SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
      const speechSynthesis = window.speechSynthesis;

      if (!SpeechSynthesisUtterance || !speechSynthesis) {
        throw new Error('SpeechSynthesis not supported');
      }

      // Record synthesized speech into a Blob
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      const mediaRecorder = new MediaRecorder(dest.stream);
      const chunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/wav' });
        setTextInput('');
        setTextInputStatus('');
        if (audioBlob.size > 0) {
          await processAudioBlob(audioBlob);
        } else {
          setVoiceState('idle');
        }
      };

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;

      mediaRecorder.start();

      utterance.onend = () => {
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        }, 300);
      };

      utterance.onerror = () => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      };

      speechSynthesis.speak(utterance);

    } catch (err) {
      console.log('[VoiceScreen] Text-to-speech synthesis fallback unavailable:', err.message);
      setTextInputStatus('Text ordering unavailable on this browser; switching to Touch Menu...');
      setTimeout(() => {
        navigate('/order');
      }, 1500);
    }
  };

  return (
  <main className="min-h-screen bg-[#f5f0e8] text-[#211b17] font-sans">

    {/* ================= HEADER ================= */}
    <header className="flex items-center justify-between px-6 md:px-10 py-5 border-b border-[#e7dccd] bg-[#fffaf3]">

      <div className="flex items-center gap-5">

        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-[#d8cbb9] bg-white text-[#211b17] shadow-sm transition hover:bg-[#f4eadc]"
        >
          <span className="text-2xl">←</span>
        </button>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a66b3f]">
            THE KIOSK KITCHEN
          </p>

          <h1 className="font-display text-4xl md:text-5xl font-bold text-[#211b17]">
            Talk to Order
          </h1>

          <p className="mt-1 text-sm md:text-base text-[#806f60]">
            Hands-free ordering in English, Hindi & Hinglish
          </p>
        </div>

      </div>

      <div className="flex items-center gap-3">

        {/* AUTO LISTEN */}
        <button
          type="button"
          onClick={() => {
            const next = !autoListenEnabled;
            setAutoListenEnabled(next);

            if (!next && voiceState === 'listening') {
              stopRecording();
            }
          }}
          className={`hidden md:flex items-center gap-3 rounded-full border px-5 py-3 font-bold transition ${
            autoListenEnabled
              ? 'border-[#d9c5a9] bg-white text-[#29483d]'
              : 'border-[#d9c5a9] bg-[#eee5d8] text-[#806f60]'
          }`}
        >
          <span
            className={`h-3 w-3 rounded-full ${
              autoListenEnabled
                ? 'bg-[#d7a94b] animate-pulse'
                : 'bg-[#aaa]'
            }`}
          />

          {autoListenEnabled
            ? 'Auto-listen ON'
            : 'Auto-listen OFF'}
        </button>

        {/* TOUCH MENU */}
        <button
          type="button"
          onClick={() => navigate('/order')}
          className="flex items-center gap-2 rounded-full bg-[#1f352d] px-5 py-3 font-bold text-white shadow-md transition hover:bg-[#29483d]"
        >
          <Hand className="h-5 w-5" />
          <span className="hidden sm:inline">
            Touch Menu
          </span>
        </button>

      </div>
    </header>


    {/* ================= MAIN CONTENT ================= */}
    <section className="mx-auto flex max-w-[1500px] flex-col px-5 py-7 md:px-10">

      {/* PREMIUM HERO */}
      <div className="relative overflow-hidden rounded-[2rem] bg-[#1f352d] px-7 py-8 md:px-10 md:py-10 shadow-[0_20px_50px_rgba(31,53,45,.18)]">

        <div className="absolute inset-0 opacity-20">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#d7a94b] blur-3xl" />
          <div className="absolute -bottom-20 left-1/3 h-64 w-64 rounded-full bg-[#a66b3f] blur-3xl" />
        </div>

        <div className="relative z-10">

          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#bfa77f]/50 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#e9bd67]">
            <Volume2 className="h-4 w-4" />
            Voice Ordering
          </div>

          <h2 className="max-w-4xl font-display text-4xl font-bold leading-[0.98] text-white md:text-6xl">
            Tell us what
            <br />
            you're craving.
          </h2>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#e8ddd0] md:text-lg">
            Speak naturally and we'll take care of the rest.
            Try saying:
            <span className="font-bold text-[#e9bd67]">
              {' '}“Add a Veg Burger and Cold Coffee”
            </span>
          </p>

        </div>
      </div>


      {/* ================= VOICE AREA ================= */}
      <div className="mt-7 grid gap-7 lg:grid-cols-[1.4fr_0.8fr]">

        {/* LEFT - MICROPHONE */}
        <div className="rounded-[2rem] border border-[#e5d9c8] bg-[#fffaf3] p-6 shadow-[0_15px_40px_rgba(80,60,40,.06)] md:p-8">

          <div className="mb-6 flex items-center justify-between">

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#a66b3f]">
                YOUR VOICE
              </p>

              <h3 className="mt-1 font-display text-3xl font-bold text-[#211b17]">
                Start speaking
              </h3>
            </div>

            <div
              className={`rounded-full px-4 py-2 text-xs font-bold ${
                voiceState === 'listening'
                  ? 'bg-[#e8f0eb] text-[#29483d]'
                  : voiceState === 'processing'
                  ? 'bg-[#f6ead0] text-[#9a6b21]'
                  : voiceState === 'speaking'
                  ? 'bg-[#e7f1ec] text-[#267052]'
                  : 'bg-[#eee5d8] text-[#806f60]'
              }`}
            >
              {voiceState === 'listening'
                ? 'Listening'
                : voiceState === 'processing'
                ? 'Processing'
                : voiceState === 'speaking'
                ? 'Speaking'
                : 'Ready'}
            </div>

          </div>


          {/* MICROPHONE */}
          <div className="flex flex-col items-center justify-center py-8">

            <div className="relative flex items-center justify-center">

              {voiceState === 'listening' && (
                <>
                  <span className="absolute h-64 w-64 animate-ping rounded-full bg-[#d7a94b]/20" />
                  <span className="absolute h-52 w-52 rounded-full border border-[#d7a94b]/40" />
                </>
              )}

              {voiceState === 'speaking' && (
                <span className="absolute h-60 w-60 animate-pulse rounded-full bg-[#29483d]/15" />
              )}

              <button
                type="button"
                onClick={handleMicToggle}
                className={`relative flex h-40 w-40 md:h-44 md:w-44 items-center justify-center rounded-full border-[10px] shadow-2xl transition-all duration-300 ${
                  voiceState === 'listening'
                    ? 'scale-105 border-[#e9bd67] bg-[#29483d] text-white'
                    : voiceState === 'processing'
                    ? 'border-[#e9bd67] bg-[#8c6335] text-white'
                    : voiceState === 'speaking'
                    ? 'border-[#8eb19f] bg-[#29483d] text-white'
                    : 'border-[#d8cbb9] bg-[#1f352d] text-white hover:scale-105 hover:bg-[#29483d]'
                }`}
                aria-label={
                  voiceState === 'listening'
                    ? 'Stop listening and send order'
                    : 'Start voice ordering'
                }
              >

                {voiceState === 'processing' ? (
                  <RefreshCw className="h-16 w-16 animate-spin" />
                ) : voiceState === 'speaking' ? (
                  <Volume2 className="h-16 w-16 animate-bounce" />
                ) : (
                  <Mic
  className={`h-16 w-16 ${
                      voiceState === 'listening'
                        ? 'animate-pulse'
                        : ''
                    }`}
                    strokeWidth={2}
                  />
                )}

              </button>

            </div>


            <h3 className="mt-10 text-center font-display text-3xl font-bold text-[#211b17] md:text-4xl">
              {voiceState === 'listening'
                ? 'Listening...'
                : voiceState === 'processing'
                ? 'Processing your order...'
                : voiceState === 'speaking'
                ? 'Kiosk is responding...'
                : 'Tap the mic to order'}
            </h3>

            <p className="mt-3 max-w-xl text-center text-base leading-relaxed text-[#806f60] md:text-lg">
              {voiceState === 'listening'
                ? autoListenEnabled
                  ? 'Speak naturally. Listening will continue automatically.'
                  : 'Tap the microphone again when you finish speaking.'
                : 'Try English, Hindi, or Hinglish. For example: “Ek Samosa and Cold Coffee”.'}
            </p>

          </div>

        </div>


        {/* RIGHT - LIVE CAPTION */}
        <div className="flex flex-col gap-5">

          <div
  className="rounded-[2rem] bg-[#1f352d] p-7 text-white shadow-[0_15px_40px_rgba(31,53,45,.18)]"
            role="region"
            aria-label="Live Spoken Captions"
            aria-live={voiceState === 'speaking' ? 'assertive' : 'polite'}
            aria-atomic="true"
          >

            <div className="flex items-center gap-3 border-b border-white/10 pb-5">

              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#29483d]">
                <Volume2 className="h-5 w-5 text-[#e9bd67]" />
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e9bd67]">
                  Live Caption
                </p>

                <p className="text-sm text-[#cfc5b9]">
                  What the kiosk hears
                </p>
              </div>

            </div>

            <p className="mt-7 font-display text-2xl font-semibold leading-[1.5] text-[#fffaf3] md:text-3xl">
              "{latestCaption}"
            </p>

            {transcript && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.07] p-4">

                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#e9bd67]">
                  <MessageSquare className="h-4 w-4" />
                  You said
                </div>

                <p className="mt-2 text-base font-semibold leading-relaxed text-[#f5eee5]">
                  "{transcript}"
                </p>

              </div>
            )}

          </div>


          {/* QUICK INFO CARD */}
          <div className="rounded-[2rem] border border-[#e5d9c8] bg-white p-6">

            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a66b3f]">
              HOW IT WORKS
            </p>

            <div className="mt-5 space-y-4">

              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eee5d8] font-bold text-[#a66b3f]">
                  1
                </div>
                <p className="font-semibold text-[#4d4036]">
                  Tap the microphone
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eee5d8] font-bold text-[#a66b3f]">
                  2
                </div>
                <p className="font-semibold text-[#4d4036]">
                  Tell us your order
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eee5d8] font-bold text-[#a66b3f]">
                  3
                </div>
                <p className="font-semibold text-[#4d4036]">
                  Review and confirm
                </p>
              </div>

            </div>

          </div>

        </div>

      </div>


      {/* ================= TEXT FALLBACK ================= */}
      <form
        onSubmit={handleTextSubmit}
        className="mt-7 rounded-[2rem] border border-[#e5d9c8] bg-white p-5 shadow-sm"
      >

        {textInputStatus && (
          <p className="mb-3 text-center text-sm font-bold text-[#a66b3f]">
            {textInputStatus}
          </p>
        )}

        <div className="flex flex-col gap-3 md:flex-row">

          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Or type your order request..."
            className="flex-1 rounded-2xl border border-[#d8cbb9] bg-[#fffaf3] px-5 py-4 text-lg font-semibold text-[#211b17] outline-none transition placeholder:text-[#a99b8d] focus:border-[#29483d]"
            aria-label="Type your order request as an alternative to voice"
          />

          <button
            type="submit"
            disabled={!textInput.trim() || voiceState === 'processing'}
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#1f352d] px-7 py-4 font-bold text-white transition hover:bg-[#29483d] disabled:cursor-not-allowed disabled:bg-[#c8c0b7]"
          >
            <Send className="h-5 w-5" />
            Submit Order
          </button>

        </div>

      </form>

    </section>


    {/* ================= BLINKIT STYLE CART ================= */}
    {order?.items?.length > 0 && (
      <>

        {/* CART POPUP */}
        {showMobileCart && (
          <div className="fixed bottom-[88px] left-1/2 z-50 max-h-[65vh] w-[92%] max-w-xl -translate-x-1/2 overflow-y-auto rounded-[1.75rem] border border-[#e5d9c8] bg-[#fffaf3] shadow-2xl">

            <CartSummary
              order={order}
              onUpdateQuantity={async (item, newQuantity) => {
                if (!sessionId || !item?.id) return;

                setIsUpdatingOrder(true);

                try {
                  let updatedOrder;

                  if (newQuantity <= 0) {
                    updatedOrder = await deleteOrderItem(
                      sessionId,
                      item.id
                    );
                  } else {
                    updatedOrder = await updateOrderItemQuantity(
                      sessionId,
                      item.id,
                      newQuantity
                    );
                  }

                  setOrder(updatedOrder);
                } catch (err) {
                  console.error(
                    '[VoiceScreen] Failed to update cart:',
                    err
                  );
                } finally {
                  setIsUpdatingOrder(false);
                }
              }}
              onReviewOrder={() => navigate('/order')}
              isUpdating={isUpdatingOrder}
            />

          </div>
        )}


        {/* FLOATING CART BUTTON */}
        <div className="fixed bottom-5 left-1/2 z-40 w-[92%] max-w-md -translate-x-1/2">

          <button
            type="button"
            onClick={() => setShowMobileCart(!showMobileCart)}
            className="flex w-full items-center justify-between rounded-[1.25rem] bg-[#1f352d] px-5 py-4 text-white shadow-[0_15px_40px_rgba(31,53,45,.3)] transition hover:bg-[#29483d] active:scale-[0.98]"
          >

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#29483d]">
                <ShoppingBag className="h-5 w-5 text-[#e9bd67]" />
              </div>

              <div className="text-left">
                <p className="font-bold">
                  View your order
                </p>

                <p className="text-xs text-white/60">
                  {order.items.length}{' '}
                  {order.items.length === 1
                    ? 'item'
                    : 'items'}
                </p>
              </div>

            </div>

            <div className="flex items-center gap-3">

              <span className="font-display text-xl font-bold text-[#e9bd67]">
                ₹{order?.total || 0}
              </span>

              <ChevronUp
                className={`h-5 w-5 transition-transform ${
                  showMobileCart ? 'rotate-180' : ''
                }`}
              />

            </div>

          </button>

        </div>

      </>
    )}

  </main>
);
}
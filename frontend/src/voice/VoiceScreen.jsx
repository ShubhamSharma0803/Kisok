import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../core/SessionContext';
import { useHandoff } from '../core/HandoffProvider';
import { useSessionSocket } from '../core/useSessionSocket';
import { sendVoiceAudio, getOrder } from '../core/api';
import CartSummary from '../orders/CartSummary';
import {
  Mic,
  Volume2,
  RefreshCw,
  Send,
  Hand,
  MessageSquare,
  AlertCircle,
  HelpCircle,
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
    <main className="min-h-screen bg-slate-100 text-slate-900 flex flex-col lg:flex-row overflow-hidden font-sans">
      {/* LEFT SECTION: Voice Assistant Interface */}
      <section className="flex-1 flex flex-col justify-between p-6 md:p-10 h-screen overflow-y-auto border-r-4 border-slate-300">
        {/* Header navigation bar */}
        <header className="flex items-center justify-between border-b-4 border-slate-300 pb-6 shrink-0 gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-900 font-extrabold text-base focus:outline-none focus:ring-4 focus:ring-slate-950 min-h-touch"
            >
              ← Start Over
            </button>

            <div>
              <h1 className="text-3xl md:text-4xl font-black text-slate-950 tracking-tight">
                Voice Assistant
              </h1>
              <p className="text-lg text-slate-700 font-medium">
                Hands-free conversational ordering (English & Hindi)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto-listen toggle control */}
            <button
              type="button"
              onClick={() => {
                const next = !autoListenEnabled;
                setAutoListenEnabled(next);
                if (!next && voiceState === 'listening') {
                  stopRecording();
                }
              }}
              className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border-2 font-bold text-base transition-all shadow-sm focus:outline-none focus:ring-4 min-h-touch ${
                autoListenEnabled
                  ? 'bg-sky-100 border-sky-400 text-sky-950 hover:bg-sky-200 focus:ring-sky-400'
                  : 'bg-slate-200 border-slate-400 text-slate-700 hover:bg-slate-300 focus:ring-slate-400'
              }`}
              title="Toggle automatic turn-based conversation listening"
            >
              <span className={`w-3.5 h-3.5 rounded-full ${autoListenEnabled ? 'bg-sky-500 animate-pulse' : 'bg-slate-400'}`} />
              <span>{autoListenEnabled ? 'Auto-Listen: ON' : 'Auto-Listen: PAUSED'}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/order')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-lg focus:outline-none focus:ring-4 focus:ring-emerald-600 min-h-touch shadow-md"
            >
              <Hand className="w-6 h-6" />
              <span>Switch to Touch Menu</span>
            </button>
          </div>
        </header>

        {/* ISSUE 2 FIX: ALWAYS-VISIBLE LIVE CAPTION CONTAINER WITH ARIA-LIVE ACCESSIBILITY */}
        <div 
          className="my-6 p-6 md:p-8 rounded-3xl bg-slate-950 text-white border-4 border-sky-400 shadow-2xl space-y-4"
          role="region"
          aria-label="Live Spoken Captions"
          aria-live={voiceState === 'speaking' ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3 text-sky-400 text-sm font-black uppercase tracking-wider">
              <Volume2 className="w-6 h-6 animate-pulse" />
              <span>Live Kiosk Caption</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${autoListenEnabled ? 'bg-sky-900/80 text-sky-200 border border-sky-500' : 'bg-slate-800 text-slate-400'}`}>
                {autoListenEnabled ? '🔄 Auto-Turn Mode' : '✋ Tap Mode'}
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-800 text-xs font-mono text-slate-300">
                WCAG AAA Accessible
              </span>
            </div>
          </div>

          <p className="text-2xl md:text-3xl font-extrabold leading-relaxed text-slate-50">
            "{latestCaption}"
          </p>

          {transcript && (
            <div className="pt-2 border-t border-slate-800 flex items-center gap-2 text-slate-300 text-lg font-medium">
              <MessageSquare className="w-5 h-5 text-sky-400 shrink-0" />
              <span>You said: <strong className="text-white font-bold">"{transcript}"</strong></span>
            </div>
          )}
        </div>

        {/* CENTRAL VISUAL MIC STATE INDICATOR */}
        <div className="flex flex-col items-center justify-center my-auto py-8 text-center space-y-8">
          {/* Main State Machine Mic Ring */}
          <div className="relative flex items-center justify-center">
            {/* Listening Wave Pulse Outer Ring */}
            {voiceState === 'listening' && (
              <span className="absolute w-56 h-56 rounded-full bg-sky-400/30 animate-ping" aria-hidden="true" />
            )}

            {/* Speaking Pulse Outer Ring */}
            {voiceState === 'speaking' && (
              <span className="absolute w-56 h-56 rounded-full bg-emerald-400/30 animate-pulse" aria-hidden="true" />
            )}

            <button
              type="button"
              onClick={handleMicToggle}
              className={`
                relative w-44 h-44 rounded-full flex items-center justify-center
                border-8 shadow-2xl transition-all duration-200 cursor-pointer
                focus:outline-none focus:ring-8 focus:ring-offset-4 focus:ring-offset-slate-100
                min-h-touch min-w-touch
                ${
                  voiceState === 'listening'
                    ? 'bg-sky-600 border-sky-300 text-white scale-105 focus:ring-sky-400'
                    : voiceState === 'processing'
                    ? 'bg-amber-500 border-amber-300 text-white focus:ring-amber-400'
                    : voiceState === 'speaking'
                    ? 'bg-emerald-600 border-emerald-300 text-white focus:ring-emerald-400'
                    : 'bg-slate-900 border-slate-950 text-white hover:bg-slate-800 focus:ring-slate-950'
                }
              `}
              aria-label={
                voiceState === 'listening'
                  ? 'Stop listening and send order'
                  : 'Start voice ordering'
              }
            >
              {voiceState === 'processing' ? (
                <RefreshCw className="w-20 h-20 animate-spin" />
              ) : voiceState === 'speaking' ? (
                <Volume2 className="w-20 h-20 animate-bounce" />
              ) : (
                <Mic className={`w-20 h-20 ${voiceState === 'listening' ? 'animate-pulse' : ''}`} strokeWidth={2.5} />
              )}
            </button>
          </div>

          {/* Plain Language State Banner */}
          <div className="space-y-2">
            <h2 className="text-3xl md:text-4xl font-black text-slate-950">
              {voiceState === 'listening'
                ? 'Listening... Speak Now'
                : voiceState === 'processing'
                ? 'Processing Your Order...'
                : voiceState === 'speaking'
                ? 'Kiosk Spoken Response...'
                : 'Tap Mic or Start Speaking'}
            </h2>
            <p className="text-xl text-slate-700 font-semibold max-w-md mx-auto">
              {voiceState === 'listening'
                ? autoListenEnabled ? 'Auto-listening active: Mic reopens automatically after response.' : 'Tap mic button when finished speaking to send.'
                : 'Supports English, Hindi, or Hinglish (e.g., "Ek Samosa and Cold Coffee").'}
            </p>
          </div>
        </div>

        {/* ISSUE 1 FIX: SYNTHESIZED TEXT FALLBACK INPUT */}
        <form onSubmit={handleTextSubmit} className="pt-4 shrink-0 space-y-2">
          {textInputStatus && (
            <p className="text-sm font-bold text-sky-800 text-center animate-pulse">
              {textInputStatus}
            </p>
          )}

          <div className="flex items-center gap-3 p-2 rounded-2xl bg-white border-4 border-slate-300 shadow-md focus-within:border-slate-800">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Or type order request (e.g., Veg Burger, Samosa)..."
              className="flex-1 px-4 py-3 text-xl font-bold bg-transparent text-slate-950 placeholder-slate-400 focus:outline-none"
              aria-label="Type your order request as an alternative to voice"
            />
            <button
              type="submit"
              disabled={!textInput.trim() || voiceState === 'processing'}
              className="px-6 min-h-touch text-xl font-black bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl focus:outline-none focus:ring-4 focus:ring-slate-950 flex items-center gap-2"
            >
              <span>Submit</span>
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </section>

      {/* RIGHT SECTION: Cart Summary Panel */}
      <section className="w-full lg:w-[440px] shrink-0 h-screen overflow-hidden border-t-4 lg:border-t-0 lg:border-l-4 border-slate-300">
        <CartSummary
          order={order}
          onUpdateQuantity={() => {}}
          onReviewOrder={() => navigate('/order')}
          isUpdating={isUpdatingOrder}
        />
      </section>
    </main>
  );
}

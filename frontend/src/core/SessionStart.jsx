import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from './SessionContext';
import { Mic, Hand, Eye, RefreshCw, AlertCircle, Volume2, Sparkles } from 'lucide-react';

import { triggerScreenNarration } from './api';

/**
 * Mode cards metadata matching SessionMode backend enums:
 * - voice_first -> /voice
 * - simplified_ui -> /order
 * - gaze_active -> /gaze
 */
const MODE_CARDS = [
  {
    id: 'voice_first',
    route: '/voice',
    title: 'Talk to order',
    icon: Mic,
    badgeText: 'Voice Mode',
    borderColor: 'border-sky-600 hover:border-sky-800 focus:ring-sky-600',
    iconBg: 'bg-sky-100 text-sky-800 border-2 border-sky-300',
    badgeBg: 'bg-sky-100 text-sky-900 border border-sky-300',
    actionText: 'text-sky-800 group-hover:text-sky-950',
    description: 'Speak naturally in English or Hindi to place your order hands-free.',
  },
  {
    id: 'simplified_ui',
    route: '/order',
    title: 'Tap to order',
    icon: Hand,
    badgeText: 'Touch Mode',
    borderColor: 'border-emerald-600 hover:border-emerald-800 focus:ring-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-800 border-2 border-emerald-300',
    badgeBg: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
    actionText: 'text-emerald-800 group-hover:text-emerald-950',
    description: 'Use large icons and step-by-step guidance on screen at your own pace.',
  },
  {
    id: 'gaze_active',
    route: '/gaze',
    title: 'Look to order',
    icon: Eye,
    badgeText: 'Gaze Mode',
    borderColor: 'border-purple-600 hover:border-purple-800 focus:ring-purple-600',
    iconBg: 'bg-purple-100 text-purple-800 border-2 border-purple-300',
    badgeBg: 'bg-purple-100 text-purple-900 border border-purple-300',
    actionText: 'text-purple-800 group-hover:text-purple-950',
    description: 'Look at items on screen for 1 to 2 seconds to select them without touching.',
  },
];

export default function SessionStart({ onNavigate }) {
  const navigate = useNavigate();
  const {
    sessionId,
    sessionMode,
    isLoadingSession,
    sessionError,
    initSession,
    setSessionMode,
  } = useSession();

  const [isListening, setIsListening] = useState(false);
  const [speechDetected, setSpeechDetected] = useState(false);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);

  // 1. Initialize session on mount
  useEffect(() => {
    if (!sessionId && !isLoadingSession && !sessionError) {
      initSession();
    }
  }, [sessionId, isLoadingSession, sessionError, initSession]);

  // Automatic screen narration on load in voice_first mode
  const narratedRef = useRef(false);
  useEffect(() => {
    if (sessionId && sessionMode === 'voice_first' && !narratedRef.current) {
      narratedRef.current = true;
      triggerScreenNarration(sessionId, 'start');
    }
  }, [sessionId, sessionMode]);

  // Mode selection handler
  const handleSelectMode = useCallback((modeId) => {
    stopMicListening();
    setSessionMode(modeId);

    const targetCard = MODE_CARDS.find((c) => c.id === modeId);
    const targetRoute = targetCard ? targetCard.route : '/order';

    if (onNavigate) {
      onNavigate(modeId);
    }
    navigate(targetRoute);
  }, [setSessionMode, onNavigate, navigate]);

  // Cleanup microphone resources
  const stopMicListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsListening(false);
  };

  /**
   * Real speech-presence detection:
   * 1. Prefers Web Speech API (SpeechRecognition) for true word/phoneme speech detection
   *    (prevents ambient noise/registers/chatter from false triggering).
   * 2. Falls back to an adaptive noise-floor calibrated volume threshold check.
   */
  useEffect(() => {
    if (!sessionId || speechDetected) return;

    let isSubscribed = true;

    // Check Web Speech API availability
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          if (isSubscribed) setIsListening(true);
        };

        recognition.onresult = (event) => {
          if (!isSubscribed) return;
          // Valid speech hypothesis detected
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i][0].transcript.trim().length > 0) {
              setSpeechDetected(true);
              stopMicListening();
              handleSelectMode('voice_first');
              return;
            }
          }
        };

        recognition.onerror = (err) => {
          console.log('[SessionStart] SpeechRecognition error:', err.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          if (isSubscribed && !speechDetected) {
            setIsListening(false);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
        return () => {
          isSubscribed = false;
          stopMicListening();
        };
      } catch (e) {
        console.log('[SessionStart] Web Speech API init failed, using adaptive fallback');
      }
    }

    // Adaptive noise-floor calibration fallback
    async function startAdaptiveMicDetection() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (!isSubscribed) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        setIsListening(true);

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let ambientNoiseFloor = 0;
        let calibrationSamples = 0;
        let voiceSpeechCount = 0;

        const processFrame = () => {
          if (!isSubscribed || !audioContextRef.current) return;
          analyser.getByteFrequencyData(dataArray);

          const sum = dataArray.reduce((acc, val) => acc + val, 0);
          const currentVol = sum / dataArray.length;

          // First ~30 frames (~500ms): measure ambient environment background noise floor
          if (calibrationSamples < 30) {
            ambientNoiseFloor = ((ambientNoiseFloor * calibrationSamples) + currentVol) / (calibrationSamples + 1);
            calibrationSamples += 1;
          } else {
            // Speech must exceed ambient noise floor by +25 dB margin for sustained frames
            const dynamicSpeechThreshold = Math.max(35, ambientNoiseFloor + 25);
            if (currentVol > dynamicSpeechThreshold) {
              voiceSpeechCount += 1;
              if (voiceSpeechCount >= 6) { // ~200ms of sustained speech above noise floor
                setSpeechDetected(true);
                stopMicListening();
                handleSelectMode('voice_first');
                return;
              }
            } else {
              voiceSpeechCount = Math.max(0, voiceSpeechCount - 1);
            }
          }

          requestAnimationFrame(processFrame);
        };

        processFrame();
      } catch (err) {
        setIsListening(false);
      }
    }

    startAdaptiveMicDetection();

    return () => {
      isSubscribed = false;
      stopMicListening();
    };
  }, [sessionId, speechDetected, handleSelectMode]);

  return (
    <main 
      className="min-h-screen bg-slate-100 text-slate-900 flex flex-col justify-between p-6 md:p-12 font-sans"
      aria-label="Kiosk Session Start"
    >
      {/* Header section — Glare-resistant ultra-high contrast light theme */}
      <header className="max-w-5xl mx-auto w-full text-center space-y-4 pt-4">
        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-slate-900 text-slate-100 text-base font-bold shadow-sm">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <span>Accessible Touchscreen Kiosk</span>
        </div>
        
        <h1 className="text-4xl md:text-6xl font-black tracking-tight text-slate-950">
          Welcome! How would you like to order?
        </h1>
        
        <p className="text-xl md:text-2xl text-slate-800 max-w-3xl mx-auto font-medium leading-relaxed">
          Select an ordering method below. Touch any card or start speaking.
        </p>

        {/* Real speech presence auto-detection indicator */}
        {isListening && !sessionError && (
          <div 
            className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-sky-900 border-2 border-sky-600 text-white text-lg font-bold shadow-md"
            role="status"
            aria-live="polite"
          >
            <Volume2 className="w-7 h-7 text-sky-300 animate-pulse" />
            <span>Listening for voice... Say anything to start, or tap a card</span>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto w-full my-auto py-8">
        {/* Loading State */}
        {isLoadingSession && (
          <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center">
            <RefreshCw className="w-14 h-14 text-sky-700 animate-spin" />
            <p className="text-3xl font-extrabold text-slate-900">Connecting to Kiosk System...</p>
          </div>
        )}

        {/* Error State with Plain Language Retry Button */}
        {sessionError && !isLoadingSession && (
          <div 
            className="max-w-2xl mx-auto p-10 rounded-3xl bg-red-50 border-4 border-red-600 text-slate-950 text-center space-y-6 shadow-xl"
            role="alert"
          >
            <div className="flex justify-center">
              <AlertCircle className="w-20 h-20 text-red-600" />
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-black text-red-950">System Connection Delayed</h2>
              <p className="text-2xl text-slate-800 font-medium">{sessionError}</p>
            </div>
            <button
              type="button"
              onClick={initSession}
              className="inline-flex items-center justify-center gap-3 px-10 min-h-touch text-2xl font-black bg-red-700 hover:bg-red-800 text-white rounded-2xl focus:outline-none focus:ring-4 focus:ring-red-900 focus:ring-offset-4 focus:ring-offset-slate-100 active:scale-[0.98] shadow-lg transition-all"
            >
              <RefreshCw className="w-7 h-7" />
              <span>Retry Connection</span>
            </button>
          </div>
        )}

        {/* Mode Cards Grid (shown when session is ready) */}
        {!isLoadingSession && !sessionError && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {MODE_CARDS.map((card) => {
              const IconComponent = card.icon;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleSelectMode(card.id)}
                  className={`
                    group relative flex flex-col justify-between text-left p-8 md:p-10 rounded-3xl
                    bg-white border-4 ${card.borderColor} shadow-xl
                    focus:outline-none focus:ring-4 focus:ring-slate-950 focus:ring-offset-4 focus:ring-offset-slate-100
                    active:scale-[0.98] min-h-[380px] cursor-pointer transition-all duration-150
                  `}
                  aria-label={`${card.title}. ${card.description}`}
                >
                  <div className="space-y-6">
                    {/* Badge */}
                    <div className="flex items-center justify-between">
                      <span className={`px-4 py-2 rounded-xl text-base font-extrabold tracking-wide uppercase ${card.badgeBg}`}>
                        {card.badgeText}
                      </span>
                    </div>

                    {/* Icon & Title */}
                    <div className="space-y-4">
                      <div className={`w-24 h-24 rounded-2xl flex items-center justify-center ${card.iconBg}`}>
                        <IconComponent className="w-14 h-14" strokeWidth={3} />
                      </div>
                      
                      <h2 className="text-4xl md:text-5xl font-black text-slate-950">
                        {card.title}
                      </h2>
                    </div>

                    {/* Plain Language Explanation */}
                    <p className="text-xl md:text-2xl text-slate-800 font-semibold leading-normal">
                      {card.description}
                    </p>
                  </div>

                  {/* Touch Target Action Prompt */}
                  <div className={`pt-6 border-t-2 border-slate-200 flex items-center justify-between text-2xl font-black ${card.actionText}`}>
                    <span>Select Mode</span>
                    <span className="text-3xl group-hover:translate-x-2 transition-transform" aria-hidden="true">→</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Accessibility Footer Notice */}
      <footer className="max-w-5xl mx-auto w-full text-center text-slate-700 text-xl font-bold border-t-2 border-slate-300 pt-6">
        <p>Press <kbd className="px-3 py-1 bg-slate-200 border-2 border-slate-400 rounded-lg text-slate-950 text-xl font-mono">Tab</kbd> to navigate cards with a keyboard or switch device.</p>
      </footer>
    </main>
  );
}

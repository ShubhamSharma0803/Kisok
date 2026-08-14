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
    borderColor: 'border-[#e3d7c8] hover:border-[#cdbca7] focus:ring-[#b66b3c]/20',
iconBg: 'bg-[#f3eadf] text-[#8b5e34] border border-[#e3d4c2]',
badgeBg: 'bg-[#edf4f1] text-[#315448] border border-[#cbded6]',
actionText: 'text-[#8b5e34] group-hover:text-[#6f4327]',
    description: 'Speak naturally in English or Hindi to place your order hands-free.',
  },
  {
    id: 'simplified_ui',
    route: '/order',
    title: 'Tap to order',
    icon: Hand,
    badgeText: 'Touch Mode',
    borderColor: 'border-[#e3d7c8] hover:border-[#cdbca7] focus:ring-[#b66b3c]/20',
iconBg: 'bg-[#f3eadf] text-[#8b5e34] border border-[#e3d4c2]',
badgeBg: 'bg-[#edf4f1] text-[#315448] border border-[#cbded6]',
actionText: 'text-[#8b5e34] group-hover:text-[#6f4327]',
    description: 'Use large icons and step-by-step guidance on screen at your own pace.',
  },
  {
    id: 'gaze_active',
    route: '/gaze',
    title: 'Look to order',
    icon: Eye,
    badgeText: 'Gaze Mode',
    borderColor: 'border-[#e3d7c8] hover:border-[#cdbca7] focus:ring-[#b66b3c]/20',
iconBg: 'bg-[#f3eadf] text-[#8b5e34] border border-[#e3d4c2]',
badgeBg: 'bg-[#f3eee8] text-[#76563e] border border-[#dfd1c2]',
actionText: 'text-[#8b5e34] group-hover:text-[#6f4327]',
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
  className="min-h-screen bg-[#f4efe7] text-[#211b17] flex flex-col justify-between px-6 py-8 md:px-10 md:py-10 font-sans relative overflow-hidden"
  aria-label="Kiosk Session Start"
>
  {/* Premium background accents */}
<div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-[#e8dccb]/40 blur-3xl pointer-events-none" />

<div className="absolute -bottom-40 -left-40 w-[28rem] h-[28rem] rounded-full bg-[#dce8e1]/40 blur-3xl pointer-events-none" />

      {/* Header section — Glare-resistant ultra-high contrast light theme */}
      <header className="relative z-10 max-w-6xl mx-auto w-full text-center space-y-5 pt-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#21382f] text-white text-xs md:text-sm font-bold uppercase tracking-[0.14em] shadow-[0_8px_24px_rgba(33,56,47,.16)]">
  <Sparkles className="w-4 h-4 text-[#e8b65a]" />
  <span>Accessible Touchscreen Kiosk</span>
</div>
        
        <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-semibold tracking-[-0.03em] text-[#211b17] leading-[1.05]">
  Welcome! How would you like to order?
</h1>
        
        <p className="text-base md:text-lg text-[#796a5d] max-w-2xl mx-auto font-medium leading-relaxed">
  Choose the way that feels most comfortable for you.
  <span className="block mt-1 text-[#9a8d81]">
    Touch a card or simply start speaking.
  </span>
</p>

        {/* Real speech presence auto-detection indicator */}
        {isListening && !sessionError && (
  <div
    className="inline-flex items-center gap-3 px-5 py-3 rounded-full bg-[#21382f] border border-[#3b554b] text-white text-sm md:text-base font-semibold shadow-[0_10px_30px_rgba(33,56,47,.18)]"
    role="status"
    aria-live="polite"
  >
    <div className="w-8 h-8 rounded-full bg-[#304b40] flex items-center justify-center">
      <Volume2 className="w-4 h-4 text-[#e8b65a] animate-pulse" />
    </div>

    <span>
      Listening for voice...
    </span>

    <span className="text-white/50">•</span>

    <span className="text-white/70">
      Say anything to start
    </span>
  </div>
)}
      </header>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto w-full my-auto py-8">
        {/* Loading State */}
        {isLoadingSession && (
          <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center">
            <RefreshCw className="w-12 h-12 text-[#8b5e34] animate-spin" />

<p className="font-display text-2xl md:text-3xl font-semibold text-[#2a201a]">
  Connecting to Kiosk System...
</p>
          </div>
        )}

        {/* Error State with Plain Language Retry Button */}
        {sessionError && !isLoadingSession && (
          <div 
            className="max-w-2xl mx-auto p-10 rounded-[2rem] bg-[#fffdfa] border border-[#e5d7c8] text-[#2a201a] text-center space-y-6 shadow-[0_20px_50px_rgba(76,49,28,.12)]"
            role="alert"
          >
            <div className="flex justify-center">
             <AlertCircle className="w-16 h-16 text-[#b96235]" />
            </div>
            <div className="space-y-3">
             <h2 className="font-display text-3xl font-semibold text-[#2a201a]">System Connection Delayed</h2>
              <p className="text-lg text-[#796a5d] font-medium">{sessionError}</p>
            </div>
            <button
              type="button"
              onClick={initSession}
              className="inline-flex items-center justify-center gap-3 px-8 min-h-touch text-base font-semibold bg-[#21382f] hover:bg-[#172a22] text-white rounded-xl focus:outline-none focus:ring-4 focus:ring-[#b66b3c]/20 active:scale-[0.98] shadow-[0_8px_20px_rgba(33,56,47,.18)] transition-all"
            >
              <RefreshCw className="w-7 h-7" />
              <span>Retry Connection</span>
            </button>
          </div>
        )}

        {/* Mode Cards Grid (shown when session is ready) */}
        {!isLoadingSession && !sessionError && (
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-7">
            {MODE_CARDS.map((card) => {
              const IconComponent = card.icon;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleSelectMode(card.id)}
                  className={`
  group relative flex flex-col justify-between text-left
  p-7 md:p-8 lg:p-9
  rounded-[2rem]
  bg-[#fffdfa]/95
  backdrop-blur-sm
  border border-[#e3d7c8]
  shadow-[0_12px_35px_rgba(76,49,28,.08)]
  hover:-translate-y-2
  hover:shadow-[0_24px_55px_rgba(76,49,28,.14)]
  hover:border-[#cdbca7]
  focus:outline-none
  focus:ring-4 focus:ring-[#b66b3c]/20
  active:scale-[0.99]
  min-h-[390px]
  cursor-pointer
  transition-all duration-300
`}
                  aria-label={`${card.title}. ${card.description}`}
                >
                  <div className="space-y-6">
                    {/* Badge */}
                    <div className="flex items-center justify-between">
                           <span
  className={`
    inline-flex items-center
    px-3 py-1.5
    rounded-full
    text-[9px] md:text-[10px]
    font-bold
    uppercase
    tracking-[0.18em]
    ${card.badgeBg}
  `}
>
                             {card.badgeText}
                     </span>
                    </div>

                    {/* Icon & Title */}
                    <div className="space-y-4">
                     <div
  className={`
    w-20 h-20 md:w-22 md:h-22
    rounded-[1.4rem]
    flex items-center justify-center
    bg-[#f3eadf]
    text-[#8b5e34]
    border border-[#e3d4c2]
    shadow-[0_8px_20px_rgba(76,49,28,.08)]
    group-hover:bg-[#21382f]
    group-hover:text-[#e8b65a]
    group-hover:-translate-y-1
    group-hover:shadow-[0_12px_25px_rgba(33,56,47,.16)]
    transition-all duration-300
  `}
>
  <IconComponent
    className="w-10 h-10 md:w-11 md:h-11"
    strokeWidth={2}
  />
</div>
                      
                        <h2 className="font-display text-3xl md:text-4xl lg:text-[2.65rem] font-semibold text-[#211b17] tracking-[-0.025em] leading-[1.05]">
  {card.title}
</h2>
                    </div>

                    {/* Plain Language Explanation */}
                    <p className="text-sm md:text-base text-[#796a5d] font-medium leading-relaxed max-w-md">
  {card.description}
</p>
                  </div>

                  {/* Touch Target Action Prompt */}
                  <div className="pt-6 mt-2 border-t border-[#e5dacb] flex items-center justify-between">
  <span className="text-[10px] md:text-xs font-bold uppercase tracking-[0.16em] text-[#8b5e34]">
  Select mode
</span>

  <span
    className="w-10 h-10 rounded-full bg-[#f3eadf] text-[#8b5e34] flex items-center justify-center border border-[#e3d4c2] group-hover:bg-[#21382f] group-hover:text-[#e8b65a] group-hover:border-[#21382f] group-hover:translate-x-1 transition-all duration-300"
    aria-hidden="true"
  >
    →
  </span>
</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Accessibility Footer Notice */}
      <footer className="relative z-10 max-w-5xl mx-auto w-full text-center text-[#95877a] text-sm font-medium border-t border-[#dfd3c4] pt-5 pb-2">
  <p className="flex items-center justify-center gap-2 flex-wrap">
    <span>Use</span>

    <kbd className="px-2.5 py-1 bg-[#fffdfa] border border-[#d9cdbd] rounded-lg text-[#5f5044] text-xs font-semibold font-mono shadow-sm">
      Tab
    </kbd>

    <span>to navigate between ordering options</span>
  </p>
</footer>
    </main>
  );
}

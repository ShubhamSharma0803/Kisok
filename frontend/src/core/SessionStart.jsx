import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from './SessionContext';
import { RefreshCw, AlertCircle } from 'lucide-react';
import CinematicIntro from './CinematicIntro';

export default function SessionStart({ onNavigate }) {
  const navigate = useNavigate();
  const {
    sessionId,
    uiEmphasis,
    isLoadingSession,
    sessionError,
    initSession,
  } = useSession();

  const [showOrderSplash, setShowOrderSplash] = useState(true);

  // 1. Initialize session on mount
  useEffect(() => {
    if (!sessionId && !isLoadingSession && !sessionError) {
      initSession();
    }
  }, [sessionId, isLoadingSession, sessionError, initSession]);

  // 2. Automatically proceed to /order after welcome animation ends (no manual mode picker)
  const handleSplashComplete = useCallback(() => {
    setShowOrderSplash(false);
    if (onNavigate) {
      onNavigate(uiEmphasis || 'standard_touch');
    }
    navigate('/order');
  }, [navigate, onNavigate, uiEmphasis]);

  return (
    <main
      className="min-h-screen bg-[#f4efe7] text-[#211b17] flex flex-col justify-between px-6 py-8 md:px-10 md:py-10 font-sans relative overflow-hidden"
      aria-label="Kiosk Session Start"
    >
      {showOrderSplash ? (
        <CinematicIntro onComplete={handleSplashComplete} />
      ) : (
        <div className="max-w-2xl mx-auto my-auto p-10 rounded-[2rem] bg-[#fffdfa] border border-[#e5d7c8] text-[#2a201a] text-center space-y-6 shadow-[0_20px_50px_rgba(76,49,28,.12)]">
          {isLoadingSession && (
            <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center">
              <RefreshCw className="w-12 h-12 text-[#8b5e34] animate-spin" />
              <p className="font-display text-2xl md:text-3xl font-semibold text-[#2a201a]">
                Starting Session...
              </p>
            </div>
          )}

          {sessionError && !isLoadingSession && (
            <div role="alert" className="space-y-6">
              <div className="flex justify-center">
                <AlertCircle className="w-16 h-16 text-[#b96235]" />
              </div>
              <div className="space-y-3">
                <h2 className="font-display text-3xl font-semibold text-[#2a201a]">
                  System Connection Delayed
                </h2>
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
        </div>
      )}
    </main>
  );
}

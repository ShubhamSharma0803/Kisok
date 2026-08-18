import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSession } from './SessionContext';
import { useSessionSocket } from './useSessionSocket';
import { triggerHandoff, reportFailedTap, getOrchestratorState } from './api';
import HandoffWaiting from './HandoffWaiting';
import ScreenNarrationBridge from './ScreenNarrationBridge';
import { HelpCircle, LifeBuoy, AlertTriangle } from 'lucide-react';

const HandoffContext = createContext(null);

export const HandoffProvider = ({ children }) => {
  const { sessionId, sessionStatus, setSessionMode } = useSession();
  const { subscribe } = useSessionSocket(sessionId);

  const [isHandedOff, setIsHandedOff] = useState(false);
  const [isSubmittingHandoff, setIsSubmittingHandoff] = useState(false);
  const [handoffError, setHandoffError] = useState(null);
  const [orchestratorData, setOrchestratorData] = useState(null);

  // Sync state if sessionStatus from context is handed_off
  useEffect(() => {
    if (sessionStatus === 'handed_off') {
      setIsHandedOff(true);
    }
  }, [sessionStatus]);

  // 1. Manual Handoff Trigger Handler ("Get help" button)
  const triggerHelp = useCallback(async () => {
    if (!sessionId || isSubmittingHandoff) return;
    setIsSubmittingHandoff(true);
    setHandoffError(null);
    try {
      await triggerHandoff(sessionId);
      // ONLY set isHandedOff to true if backend call succeeded!
      setIsHandedOff(true);
    } catch (err) {
      console.error('[HandoffProvider] Failed to trigger manual handoff:', err);
      // Set plain language error state for retry — NEVER show "help is coming" on failure
      setHandoffError('Unable to notify attendant right now. Please tap Get Help again to retry.');
    } finally {
      setIsSubmittingHandoff(false);
    }
  }, [sessionId, isSubmittingHandoff]);

  // 2. Failed Tap Reporter (for repeated invalid taps or failed API calls)
  const reportFailedTapAction = useCallback(async () => {
    if (!sessionId) return;
    try {
      const state = await reportFailedTap(sessionId);
      if (state) {
        setOrchestratorData((prev) => ({ ...prev, ...state }));
      }
    } catch (err) {
      console.log('[HandoffProvider] Failed tap report error:', err.message);
    }
  }, [sessionId]);

  // 3. Resume ordering handler (returns from HandoffWaiting only when active)
  const resumeOrdering = useCallback(() => {
    setIsHandedOff(false);
    setHandoffError(null);
  }, []);

  // 4. Global WebSocket Listeners for "handoff_triggered" & "mode_change"
  useEffect(() => {
    if (!sessionId) return;

    const unsubHandoff = subscribe('handoff_triggered', (payload) => {
      console.log('[HandoffProvider] WebSocket handoff_triggered event received:', payload);
      setIsHandedOff(true);
    });

    const unsubMode = subscribe('mode_change', (payload) => {
      console.log('[HandoffProvider] WebSocket mode_change event received:', payload);
      if (payload?.mode) {
        setSessionMode(payload.mode);
      }
    });

    return () => {
      unsubHandoff();
      unsubMode();
    };
  }, [sessionId, subscribe, setSessionMode]);

  // 5. Periodic orchestrator state polling (every 10 seconds)
  useEffect(() => {
    if (!sessionId || isHandedOff) return;

    const pollOrchestrator = async () => {
      try {
        const state = await getOrchestratorState(sessionId);
        setOrchestratorData(state);
        if (state?.status === 'handed_off') {
          setIsHandedOff(true);
        }
      } catch (err) {
        // Silent catch for background poll
      }
    };

    pollOrchestrator();
    const interval = setInterval(pollOrchestrator, 10000);
    return () => clearInterval(interval);
  }, [sessionId, isHandedOff]);

  const value = {
    isHandedOff,
    handoffError,
    triggerHelp,
    reportFailedTap: reportFailedTapAction,
    resumeOrdering,
    orchestratorData,
  };

  return (
    <HandoffContext.Provider value={value}>
      <ScreenNarrationBridge />
      {/* If Handed Off, render the HandoffWaiting screen globally */}
      {isHandedOff ? (
        <HandoffWaiting onResumeOrdering={resumeOrdering} />
      ) : (
        <>
          {children}

          {/* Persistent Always-Visible "Get Help" Button (Fixed Bottom-Right Corner) */}
          {sessionId && (
            <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 md:bottom-6 md:right-6">
              {/* Plain-language error retry alert banner */}
              {handoffError && (
                <div 
                  className="max-w-xs p-3 rounded-2xl bg-red-950 border-2 border-red-500 text-red-100 text-sm font-bold shadow-2xl flex items-center gap-2 animate-bounce"
                  role="alert"
                >
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                  <span>{handoffError}</span>
                </div>
              )}

              <button
  type="button"
  onClick={triggerHelp}
  disabled={isSubmittingHandoff}
  className={`
    group relative flex items-center gap-3
    rounded-full px-5 py-3
    border
    ${handoffError
      ? 'border-red-400/70 bg-red-950 text-red-100 hover:bg-red-900'
      : 'border-[#d8b15a]/70 bg-[#1f352d] text-[#f7efe5] hover:bg-[#28483d]'
    }
    shadow-[0_10px_30px_rgba(31,53,45,0.22)]
    hover:shadow-[0_14px_38px_rgba(31,53,45,0.32)]
    active:scale-[0.97]
    focus:outline-none
    focus:ring-4
    focus:ring-[#d8b15a]/25
    transition-all
    duration-300
    disabled:cursor-not-allowed
    disabled:opacity-60
  `}
  aria-label="Get help from a human team member"
>
  <span
    className={`
      flex h-10 w-10 items-center justify-center
      rounded-full
      border
      ${handoffError
        ? 'border-red-300/40 bg-red-800/50'
        : 'border-[#d8b15a]/50 bg-[#d8b15a]/10'
      }
      transition-transform
      duration-300
      group-hover:scale-105
    `}
  >
    <LifeBuoy
      className={`
        h-5 w-5
        ${handoffError ? 'text-red-200' : 'text-[#e9bd67]'}
      `}
    />
  </span>

  <span className="pr-1 text-sm font-bold tracking-wide md:text-base">
    {isSubmittingHandoff
      ? 'Calling Help...'
      : handoffError
        ? 'Retry Help'
        : 'Get Help'}
  </span>

  {!handoffError && (
    <span className="ml-1 text-lg text-[#e9bd67] transition-transform duration-300 group-hover:translate-x-1">
      →
    </span>
  )}
</button>
            </div>
          )}
        </>
      )}
    </HandoffContext.Provider>
  );
};

export const useHandoff = () => {
  const context = useContext(HandoffContext);
  if (!context) {
    throw new Error('useHandoff must be used within a HandoffProvider');
  }
  return context;
};

export default HandoffContext;

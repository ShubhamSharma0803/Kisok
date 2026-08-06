import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSession } from './SessionContext';
import { useSessionSocket } from './useSessionSocket';
import { triggerHandoff, reportFailedTap, getOrchestratorState } from './api';
import HandoffWaiting from './HandoffWaiting';
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
      {/* If Handed Off, render the HandoffWaiting screen globally */}
      {isHandedOff ? (
        <HandoffWaiting onResumeOrdering={resumeOrdering} />
      ) : (
        <>
          {children}

          {/* Persistent Always-Visible "Get Help" Button (Fixed Bottom-Right Corner) */}
          {sessionId && (
            <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
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
                  flex items-center gap-3 px-6 py-4 rounded-full
                  ${handoffError ? 'bg-red-600 hover:bg-red-700 text-white border-red-950' : 'bg-amber-400 hover:bg-amber-300 text-slate-950 border-slate-950'}
                  font-black text-xl md:text-2xl shadow-2xl
                  border-4 cursor-pointer active:scale-[0.98]
                  focus:outline-none focus:ring-4 focus:ring-amber-400 focus:ring-offset-4 focus:ring-offset-slate-950
                  min-h-touch min-w-touch transition-all duration-150 disabled:opacity-50
                `}
                aria-label="Get help from a human team member"
              >
                <LifeBuoy className="w-8 h-8 stroke-[2.5] animate-bounce" />
                <span>{isSubmittingHandoff ? 'Calling Help...' : handoffError ? 'Retry Get Help' : 'Get Help'}</span>
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

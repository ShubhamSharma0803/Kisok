import React, { useEffect, useState, useCallback } from 'react';
import { useSession } from './SessionContext';
import { useSessionSocket } from './useSessionSocket';
import { getOrchestratorState, resolveHandoff, triggerScreenNarration } from './api';
import { UserCheck, ShieldCheck, ArrowLeft, RefreshCw, HelpCircle, Clock, CheckCircle } from 'lucide-react';

export default function HandoffWaiting({ onResumeOrdering }) {
  const { sessionId, setSessionMode } = useSession();
  const { subscribe } = useSessionSocket(sessionId);

  const [statusMessage, setStatusMessage] = useState('Notifying a team member for assistance...');
  const [orchestratorState, setOrchestratorState] = useState(null);
  const [isCheckingState, setIsCheckingState] = useState(false);
  const [isActiveConfirmed, setIsActiveConfirmed] = useState(false);

  // Trigger screen narration on load — always-on, regardless of ui_emphasis
  useEffect(() => {
    if (sessionId) {
      triggerScreenNarration(sessionId, 'handoff');
    }
  }, [sessionId]);

  // Poll orchestrator state every 5 seconds to check if status transitions back to active
  const checkStatus = useCallback(async () => {
    if (!sessionId) return;
    setIsCheckingState(true);
    try {
      const state = await getOrchestratorState(sessionId);
      setOrchestratorState(state);

      // Require backend orchestrator state.status === "active" to confirm resolution
      if (state && state.status === 'active') {
        setIsActiveConfirmed(true);
        setStatusMessage('Attendant assistance completed. You can return to ordering.');
        if (state.ui_emphasis) setSessionMode(state.ui_emphasis);
      } else {
        setIsActiveConfirmed(false);
      }
    } catch (err) {
      console.error('[HandoffWaiting] Failed to check orchestrator state:', err);
    } finally {
      setIsCheckingState(false);
    }
  }, [sessionId, setSessionMode]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  // Subscribe to processing, error, and mode_change WebSocket events
  useEffect(() => {
    if (!sessionId) return;

    const unsubProcessing = subscribe('processing', (payload) => {
      if (payload?.message) {
        setStatusMessage(payload.message);
      }
    });

    const unsubError = subscribe('error', (payload) => {
      if (payload?.message) {
        setStatusMessage('We are still notifying an attendant. Someone will be with you shortly.');
      }
    });

    const unsubMode = subscribe('mode_change', (payload) => {
      const nextEmphasis = payload?.ui_emphasis || payload?.mode;
      if (nextEmphasis) {
        setSessionMode(nextEmphasis);
      }
    });

    return () => {
      unsubProcessing();
      unsubError();
      unsubMode();
    };
  }, [sessionId, subscribe, setSessionMode]);

  const handleResolveWith = async (uiEmphasis) => {
    if (!sessionId) return;
    setIsCheckingState(true);
    try {
      await resolveHandoff(sessionId, uiEmphasis);
      await checkStatus();
    } catch (err) {
      console.error('[HandoffWaiting] Failed to resolve handoff:', err);
    } finally {
      setIsCheckingState(false);
    }
  };

  const layoutChoices = [
    { value: 'standard_touch', label: 'Standard Touch', icon: '👆' },
    { value: 'big_icons',      label: 'Big Icons',      icon: '🔍' },
    { value: 'gaze_active',    label: 'Gaze Active',    icon: '👁️' },
  ];

  return (
    <main 
      className="min-h-screen bg-slate-950 text-slate-50 flex flex-col justify-between p-6 md:p-12 font-sans"
      aria-label="Human Assistance Escalation Screen"
    >
      {/* Header Badge */}
      <header className="max-w-4xl mx-auto w-full text-center space-y-4 pt-4">
        <div className={`inline-flex items-center gap-3 px-6 py-2.5 rounded-full border-2 text-lg font-bold shadow-md ${isActiveConfirmed ? 'bg-emerald-950 border-emerald-400 text-emerald-200' : 'bg-amber-950 border-amber-500 text-amber-200'}`}>
          {isActiveConfirmed ? <CheckCircle className="w-6 h-6 text-emerald-400" /> : <UserCheck className="w-6 h-6 text-amber-400" />}
          <span>{isActiveConfirmed ? 'Assistance Resolved by Team Member' : 'Attendant Assistance Requested'}</span>
        </div>
      </header>

      {/* Main Reassuring Card */}
      <div className="max-w-3xl mx-auto w-full my-auto py-8">
        <div className="bg-slate-900 border-4 border-emerald-500 rounded-3xl p-8 md:p-12 text-center space-y-8 shadow-2xl">
          {/* Animated Friendly Icon */}
          <div className="w-28 h-28 mx-auto rounded-3xl bg-emerald-900/60 border-4 border-emerald-400 flex items-center justify-center text-emerald-300">
            <HelpCircle className="w-16 h-16" strokeWidth={2.5} />
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
              {isActiveConfirmed ? 'Assistance Completed!' : 'A team member is on their way!'}
            </h1>
            <p className="text-2xl text-slate-300 font-medium leading-relaxed max-w-xl mx-auto">
              {isActiveConfirmed
                ? 'Your session is now active again. You may safely resume your order.'
                : 'Please take your time. Someone will be here in a moment to guide you through your order.'}
            </p>
          </div>

          {/* Reassurance Banner */}
          <div className="p-6 rounded-2xl bg-slate-950 border-2 border-slate-800 flex items-center justify-center gap-4 text-emerald-400 text-xl font-bold">
            <ShieldCheck className="w-8 h-8 text-emerald-400 shrink-0" />
            <span>Don't worry — your order and choices are safely saved.</span>
          </div>

          {/* Live Status Pill */}
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-base font-semibold">
            <Clock className="w-5 h-5 text-amber-400 animate-pulse" />
            <span>Status: {statusMessage}</span>
          </div>

          {/* Action Buttons: Return to Order ONLY surfaced when backend confirmed active status */}
          <div className="pt-6 border-t-2 border-slate-800 flex flex-col items-center gap-4">
            {isActiveConfirmed && onResumeOrdering && (
              <button
                type="button"
                onClick={onResumeOrdering}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 min-h-touch text-2xl font-black bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl border-2 border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-400 min-h-touch active:scale-[0.98] shadow-lg transition-all animate-bounce"
              >
                <ArrowLeft className="w-6 h-6 stroke-[3]" />
                <span>Return to Order</span>
              </button>
            )}

            {!isActiveConfirmed && (
              <div className="w-full space-y-3">
                <p className="text-sm text-slate-500 font-semibold uppercase tracking-wider">
                  Simulate Attendant Resolution (Dev)
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  {layoutChoices.map(({ value, label, icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleResolveWith(value)}
                      disabled={isCheckingState}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 min-h-touch text-lg font-bold bg-amber-700 hover:bg-amber-600 text-white rounded-2xl border border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-400 disabled:opacity-50 shadow-md transition-all"
                    >
                      <span className="text-xl">{icon}</span>
                      <span>Resolve → {label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={checkStatus}
              disabled={isCheckingState}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 min-h-touch text-lg font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl border border-slate-600 focus:outline-none focus:ring-4 focus:ring-slate-500 disabled:opacity-50 min-h-touch"
            >
              <RefreshCw className={`w-5 h-5 ${isCheckingState ? 'animate-spin' : ''}`} />
              <span>Check Status</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <footer className="max-w-4xl mx-auto w-full text-center text-slate-400 text-lg border-t border-slate-900 pt-6">
        <p>You can also press <kbd className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-base font-mono">Tab</kbd> to focus keyboard controls.</p>
      </footer>
    </main>
  );
}

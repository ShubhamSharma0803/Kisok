import { useEffect, useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from './SessionContext';
import { useHandoff } from './HandoffProvider';
import { useSessionSocket } from './useSessionSocket';
import { repeatNarrationForCurrentScreen } from './screenNarration';

/**
 * Global caption overlay: always mounted inside HandoffProvider regardless of ui_emphasis.
 *
 * Listens to screen_narration WS events (the live event, confirmed in Step 2a).
 * - If payload.text is present: renders it immediately as a caption overlay.
 * - If payload.request_repeat is true: re-calls the narration API for the current screen.
 *
 * Caption is NOT gated behind any ui_emphasis / sessionMode check — it is always-on
 * per PRODUCT_SPEC.md Section 3 ("captions are always on, in every layout").
 *
 * NOTE: EventType.caption remains defined in the enum but has zero backend emission points
 * as of Step 2a/2b. This component uses screen_narration, which is live. caption wiring
 * is reserved for a future step.
 */
export default function ScreenNarrationBridge() {
  const { sessionId } = useSession();
  const { isHandedOff } = useHandoff();
  const location = useLocation();
  const { subscribe } = useSessionSocket(sessionId);

  const [captionText, setCaptionText] = useState('');
  const [captionVisible, setCaptionVisible] = useState(false);
  const [clearTimer, setClearTimer] = useState(null);

  /** Show caption text for 6 seconds, then fade out */
  const showCaption = useCallback((text) => {
    if (!text) return;
    setCaptionText(text);
    setCaptionVisible(true);
    // Clear any existing timer before setting a new one
    setClearTimer((prev) => {
      if (prev) clearTimeout(prev);
      return setTimeout(() => {
        setCaptionVisible(false);
      }, 6000);
    });
  }, []);

  /** Re-trigger narration API for the current screen (for request_repeat payloads) */
  const handleRepeat = useCallback(() => {
    if (!sessionId) return;
    repeatNarrationForCurrentScreen(sessionId, location.pathname, isHandedOff);
  }, [sessionId, isHandedOff, location.pathname]);

  useEffect(() => {
    if (!sessionId) return;
    const unsub = subscribe('screen_narration', (payload) => {
      // Always show caption text if present — no mode gate
      if (payload?.text) {
        showCaption(payload.text);
      }
      // Also re-trigger API if backend requests a repeat
      if (payload?.request_repeat) {
        handleRepeat();
      }
    });
    return unsub;
  }, [sessionId, subscribe, showCaption, handleRepeat]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (clearTimer) clearTimeout(clearTimer); }, [clearTimer]);

  if (!captionVisible || !captionText) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      id="global-caption-overlay"
      style={{
        position: 'fixed',
        bottom: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        maxWidth: '80vw',
        width: 'max-content',
        padding: '14px 24px',
        borderRadius: '16px',
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(12px)',
        border: '1.5px solid rgba(148, 163, 184, 0.25)',
        color: '#f1f5f9',
        fontSize: '1.15rem',
        fontWeight: 600,
        lineHeight: 1.4,
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        pointerEvents: 'none',
        animation: 'captionFadeIn 0.25s ease-out',
      }}
    >
      {captionText}
      <style>{`
        @keyframes captionFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

import { useEffect, useCallback, useState, useRef } from 'react';
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
  const clearTimerRef = useRef(null);

  // Keep latest location & handoff state in refs so callbacks never trigger unneeded effect re-subscriptions
  const locationRef = useRef(location.pathname);
  const isHandedOffRef = useRef(isHandedOff);
  useEffect(() => {
    locationRef.current = location.pathname;
    isHandedOffRef.current = isHandedOff;
  }, [location.pathname, isHandedOff]);

  /** Show caption text for 6 seconds, then fade out */
  const showCaption = useCallback((text) => {
    if (!text) return;
    setCaptionText(text);
    setCaptionVisible(true);

    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
    }
    clearTimerRef.current = setTimeout(() => {
      setCaptionVisible(false);
    }, 6000);
  }, []);

  /** Re-trigger narration API for current screen when backend requests repeat */
  const handleRepeat = useCallback(() => {
    if (!sessionId) return;
    repeatNarrationForCurrentScreen(sessionId, locationRef.current, isHandedOffRef.current);
  }, [sessionId]);

  // 1. Subscribe to WebSocket screen_narration events
  useEffect(() => {
    if (!sessionId) return;
    const unsub = subscribe('screen_narration', (payload) => {
      if (payload?.text) {
        showCaption(payload.text);
      }
      if (payload?.request_repeat) {
        handleRepeat();
      }
    });
    return unsub;
  }, [sessionId, subscribe, showCaption, handleRepeat]);

  // 2. Listen to local custom event 'kiosk:show_caption' for immediate zero-latency sync
  useEffect(() => {
    const handleLocalCaption = (e) => {
      if (e.detail?.text) {
        showCaption(e.detail.text);
      }
    };
    window.addEventListener('kiosk:show_caption', handleLocalCaption);
    return () => window.removeEventListener('kiosk:show_caption', handleLocalCaption);
  }, [showCaption]);

  // Cleanup timer on component unmount
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

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

import { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from './SessionContext';
import { useHandoff } from './HandoffProvider';
import { useSessionSocket } from './useSessionSocket';
import { repeatNarrationForCurrentScreen } from './screenNarration';

/**
 * Global listener: when backend emits screen_narration { request_repeat: true },
 * re-narrate whatever screen the user is actually on (via React Router location).
 */
export default function ScreenNarrationBridge() {
  const { sessionId, sessionMode } = useSession();
  const { isHandedOff } = useHandoff();
  const location = useLocation();
  const { subscribe } = useSessionSocket(sessionId);

  const handleRepeat = useCallback(() => {
    if (!sessionId || sessionMode !== 'voice_first') return;
    repeatNarrationForCurrentScreen(sessionId, location.pathname, isHandedOff);
  }, [sessionId, sessionMode, isHandedOff, location.pathname]);

  useEffect(() => {
    if (!sessionId) return;
    const unsub = subscribe('screen_narration', (payload) => {
      if (payload?.request_repeat) {
        handleRepeat();
      }
    });
    return unsub;
  }, [sessionId, subscribe, handleRepeat]);

  return null;
}

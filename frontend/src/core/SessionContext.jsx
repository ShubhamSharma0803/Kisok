import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createSession } from './api';

const SessionContext = createContext(null);

const DEFAULT_ACTIVE_CHANNELS = {
  voice_input: true,
  voice_output: true,
  touch_input: true,
  gaze_input: false,
  captions: true,
};

export const SessionProvider = ({ children }) => {
  const [sessionId, setSessionId] = useState(null);
  const [uiEmphasis, setUiEmphasis] = useState('standard_touch');
  const [activeChannels, setActiveChannels] = useState(DEFAULT_ACTIVE_CHANNELS);
  const [detectionConfidence, setDetectionConfidence] = useState(0.0);
  const [detectionSource, setDetectionSource] = useState('not_yet_implemented');
  const [sessionStatus, setSessionStatus] = useState('active');
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState(null);

  // Guard ref: prevents duplicate POST /sessions when React StrictMode
  // double-invokes effects before the first async call resolves.
  const hasInitializedRef = useRef(false);

  /**
   * Initializes a new session by calling POST /sessions.
   * The ref guard is set synchronously before the async call starts,
   * so a second invocation within the same mount cycle is a no-op.
   */
  const initSession = useCallback(async () => {
    if (hasInitializedRef.current) return null;
    hasInitializedRef.current = true; // set synchronously — before await

    setIsLoadingSession(true);
    setSessionError(null);
    try {
      const sessionData = await createSession();
      setSessionId(sessionData.id);
      setUiEmphasis(sessionData.ui_emphasis || 'standard_touch');
      setActiveChannels(sessionData.active_channels || DEFAULT_ACTIVE_CHANNELS);
      setDetectionConfidence(sessionData.detection_confidence ?? 0.0);
      setDetectionSource(sessionData.detection_source || 'not_yet_implemented');
      setSessionStatus(sessionData.status || 'active');
      setIsLoadingSession(false);
      return sessionData;
    } catch (err) {
      console.error('[SessionContext] Failed to create session:', err);
      setSessionError('Unable to connect to kiosk server. Please check network connection and try again.');
      setIsLoadingSession(false);
      hasInitializedRef.current = false; // allow retry on failure
      return null;
    }
  }, []);

  /**
   * Updates local UI emphasis layout (standard_touch, big_icons, gaze_active)
   */
  const updateUiEmphasis = useCallback((newEmphasis) => {
    setUiEmphasis(newEmphasis);
  }, []);

  /**
   * Resets current session state
   */
  const resetSession = useCallback(() => {
    setSessionId(null);
    setUiEmphasis('standard_touch');
    setActiveChannels(DEFAULT_ACTIVE_CHANNELS);
    setDetectionConfidence(0.0);
    setDetectionSource('not_yet_implemented');
    setSessionStatus('active');
    setSessionError(null);
    hasInitializedRef.current = false;
  }, []);

  const value = {
    sessionId,
    uiEmphasis,
    activeChannels,
    detectionConfidence,
    detectionSource,
    sessionStatus,
    isLoadingSession,
    sessionError,
    initSession,
    setUiEmphasis: updateUiEmphasis,
    resetSession,
    // Aliases for transition compatibility
    sessionMode: uiEmphasis,
    setSessionMode: updateUiEmphasis,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

export default SessionContext;

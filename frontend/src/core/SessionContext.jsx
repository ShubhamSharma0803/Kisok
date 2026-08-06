import React, { createContext, useContext, useState, useCallback } from 'react';
import { createSession } from './api';

const SessionContext = createContext(null);

export const SessionProvider = ({ children }) => {
  const [sessionId, setSessionId] = useState(null);
  const [sessionMode, setSessionMode] = useState('voice_first');
  const [sessionStatus, setSessionStatus] = useState('active');
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState(null);

  /**
   * Initializes a new session by calling POST /sessions
   */
  const initSession = useCallback(async () => {
    setIsLoadingSession(true);
    setSessionError(null);
    try {
      const sessionData = await createSession();
      setSessionId(sessionData.id);
      setSessionMode(sessionData.current_mode || 'voice_first');
      setSessionStatus(sessionData.status || 'active');
      setIsLoadingSession(false);
      return sessionData;
    } catch (err) {
      console.error('[SessionContext] Failed to create session:', err);
      setSessionError('Unable to connect to kiosk server. Please check network connection and try again.');
      setIsLoadingSession(false);
      return null;
    }
  }, []);

  /**
   * Updates local session mode (e.g. voice_first, simplified_ui, gaze_active)
   */
  const updateMode = useCallback((newMode) => {
    setSessionMode(newMode);
  }, []);

  /**
   * Resets current session state
   */
  const resetSession = useCallback(() => {
    setSessionId(null);
    setSessionMode('voice_first');
    setSessionStatus('active');
    setSessionError(null);
  }, []);

  const value = {
    sessionId,
    sessionMode,
    sessionStatus,
    isLoadingSession,
    sessionError,
    initSession,
    setSessionMode: updateMode,
    resetSession,
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

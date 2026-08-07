import { useEffect, useRef, useCallback } from 'react';

const getWsBaseUrl = () => {
  if (import.meta.env.VITE_WS_BASE_URL !== undefined) {
    return import.meta.env.VITE_WS_BASE_URL;
  }
  if (import.meta.env.DEV) {
    return 'ws://localhost:8000';
  }
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:8000';
  return `${protocol}//${host}`;
};

const WS_BASE_URL = getWsBaseUrl();

/**
 * Custom React hook for session WebSocket communication.
 * Connects once per session, parses standard envelope: { type, session_id, payload, timestamp },
 * and provides a subscribe-by-event-type API.
 */
export function useSessionSocket(sessionId) {
  const socketRef = useRef(null);
  const listenersRef = useRef(new Map()); // Map<eventType, Set<callback>>

  // Connect WebSocket when sessionId is valid
  useEffect(() => {
    if (!sessionId) return;

    const wsUrl = `${WS_BASE_URL}/sessions/${sessionId}/ws`;
    let isComponentMounted = true;
    let reconnectTimeout = null;

    function connect() {
      if (!isComponentMounted) return;

      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          console.log(`[useSessionSocket] Connected to ${wsUrl}`);
        };

        ws.onmessage = (event) => {
          try {
            const envelope = JSON.parse(event.data);
            const { type, payload, session_id, timestamp } = envelope;

            // Trigger registered listeners for this event type
            const eventListeners = listenersRef.current.get(type);
            if (eventListeners) {
              eventListeners.forEach((callback) => {
                try {
                  callback(payload, envelope);
                } catch (err) {
                  console.error(`[useSessionSocket] Error in listener for event '${type}':`, err);
                }
              });
            }
          } catch (err) {
            console.error('[useSessionSocket] Failed to parse WebSocket message envelope:', err);
          }
        };

        ws.onerror = (error) => {
          console.error('[useSessionSocket] WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('[useSessionSocket] WebSocket closed.');
          socketRef.current = null;
          // Auto-reconnect after 3 seconds if still mounted
          if (isComponentMounted) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
      } catch (err) {
        console.error('[useSessionSocket] Connection error:', err);
      }
    }

    connect();

    return () => {
      isComponentMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [sessionId]);

  /**
   * Subscribe to a specific event type (e.g. 'order_updated', 'mode_change', 'voice_transcript')
   * Returns an unsubscribe function.
   */
  const subscribe = useCallback((eventType, callback) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    const set = listenersRef.current.get(eventType);
    set.add(callback);

    return () => {
      const currentSet = listenersRef.current.get(eventType);
      if (currentSet) {
        currentSet.delete(callback);
        if (currentSet.size === 0) {
          listenersRef.current.delete(eventType);
        }
      }
    };
  }, []);

  return {
    socket: socketRef.current,
    subscribe,
  };
}

export default useSessionSocket;

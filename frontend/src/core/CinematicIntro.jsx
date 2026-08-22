import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Scan } from 'lucide-react';
import './CinematicIntro.css';

const getWsUrl = () => {
  if (import.meta.env.VITE_WS_BASE_URL !== undefined) {
    return `${import.meta.env.VITE_WS_BASE_URL}/ws/detect`;
  }
  if (import.meta.env.DEV) {
    return 'ws://localhost:8000/ws/detect';
  }
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:8000';
  return `${protocol}//${host}/ws/detect`;
};

export default function CinematicIntro({ onComplete }) {
  const hasCompleted = useRef(false);
  const timerRef = useRef(null);
  const wsRef = useRef(null);
  const decisionRef = useRef('Simple Touch Mode');
  const confidenceRef = useRef(0.95);
  const reasonRef = useRef(null);
  const [progressPct, setProgressPct] = useState(0);
  const [scanning, setScanning] = useState(false);

  const finish = useCallback(
    (overrideDecision, overrideConfidence, overrideReason) => {
      if (hasCompleted.current) return;
      hasCompleted.current = true;
      clearTimeout(timerRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (_) {}
        wsRef.current = null;
      }
      const decision = overrideDecision || decisionRef.current || 'Simple Touch Mode';
      const confidence =
        typeof overrideConfidence === 'number'
          ? overrideConfidence
          : typeof confidenceRef.current === 'number'
          ? confidenceRef.current
          : 0.95;
      const reason = overrideReason || reasonRef.current || null;
      console.log('[CinematicIntro] Completing intro -> Decision:', decision, 'Confidence:', confidence);
      onComplete?.(decision, confidence, reason);
    },
    [onComplete]
  );

  // 1. Connect WebSocket detection on mount
  useEffect(() => {
    let ws;
    try {
      const url = getWsUrl();
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setScanning(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'telemetry') {
            setProgressPct(msg.progress_pct || 0);
          }

          if (msg.type === 'final_decision') {
            const decision = msg.data?.decision || 'Simple Touch Mode';
            const confidence = typeof msg.data?.confidence === 'number' ? msg.data.confidence : 0.95;
            const reason = msg.data?.reason || msg.data?.sub_reason || msg.data?.metrics?.reason || null;
            console.log('[CinematicIntro] WebSocket final_decision:', decision, confidence, reason);
            decisionRef.current = decision;
            confidenceRef.current = confidence;
            reasonRef.current = reason;
            finish(decision, confidence, reason);
          }
        } catch (err) {
          console.error('[CinematicIntro] Failed to parse WS message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[CinematicIntro] WebSocket error:', err);
      };

      ws.onclose = () => {
        setScanning(false);
      };
    } catch (err) {
      console.error('[CinematicIntro] Failed to connect WebSocket:', err);
    }

    return () => {
      if (ws) {
        try {
          ws.close();
        } catch (_) {}
      }
    };
  }, [finish]);

  // 2. Manage fallback animation timer (finishes after max 4.5s if WS disconnects)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }

    timerRef.current = setTimeout(() => {
      console.log('[CinematicIntro] Timer elapsed, finalizing decision');
      finish();
    }, 4500);

    return () => clearTimeout(timerRef.current);
  }, [finish]);

  if (hasCompleted.current) return null;

  return (
    <div className="cinematic-intro-wrapper" role="status" aria-label="Kiosk Vision AI is starting">
      <div className="cinematic-scene">
        <div className="scene-blob scene-blob-1"></div>
        <div className="scene-blob scene-blob-2"></div>

        <div className="items-container items-fade-out">
          <img src="/assets/pizza_flying.png" className="food-item item-1" alt="pizza" />
          <img src="/assets/fries_flying.png" className="food-item item-2" alt="fries" />
          <img src="/assets/donut_flying.png" className="food-item item-3" alt="donut" />
          <img
            src="/assets/pizza_flying.png"
            className="food-item item-4"
            alt="pizza2"
            style={{ transform: 'scaleX(-1)' }}
          />
          <img src="/assets/sandwich_flying.png" className="food-item item-5" alt="sandwich" />
          <img src="/assets/drink_flying.png" className="food-item item-6" alt="drink" />
        </div>

        <div className="scene-pulse"></div>

        <img src="/assets/burger_hero.png" className="hero-burger" alt="burger" />

        <div className="glass-panel"></div>
        <div className="ui-text-container">
          <h1>ORDER YOUR FOOD</h1>
          <h2>AI-POWERED ACCESSIBLE ORDERING</h2>
        </div>

        {/* Live scanning indicator */}
        {scanning && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 rounded-full bg-[#1f352d]/90 px-5 py-2.5 backdrop-blur shadow-[0_12px_35px_rgba(33,56,47,.40)]">
            <Scan className="h-4 w-4 text-[#e9bd67] animate-pulse" />
            <span className="text-sm font-bold text-white/90">Detecting accessibility needs…</span>
            <div className="w-20 h-1.5 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#e9bd67] transition-all duration-300 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

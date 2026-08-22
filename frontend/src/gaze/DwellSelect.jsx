import React, { useEffect, useRef, useState } from 'react';

const DWELL_MS = 1200; // 1.2s comfortable dwell duration
const SWITCH_GRACE_MS = 250; // Buffer before resetting progress on accidental eye blink/slip
const COOLDOWN_MS = 600; // 600ms cooldown after dwell trigger to avoid double-actions

/**
 * High-Performance Dwell Selection Hook using document.elementFromPoint
 */
export function useDwellSelect({ gaze, onSelect, onFailedDwell, enabled = true, dwellTimeMs = DWELL_MS }) {
  const [activeId, setActiveId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [failedDwellCount, setFailedDwellCount] = useState(0);

  const activeIdRef = useRef(null);
  const dwellStartRef = useRef(null);
  const leaveTimeRef = useRef(null);
  const rafRef = useRef(null);
  const cooldownUntilRef = useRef(0);

  useEffect(() => {
    if (!enabled || !gaze) {
      activeIdRef.current = null;
      dwellStartRef.current = null;
      leaveTimeRef.current = null;
      setActiveId(null);
      setProgress(0);
      return;
    }

    const now = performance.now();

    // In cooldown period
    if (now < cooldownUntilRef.current) {
      activeIdRef.current = null;
      dwellStartRef.current = null;
      setActiveId(null);
      setProgress(0);
      return;
    }

    // 1. Ultra-fast elementFromPoint hit-testing
    const el = document.elementFromPoint(gaze.x, gaze.y);
    const dwellTarget = el ? el.closest('[data-dwell-id]') : null;
    const hitId = dwellTarget ? dwellTarget.getAttribute('data-dwell-id') : null;

    // 2. Acquisition state machine
    if (hitId) {
      if (hitId === activeIdRef.current) {
        leaveTimeRef.current = null; // Gaze is stable on current target
      } else {
        // Switch to new target
        activeIdRef.current = hitId;
        dwellStartRef.current = now;
        leaveTimeRef.current = null;
        setActiveId(hitId);
        setProgress(0);
      }
    } else if (activeIdRef.current) {
      // Gaze slipped off target — wait for grace period before resetting
      if (!leaveTimeRef.current) {
        leaveTimeRef.current = now;
      } else if (now - leaveTimeRef.current >= SWITCH_GRACE_MS) {
        activeIdRef.current = null;
        dwellStartRef.current = null;
        leaveTimeRef.current = null;
        setActiveId(null);
        setProgress(0);
        setFailedDwellCount((prev) => {
          const next = prev + 1;
          onFailedDwell?.(next);
          return next;
        });
      }
    }
  }, [gaze, enabled, onFailedDwell]);

  // 3. Continuous Dwell Timer Loop
  useEffect(() => {
    if (!activeId) return undefined;

    const tick = () => {
      if (!dwellStartRef.current) return;
      const elapsed = performance.now() - dwellStartRef.current;
      const pct = Math.min(1, elapsed / dwellTimeMs);
      setProgress(pct);

      if (pct >= 1) {
        const selectedId = activeIdRef.current;
        cooldownUntilRef.current = performance.now() + COOLDOWN_MS;

        activeIdRef.current = null;
        dwellStartRef.current = null;
        leaveTimeRef.current = null;
        setActiveId(null);
        setProgress(0);
        setFailedDwellCount(0); // Reset consecutive failed dwells on successful action

        if (selectedId && onSelect) {
          onSelect(selectedId);
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [activeId, onSelect, dwellTimeMs]);

  return { activeId, progress, failedDwellCount };
}

/**
 * Green circular/conic dwell progress overlay
 */
export function DwellOverlay({ progress, className = '' }) {
  const pct = Math.round(progress * 100);

  if (progress <= 0) return null;

  return (
    <div
      className={`absolute inset-0 pointer-events-none z-20 transition-all ${className}`}
      style={{
        border: '4px solid transparent',
        background: `
          linear-gradient(#fff0, #fff0) padding-box,
          conic-gradient(
            #22c55e ${pct}%,
            rgba(34,197,94,0.18) ${pct}%
          ) border-box
        `,
        boxShadow: progress > 0.25 ? '0 0 20px rgba(34,197,94,0.4) inset' : 'none',
      }}
    >
      <div className="absolute top-3 right-3 flex items-center justify-center h-8 w-8 rounded-full bg-[#1f352d]/90 border border-[#22c55e] text-[#22c55e] shadow-lg">
        <span className="text-xs font-black">{pct}%</span>
      </div>
    </div>
  );
}

/**
 * High-Z Floating Gaze Reticle Cursor
 */
export function GazeCursor({ gaze }) {
  if (!gaze) return null;

  return (
    <div
      className="fixed pointer-events-none z-[99999]"
      style={{
        left: `${gaze.x}px`,
        top: `${gaze.y}px`,
        transform: 'translate(-50%, -50%)',
        willChange: 'left, top',
      }}
      aria-hidden="true"
    >
      <div className="relative flex items-center justify-center">
        <div className="h-10 w-10 rounded-full bg-[#e9bd67]/30 border-2 border-[#e9bd67] animate-ping opacity-60" />
        <div className="absolute h-5 w-5 rounded-full bg-[#e9bd67] shadow-[0_0_16px_rgba(233,189,103,1)] border-2 border-white" />
      </div>
    </div>
  );
}
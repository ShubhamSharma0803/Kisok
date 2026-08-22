import React, { useEffect, useRef, useCallback } from 'react';

/**
 * IntroVideo — Full-screen video intro overlay for Kiosk Vision AI.
 *
 * Props:
 *   onComplete  — called when the video ends, is skipped, or the safety
 *                 timeout fires (whichever comes first).
 *
 * Accessibility:
 *   • Respects prefers-reduced-motion — skips immediately.
 *   • role="status" + aria-label on the wrapper.
 *   • High-contrast Skip button always visible.
 */
export default function IntroVideo({ onComplete }) {
  const hasCompleted = useRef(false);
  const timerRef = useRef(null);

  // Stable completion handler — only fires once.
  const finish = useCallback(() => {
    if (hasCompleted.current) return;
    hasCompleted.current = true;
    clearTimeout(timerRef.current);
    onComplete?.();
  }, [onComplete]);

  useEffect(() => {
    // Respect reduced-motion preference — skip video entirely.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }

    // Safety timeout: if the video never fires "ended" (autoplay blocked,
    // network stall, etc.), force-complete after 6 s.
    timerRef.current = setTimeout(finish, 6000);

    return () => clearTimeout(timerRef.current);
  }, [finish]);

  // If reduced-motion skipped us, render nothing.
  if (hasCompleted.current) return null;

  return (
    <div
      role="status"
      aria-label="Kiosk Vision AI is starting"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Full-viewport video */}
      <video
        src="/assets/wlcm1.mp4"
        autoPlay
        muted
        playsInline
        onEnded={finish}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Skip button — always visible, bottom-right */}
      <button
        type="button"
        onClick={finish}
        aria-label="Skip intro video"
        style={{
          position: 'absolute',
          bottom: 32,
          right: 32,
          zIndex: 10000,
          padding: '10px 28px',
          fontSize: 15,
          fontWeight: 700,
          fontFamily: "'Inter', sans-serif",
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#1a1a1a',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1.5px solid rgba(0, 0, 0, 0.12)',
          borderRadius: 12,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
          transition: 'background 0.2s, transform 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.98)';
          e.currentTarget.style.transform = 'scale(1.04)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.85)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        Skip
      </button>
    </div>
  );
}

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const HANDS_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
let handsLoadPromise = null;

function loadMediaPipeHands() {
  if (typeof window !== 'undefined' && window.Hands) {
    return Promise.resolve(window.Hands);
  }
  if (handsLoadPromise) return handsLoadPromise;

  handsLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${HANDS_CDN}"]`);
    if (existing && window.Hands) {
      return resolve(window.Hands);
    }
    const script = document.createElement('script');
    script.src = HANDS_CDN;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (window.Hands) {
        resolve(window.Hands);
      } else {
        reject(new Error('Hands loaded but window.Hands undefined'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load MediaPipe Hands from CDN'));
    document.head.appendChild(script);
  });
  return handsLoadPromise;
}

const AirGestureContext = createContext({
  handDetected: false,
  isPinching: false,
  isDoublePinchClick: false,
  cursor: { x: 0, y: 0 },
});

export const useAirGestures = () => useContext(AirGestureContext);

// Interaction Tunings
const LERP_ALPHA = 0.38; // Cursor smoothing factor
const PINCH_THRESHOLD = 0.070; // Euclidean distance threshold for thumb-index pinch
const DOUBLE_PINCH_WINDOW_MS = 450; // Max time between two pinches to register as double-pinch click
const DRAG_SCROLL_SENSITIVITY = 2.4; // Multiplier for smooth pinch-and-hold dragging
const DRAG_HOLD_DELAY_MS = 120; // Time held before engaging drag scrolling

export function AirGestureProvider({ children }) {
  const location = useLocation();

  // Disabled strictly on Gaze Mode to avoid cursor & dwell collisions
  const isGazeRoute = location.pathname === '/gaze';

  const [handDetected, setHandDetected] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [isDoublePinchClick, setIsDoublePinchClick] = useState(false);
  const [cursor, setCursor] = useState({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 500,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 400,
  });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const handsRef = useRef(null);
  const animFrameRef = useRef(null);

  const cursorRef = useRef({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 500,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 400,
  });

  // State machine refs
  const isPinchingRef = useRef(false);
  const pinchStartTimeRef = useRef(0);
  const lastPinchReleaseTimeRef = useRef(0);
  const prevPinchYRef = useRef(null);
  const isDraggingRef = useRef(false);
  const isHandVisibleRef = useRef(false);

  useEffect(() => {
    if (isGazeRoute) {
      setHandDetected(false);
      setIsPinching(false);
      setIsDoublePinchClick(false);
      return;
    }

    let isCancelled = false;

    let video = videoRef.current;
    if (!video) {
      video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('autoplay', '');
      video.muted = true;
      video.style.position = 'fixed';
      video.style.top = '-9999px';
      video.style.left = '-9999px';
      video.style.width = '640px';
      video.style.height = '480px';
      video.style.pointerEvents = 'none';
      video.style.opacity = '0';
      document.body.appendChild(video);
      videoRef.current = video;
    }

    async function initHands() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();

        const HandsClass = await loadMediaPipeHands();
        if (isCancelled) return;

        const hands = new HandsClass({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.65,
          minTrackingConfidence: 0.65,
        });

        hands.onResults((results) => {
          if (isCancelled) return;

          const screenW = window.innerWidth || 1920;
          const screenH = window.innerHeight || 1080;
          const now = performance.now();

          if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            if (isHandVisibleRef.current) {
              isHandVisibleRef.current = false;
              setHandDetected(false);
              setIsPinching(false);
              setIsDoublePinchClick(false);
              isPinchingRef.current = false;
              isDraggingRef.current = false;
              pinchStartTimeRef.current = 0;
            }
            return;
          }

          if (!isHandVisibleRef.current) {
            isHandVisibleRef.current = true;
            setHandDetected(true);
          }

          const landmarks = results.multiHandLandmarks[0];

          // Landmark 8: Index Fingertip (Cursor Anchor)
          const indexTip = landmarks[8];
          // Landmark 4: Thumb Tip (Pinch Anchor)
          const thumbTip = landmarks[4];

          if (!indexTip || !thumbTip) return;

          // 1. Mirrored Horizontal Position Mapping
          const rawTargetX = (1.0 - indexTip.x) * screenW;
          const rawTargetY = indexTip.y * screenH;

          const targetX = Math.max(10, Math.min(screenW - 10, rawTargetX));
          const targetY = Math.max(10, Math.min(screenH - 10, rawTargetY));

          // 2. LERP Cursor Smoothing
          const prev = cursorRef.current;
          const nextX = prev.x + (targetX - prev.x) * LERP_ALPHA;
          const nextY = prev.y + (targetY - prev.y) * LERP_ALPHA;

          cursorRef.current = { x: nextX, y: nextY };
          setCursor({ x: nextX, y: nextY });

          // 3. Euclidean 3D Distance for Thumb + Index Pinch
          const dx = thumbTip.x - indexTip.x;
          const dy = thumbTip.y - indexTip.y;
          const dz = (thumbTip.z || 0) - (indexTip.z || 0);
          const pinchDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const pinchingNow = pinchDistance < PINCH_THRESHOLD;

          // 4. Simplified Gesture Machine: Double-Pinch Click & Single-Pinch-Hold Drag
          if (pinchingNow && !isPinchingRef.current) {
            // A. PINCH DOWN
            isPinchingRef.current = true;
            setIsPinching(true);
            pinchStartTimeRef.current = now;
            prevPinchYRef.current = nextY;
            isDraggingRef.current = false;

            // Check for Double-Pinch Click (2nd pinch within window after 1st pinch release)
            const timeSinceLastRelease = now - lastPinchReleaseTimeRef.current;
            if (timeSinceLastRelease > 40 && timeSinceLastRelease <= DOUBLE_PINCH_WINDOW_MS) {
              // DOUBLE PINCH CONFIRMED -> TRIGGER CLICK!
              lastPinchReleaseTimeRef.current = 0; // Reset
              setIsDoublePinchClick(true);
              setTimeout(() => setIsDoublePinchClick(false), 280);

              const hitElement = document.elementFromPoint(nextX, nextY);
              if (hitElement) {
                // Entire Food Card Target: Clicking anywhere on a card triggers its action button
                const card = hitElement.closest('article, [data-dwell-id], [data-item-id]');
                if (card) {
                  const cardBtn = card.querySelector('button');
                  if (cardBtn) {
                    cardBtn.click();
                  } else {
                    card.click();
                  }
                } else {
                  // Standard button, category pill, stepper, or modal action
                  const clickable = hitElement.closest(
                    'button, a, input, select, textarea, [role="button"], [data-clickable], .clickable'
                  ) || hitElement;

                  clickable.click();
                }
              }
            }
          } else if (pinchingNow && isPinchingRef.current) {
            // B. PINCH HELD (ACTIVE SWIPE / DRAG MODE)
            const pinchHoldDuration = now - pinchStartTimeRef.current;

            if (pinchHoldDuration >= DRAG_HOLD_DELAY_MS && prevPinchYRef.current !== null) {
              isDraggingRef.current = true;
              const deltaY = nextY - prevPinchYRef.current;
              const scrollStep = deltaY * DRAG_SCROLL_SENSITIVITY;

              window.scrollBy({ top: scrollStep, behavior: 'auto' });

              // Also scroll active modal or menu container under cursor
              const scrollTarget = document
                .elementFromPoint(nextX, nextY)
                ?.closest('.overflow-y-auto, .overflow-y-scroll, main');
              if (scrollTarget && scrollTarget !== document.body) {
                scrollTarget.scrollBy({ top: scrollStep, behavior: 'auto' });
              }

              prevPinchYRef.current = nextY;
            }
          } else if (!pinchingNow && isPinchingRef.current) {
            // C. PINCH RELEASED (GAP BREAK)
            isPinchingRef.current = false;
            setIsPinching(false);
            isDraggingRef.current = false;
            prevPinchYRef.current = null;
            lastPinchReleaseTimeRef.current = now; // Mark time for potential double-pinch
          }
        });

        handsRef.current = hands;

        const processFrame = async () => {
          if (isCancelled || isGazeRoute) return;
          if (video && video.readyState >= 2) {
            try {
              await hands.send({ image: video });
            } catch (_) {}
          }
          if ('requestVideoFrameCallback' in video) {
            video.requestVideoFrameCallback(() => {
              if (!isCancelled && !isGazeRoute) processFrame();
            });
          } else {
            animFrameRef.current = requestAnimationFrame(processFrame);
          }
        };

        processFrame();
      } catch (err) {
        console.warn('[AirGestureProvider] Camera / Hands init note:', err.message);
      }
    }

    initHands();

    return () => {
      isCancelled = true;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (handsRef.current) {
        try {
          handsRef.current.close();
        } catch (_) {}
        handsRef.current = null;
      }
      if (videoRef.current && videoRef.current.parentNode) {
        videoRef.current.parentNode.removeChild(videoRef.current);
        videoRef.current = null;
      }
    };
  }, [isGazeRoute]);

  return (
    <AirGestureContext.Provider value={{ handDetected, isPinching, isDoublePinchClick, cursor }}>
      {children}
      {!isGazeRoute && (
        <AirGestureCursor
          visible={handDetected}
          isPinching={isPinching}
          isDoublePinchClick={isDoublePinchClick}
          isDragging={isDraggingRef.current}
          cursor={cursor}
        />
      )}
    </AirGestureContext.Provider>
  );
}

/**
 * Clean Cyan / Emerald Air Pinch Reticle with Double-Pinch and Drag Feedback
 */
function AirGestureCursor({ visible, isPinching, isDoublePinchClick, isDragging, cursor }) {
  if (!visible) return null;

  return (
    <div
      className="fixed pointer-events-none z-[99999] transition-transform duration-75 ease-out"
      style={{
        left: `${cursor.x}px`,
        top: `${cursor.y}px`,
        transform: `translate(-50%, -50%) scale(${isDoublePinchClick ? 0.75 : isPinching ? 0.85 : 1})`,
        willChange: 'left, top, transform',
        opacity: visible ? 1 : 0,
      }}
      aria-hidden="true"
    >
      <div className="relative flex items-center justify-center">
        {/* Outer glowing ring */}
        <div
          className={`h-11 w-11 rounded-full border-2 transition-all duration-150 ${
            isDoublePinchClick
              ? 'border-emerald-400 bg-emerald-400/40 shadow-[0_0_28px_rgba(52,211,153,1)] scale-110'
              : isDragging
              ? 'border-cyan-300 bg-cyan-400/25 shadow-[0_0_20px_rgba(6,182,212,0.9)]'
              : isPinching
              ? 'border-emerald-400 bg-emerald-400/25 shadow-[0_0_18px_rgba(52,211,153,0.8)]'
              : 'border-cyan-400 bg-cyan-400/15 shadow-[0_0_18px_rgba(6,182,212,0.8)] animate-pulse'
          }`}
        />

        {/* Center dot */}
        <div
          className={`absolute h-3.5 w-3.5 rounded-full border-2 border-white transition-all duration-150 ${
            isDoublePinchClick || isPinching
              ? 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,1)]'
              : 'bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,1)]'
          }`}
        />

        {/* Double Pinch Ripple Wave */}
        {isDoublePinchClick && (
          <div className="absolute h-16 w-16 rounded-full border-2 border-emerald-400/80 animate-ping" />
        )}

        {/* Status Indicator Badge */}
        {isDragging ? (
          <div className="absolute -top-7 whitespace-nowrap rounded-full bg-[#1f352d] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-cyan-300 shadow-lg border border-cyan-400/60">
            Swipe ↕
          </div>
        ) : isDoublePinchClick ? (
          <div className="absolute -top-7 whitespace-nowrap rounded-full bg-[#1f352d] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400 shadow-lg border border-emerald-400/60 animate-bounce">
            Clicked!
          </div>
        ) : isPinching ? (
          <div className="absolute -top-7 whitespace-nowrap rounded-full bg-[#1f352d] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400 shadow-lg border border-emerald-400/60">
            Hold to Swipe
          </div>
        ) : null}
      </div>
    </div>
  );
}

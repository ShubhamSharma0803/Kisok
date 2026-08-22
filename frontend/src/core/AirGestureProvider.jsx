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
  cursor: { x: 0, y: 0 },
});

export const useAirGestures = () => useContext(AirGestureContext);

const PINCH_THRESHOLD = 0.045; // Euclidean distance threshold for thumb-index pinch
const LERP_ALPHA = 0.35; // Snappy smoothing factor
const CLICK_COOLDOWN_MS = 350; // Minimum interval between pinch clicks

export function AirGestureProvider({ children }) {
  const location = useLocation();

  // Disabled ONLY in Gaze Mode to prevent cursor & dwell conflicts
  const isGazeRoute = location.pathname === '/gaze';

  const [handDetected, setHandDetected] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
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

  const wasPinchingRef = useRef(false);
  const lastClickTimeRef = useRef(0);
  const isHandVisibleRef = useRef(false);

  useEffect(() => {
    // If we're on the Gaze Route, unmount/pause everything
    if (isGazeRoute) {
      setHandDetected(false);
      setIsPinching(false);
      return;
    }

    let isCancelled = false;

    // Create off-screen video element for webcam capture
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

          if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            if (isHandVisibleRef.current) {
              isHandVisibleRef.current = false;
              setHandDetected(false);
              setIsPinching(false);
              wasPinchingRef.current = false;
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

          // Soft Clamping to Viewport Bounds
          const targetX = Math.max(10, Math.min(screenW - 10, rawTargetX));
          const targetY = Math.max(10, Math.min(screenH - 10, rawTargetY));

          // 2. LERP Smoothing (alpha = 0.35)
          const prev = cursorRef.current;
          const nextX = prev.x + (targetX - prev.x) * LERP_ALPHA;
          const nextY = prev.y + (targetY - prev.y) * LERP_ALPHA;

          cursorRef.current = { x: nextX, y: nextY };
          setCursor({ x: nextX, y: nextY });

          // 3. Pinch-to-Click Detection (Euclidean 3D Distance)
          const dx = thumbTip.x - indexTip.x;
          const dy = thumbTip.y - indexTip.y;
          const dz = (thumbTip.z || 0) - (indexTip.z || 0);
          const pinchDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);

          const pinchingNow = pinchDistance < PINCH_THRESHOLD;
          setIsPinching(pinchingNow);

          const now = performance.now();

          // 4. Trigger Click on Pinch Down (false -> true transition)
          if (pinchingNow && !wasPinchingRef.current) {
            if (now - lastClickTimeRef.current >= CLICK_COOLDOWN_MS) {
              lastClickTimeRef.current = now;

              // Find and click target element under air cursor
              const hitElement = document.elementFromPoint(nextX, nextY);
              if (hitElement) {
                const clickable = hitElement.closest(
                  'button, a, input, select, textarea, [role="button"], [data-clickable], article, .clickable'
                ) || hitElement;

                clickable.click();
              }
            }
          }
          wasPinchingRef.current = pinchingNow;

          // 5. Contactless Air-Scrolling (Top & Bottom 12% Viewport Trigger Zones)
          const scrollMarginTop = screenH * 0.12;
          const scrollMarginBottom = screenH * 0.88;

          if (nextY < scrollMarginTop) {
            const intensity = (1 - nextY / scrollMarginTop);
            const scrollDelta = -Math.round(intensity * 18);
            window.scrollBy({ top: scrollDelta, behavior: 'auto' });
            
            // Also scroll any active overflow container under cursor if present
            const scrollTarget = document.elementFromPoint(nextX, nextY)?.closest('.overflow-y-auto, .overflow-y-scroll, main');
            if (scrollTarget && scrollTarget !== document.body) {
              scrollTarget.scrollBy({ top: scrollDelta, behavior: 'auto' });
            }
          } else if (nextY > scrollMarginBottom) {
            const intensity = (nextY - scrollMarginBottom) / (screenH * 0.12);
            const scrollDelta = Math.round(intensity * 18);
            window.scrollBy({ top: scrollDelta, behavior: 'auto' });

            const scrollTarget = document.elementFromPoint(nextX, nextY)?.closest('.overflow-y-auto, .overflow-y-scroll, main');
            if (scrollTarget && scrollTarget !== document.body) {
              scrollTarget.scrollBy({ top: scrollDelta, behavior: 'auto' });
            }
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
    <AirGestureContext.Provider value={{ handDetected, isPinching, cursor }}>
      {children}
      {/* Global Air Reticle Cursor (Unmounted in Gaze Mode) */}
      {!isGazeRoute && <AirGestureCursor visible={handDetected} isPinching={isPinching} cursor={cursor} />}
    </AirGestureContext.Provider>
  );
}

/**
 * Sleek Cyan / Emerald Glowing Air Gesture Reticle
 */
function AirGestureCursor({ visible, isPinching, cursor }) {
  if (!visible) return null;

  return (
    <div
      className="fixed pointer-events-none z-[99999] transition-transform duration-100 ease-out"
      style={{
        left: `${cursor.x}px`,
        top: `${cursor.y}px`,
        transform: `translate(-50%, -50%) scale(${isPinching ? 0.8 : 1})`,
        willChange: 'left, top, transform',
        opacity: visible ? 1 : 0,
      }}
      aria-hidden="true"
    >
      <div className="relative flex items-center justify-center">
        {/* Outer glowing pulsing ring */}
        <div
          className={`h-11 w-11 rounded-full border-2 transition-all duration-150 ${
            isPinching
              ? 'border-emerald-400 bg-emerald-400/30 shadow-[0_0_24px_rgba(52,211,153,0.95)]'
              : 'border-cyan-400 bg-cyan-400/15 shadow-[0_0_18px_rgba(6,182,212,0.8)] animate-pulse'
          }`}
        />

        {/* Center core cursor dot */}
        <div
          className={`absolute h-4 w-4 rounded-full border-2 border-white transition-all duration-150 ${
            isPinching
              ? 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,1)]'
              : 'bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,1)]'
          }`}
        />

        {/* Pinch Click Feedback Indicator */}
        {isPinching && (
          <div className="absolute -top-6 whitespace-nowrap rounded-full bg-[#1f352d] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400 shadow-md border border-emerald-400/50">
            Click
          </div>
        )}
      </div>
    </div>
  );
}

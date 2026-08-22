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
  isTapping: false,
  cursor: { x: 0, y: 0 },
});

export const useAirGestures = () => useContext(AirGestureContext);

// Interaction Tunings
const LERP_ALPHA = 0.35; // Snappy cursor smoothing
const TAP_COOLDOWN_MS = 400; // Cooldown after air-tap to avoid accidental multi-clicks
const SWIPE_WINDOW_MS = 250; // Rolling time window to measure hand swipe velocity
const SWIPE_THRESHOLD = 0.13; // Minimum vertical displacement for swipe detection
const SWIPE_COOLDOWN_MS = 500; // Debounce after swipe action
const SCROLL_AMOUNT_PX = 450; // Smooth scroll step amount

export function AirGestureProvider({ children }) {
  const location = useLocation();

  // Disabled ONLY in Gaze Mode to prevent cursor & dwell conflicts
  const isGazeRoute = location.pathname === '/gaze';

  const [handDetected, setHandDetected] = useState(false);
  const [isTapping, setIsTapping] = useState(false);
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

  const prevIndexTipRef = useRef(null);
  const lastTapTimeRef = useRef(0);
  const lastSwipeTimeRef = useRef(0);
  const wristHistoryRef = useRef([]); // [{ time, y }]
  const isHandVisibleRef = useRef(false);

  useEffect(() => {
    // If we're on the Gaze Route, unmount/pause everything
    if (isGazeRoute) {
      setHandDetected(false);
      setIsTapping(false);
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
          const now = performance.now();

          if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            if (isHandVisibleRef.current) {
              isHandVisibleRef.current = false;
              setHandDetected(false);
              setIsTapping(false);
              wristHistoryRef.current = [];
              prevIndexTipRef.current = null;
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
          // Landmark 6: Index PIP Knuckle
          const indexPip = landmarks[6];
          // Landmark 5: Index MCP Knuckle
          const indexMcp = landmarks[5];
          // Landmark 12: Middle Fingertip (Reference)
          const middleTip = landmarks[12];
          // Landmark 0: Wrist
          const wrist = landmarks[0];
          // Landmark 9: Middle MCP (Palm Center)
          const middleMcp = landmarks[9];

          if (!indexTip || !wrist) return;

          // 1. Mirrored Horizontal Position Mapping for natural interaction
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

          // 3. Natural Finger Air-Tap Detection
          // Detect sharp downward/forward index finger press motion relative to knuckle/hand plane
          let isTapAction = false;

          if (indexPip && indexMcp && prevIndexTipRef.current) {
            const dt = Math.max(16, now - prevIndexTipRef.current.time);
            const downwardVelocity = (indexTip.y - prevIndexTipRef.current.y) / (dt / 1000); // normalized unit/sec
            const forwardDepth = (indexTip.z || 0) - (indexMcp.z || 0);

            // Relative finger bend / dip
            const relativeDip = (indexTip.y - indexPip.y);
            const dipVsMiddle = middleTip ? (indexTip.y - middleTip.y) : 0;

            // Trigger criteria: sharp downward velocity + dip or forward depth press
            if ((downwardVelocity > 0.45 && (relativeDip > 0.015 || dipVsMiddle > 0.025)) || forwardDepth < -0.055) {
              isTapAction = true;
            }
          }

          prevIndexTipRef.current = { y: indexTip.y, z: indexTip.z || 0, time: now };

          if (isTapAction && now - lastTapTimeRef.current >= TAP_COOLDOWN_MS) {
            lastTapTimeRef.current = now;
            setIsTapping(true);
            setTimeout(() => setIsTapping(false), 200);

            // Dispatch native click to target element under air cursor
            const hitElement = document.elementFromPoint(nextX, nextY);
            if (hitElement) {
              const clickable = hitElement.closest(
                'button, a, input, select, textarea, [role="button"], [data-clickable], article, .clickable'
              ) || hitElement;

              clickable.click();
            }
          }

          // 4. Vertical Hand Swipe Gesture (Scrolling)
          const handCenterY = (wrist.y + (middleMcp ? middleMcp.y : wrist.y)) / 2.0;
          wristHistoryRef.current.push({ time: now, y: handCenterY });

          // Clean buffer older than SWIPE_WINDOW_MS (250ms)
          wristHistoryRef.current = wristHistoryRef.current.filter((entry) => now - entry.time <= SWIPE_WINDOW_MS);

          if (wristHistoryRef.current.length >= 3 && now - lastSwipeTimeRef.current >= SWIPE_COOLDOWN_MS) {
            const oldest = wristHistoryRef.current[0];
            const deltaY = handCenterY - oldest.y; // Negative = Upward hand motion, Positive = Downward hand motion

            if (deltaY < -SWIPE_THRESHOLD) {
              // Rapid Hand Swipe UP -> Scroll Page UP
              lastSwipeTimeRef.current = now;
              wristHistoryRef.current = []; // Reset after trigger

              window.scrollBy({ top: -SCROLL_AMOUNT_PX, behavior: 'smooth' });

              const scrollTarget = document.elementFromPoint(nextX, nextY)?.closest('.overflow-y-auto, .overflow-y-scroll, main');
              if (scrollTarget && scrollTarget !== document.body) {
                scrollTarget.scrollBy({ top: -SCROLL_AMOUNT_PX, behavior: 'smooth' });
              }
            } else if (deltaY > SWIPE_THRESHOLD) {
              // Rapid Hand Swipe DOWN -> Scroll Page DOWN
              lastSwipeTimeRef.current = now;
              wristHistoryRef.current = []; // Reset after trigger

              window.scrollBy({ top: SCROLL_AMOUNT_PX, behavior: 'smooth' });

              const scrollTarget = document.elementFromPoint(nextX, nextY)?.closest('.overflow-y-auto, .overflow-y-scroll, main');
              if (scrollTarget && scrollTarget !== document.body) {
                scrollTarget.scrollBy({ top: SCROLL_AMOUNT_PX, behavior: 'smooth' });
              }
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
    <AirGestureContext.Provider value={{ handDetected, isTapping, cursor }}>
      {children}
      {/* Global Air Reticle Cursor (Unmounted in Gaze Mode) */}
      {!isGazeRoute && <AirGestureCursor visible={handDetected} isTapping={isTapping} cursor={cursor} />}
    </AirGestureContext.Provider>
  );
}

/**
 * Sleek Glowing Cyan / Emerald Air Tap Reticle with Ripple
 */
function AirGestureCursor({ visible, isTapping, cursor }) {
  if (!visible) return null;

  return (
    <div
      className="fixed pointer-events-none z-[99999] transition-transform duration-100 ease-out"
      style={{
        left: `${cursor.x}px`,
        top: `${cursor.y}px`,
        transform: `translate(-50%, -50%) scale(${isTapping ? 0.75 : 1})`,
        willChange: 'left, top, transform',
        opacity: visible ? 1 : 0,
      }}
      aria-hidden="true"
    >
      <div className="relative flex items-center justify-center">
        {/* Outer glowing ring */}
        <div
          className={`h-11 w-11 rounded-full border-2 transition-all duration-150 ${
            isTapping
              ? 'border-emerald-400 bg-emerald-400/35 shadow-[0_0_26px_rgba(52,211,153,1)] scale-110'
              : 'border-cyan-400 bg-cyan-400/15 shadow-[0_0_18px_rgba(6,182,212,0.8)] animate-pulse'
          }`}
        />

        {/* Center core cursor dot */}
        <div
          className={`absolute h-4 w-4 rounded-full border-2 border-white transition-all duration-150 ${
            isTapping
              ? 'bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,1)]'
              : 'bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,1)]'
          }`}
        />

        {/* Ripple Wave on Tap */}
        {isTapping && (
          <div className="absolute h-16 w-16 rounded-full border-2 border-emerald-400/60 animate-ping" />
        )}

        {/* Tap Feedback Badge */}
        {isTapping && (
          <div className="absolute -top-7 whitespace-nowrap rounded-full bg-[#1f352d] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400 shadow-lg border border-emerald-400/60 animate-bounce">
            Tap
          </div>
        )}
      </div>
    </div>
  );
}

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

// Interaction Parameters
const LERP_ALPHA = 0.35; // Cursor smoothing factor
const CLICK_COOLDOWN_MS = 380; // Debounce between clicks
const SWIPE_STEP_PX = 460; // Step scroll distance on swipe
const SWIPE_WINDOW_MS = 200; // Time window to measure hand velocity impulse
const SWIPE_VELOCITY_THRESHOLD = 0.07; // Minimum hand displacement within window
const SWIPE_COOLDOWN_MS = 550; // Cooldown after a swipe to completely ignore hand-return movements
const PINCH_THRESHOLD = 0.055; // 3D Distance for index-thumb pinch click

export function AirGestureProvider({ children }) {
  const location = useLocation();

  // Disabled strictly on Gaze Mode to prevent cursor & dwell collisions
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

  // Gestures & state machine refs
  const lastClickTimeRef = useRef(0);
  const lastSwipeTimeRef = useRef(0);
  const motionHistoryRef = useRef([]); // [{ time, y }]
  const wasPinchingRef = useRef(false);
  const wasTappingRef = useRef(false);
  const isHandVisibleRef = useRef(false);

  useEffect(() => {
    if (isGazeRoute) {
      setHandDetected(false);
      setIsTapping(false);
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
              setIsTapping(false);
              motionHistoryRef.current = [];
              wasPinchingRef.current = false;
              wasTappingRef.current = false;
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
          // Landmark 6: Index PIP Knuckle
          const indexPip = landmarks[6];
          // Landmark 5: Index MCP Knuckle
          const indexMcp = landmarks[5];
          // Landmark 0: Wrist
          const wrist = landmarks[0];
          // Landmark 9: Middle MCP (Palm Center)
          const palm = landmarks[9] || wrist;

          if (!indexTip || !wrist || !thumbTip) return;

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

          // 3. Dual Click Detection (Pinch + Finger Air-Tap)
          // A. Pinch Distance
          const pinchDx = thumbTip.x - indexTip.x;
          const pinchDy = thumbTip.y - indexTip.y;
          const pinchDz = (thumbTip.z || 0) - (indexTip.z || 0);
          const pinchDistance = Math.sqrt(pinchDx * pinchDx + pinchDy * pinchDy + pinchDz * pinchDz);
          const isPinching = pinchDistance < PINCH_THRESHOLD;

          // B. Finger Air Tap (Index bends forward/down relative to PIP while wrist stays stable)
          const isFingerBendingDown = (indexTip.y - indexPip.y) > 0.005;
          const isAirTapping = isFingerBendingDown;

          const clickTriggered =
            (isPinching && !wasPinchingRef.current) ||
            (isAirTapping && !wasTappingRef.current);

          if (clickTriggered && now - lastClickTimeRef.current >= CLICK_COOLDOWN_MS) {
            lastClickTimeRef.current = now;
            setIsTapping(true);
            setTimeout(() => setIsTapping(false), 240);

            // Execute native click on target element under cursor
            const hitElement = document.elementFromPoint(nextX, nextY);
            if (hitElement) {
              const clickable = hitElement.closest(
                'button, a, input, select, textarea, [role="button"], [data-clickable], article, .clickable'
              ) || hitElement;

              clickable.click();
            }
          }

          wasPinchingRef.current = isPinching;
          wasTappingRef.current = isAirTapping;

          // 4. Natural Ballistic Hand Swipe Gestures (Correct Physical Inversion)
          const handCenterY = (wrist.y + palm.y + indexMcp.y) / 3.0;

          // Only accumulate swipe momentum if not currently in swipe cooldown (ignoring return motion)
          if (now - lastSwipeTimeRef.current >= SWIPE_COOLDOWN_MS) {
            motionHistoryRef.current.push({ time: now, y: handCenterY });

            // Keep only samples within the recent SWIPE_WINDOW_MS (200ms)
            motionHistoryRef.current = motionHistoryRef.current.filter(
              (entry) => now - entry.time <= SWIPE_WINDOW_MS
            );

            if (motionHistoryRef.current.length >= 3) {
              const oldest = motionHistoryRef.current[0];
              const deltaY = handCenterY - oldest.y;

              // Physical Natural Swipe Direction:
              // - Swiping Hand UP (deltaY < -threshold): Pushes content up -> Viewport scrolls DOWN to reveal lower items.
              // - Swiping Hand DOWN (deltaY > threshold): Pulls content down -> Viewport scrolls UP to reveal upper items.
              if (deltaY < -SWIPE_VELOCITY_THRESHOLD) {
                // Hand Swiped UP -> Scroll DOWN (+SWIPE_STEP_PX)
                lastSwipeTimeRef.current = now;
                motionHistoryRef.current = []; // Clear history to ignore return motion

                window.scrollBy({ top: SWIPE_STEP_PX, behavior: 'smooth' });

                const scrollTarget = document
                  .elementFromPoint(nextX, nextY)
                  ?.closest('.overflow-y-auto, .overflow-y-scroll, main');
                if (scrollTarget && scrollTarget !== document.body) {
                  scrollTarget.scrollBy({ top: SWIPE_STEP_PX, behavior: 'smooth' });
                }
              } else if (deltaY > SWIPE_VELOCITY_THRESHOLD) {
                // Hand Swiped DOWN -> Scroll UP (-SWIPE_STEP_PX)
                lastSwipeTimeRef.current = now;
                motionHistoryRef.current = []; // Clear history to ignore return motion

                window.scrollBy({ top: -SWIPE_STEP_PX, behavior: 'smooth' });

                const scrollTarget = document
                  .elementFromPoint(nextX, nextY)
                  ?.closest('.overflow-y-auto, .overflow-y-scroll, main');
                if (scrollTarget && scrollTarget !== document.body) {
                  scrollTarget.scrollBy({ top: -SWIPE_STEP_PX, behavior: 'smooth' });
                }
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
      {!isGazeRoute && <AirGestureCursor visible={handDetected} isTapping={isTapping} cursor={cursor} />}
    </AirGestureContext.Provider>
  );
}

/**
 * Sleek Cyan / Emerald Air Tap Reticle with Ripple & Status Pulse
 */
function AirGestureCursor({ visible, isTapping, cursor }) {
  if (!visible) return null;

  return (
    <div
      className="fixed pointer-events-none z-[99999] transition-transform duration-75 ease-out"
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

        {/* Center dot */}
        <div
          className={`absolute h-3.5 w-3.5 rounded-full border-2 border-white transition-all duration-150 ${
            isTapping
              ? 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,1)]'
              : 'bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,1)]'
          }`}
        />

        {/* Tap Ripple on Click */}
        {isTapping && (
          <div className="absolute h-16 w-16 rounded-full border-2 border-emerald-400/70 animate-ping" />
        )}
      </div>
    </div>
  );
}

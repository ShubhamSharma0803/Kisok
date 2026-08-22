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
const LERP_ALPHA = 0.35; // Cursor smoothing factor
const TAP_COOLDOWN_MS = 400; // Cooldown between consecutive taps
const SWIPE_STEP_PX = 420; // Smooth step amount for fast flicks

export function AirGestureProvider({ children }) {
  const location = useLocation();

  // Disabled strictly on Gaze Mode to avoid cursor & dwell collisions
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

  // Tap state machine refs
  const fingerStateRef = useRef('extended'); // 'extended' | 'pressed'
  const lastTapTimeRef = useRef(0);
  const prevHandPosRef = useRef(null);
  const lastSwipeTimeRef = useRef(0);
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
              fingerStateRef.current = 'extended';
              prevHandPosRef.current = null;
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
          // Landmark 0: Wrist
          const wrist = landmarks[0];
          // Landmark 9: Middle MCP (Palm Center)
          const palm = landmarks[9] || wrist;

          if (!indexTip || !wrist || !indexPip) return;

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

          // 3. Wrist Movement & Swipe Velocity Calculation
          const currentHandY = (wrist.y + palm.y) / 2.0;
          const currentHandX = (wrist.x + palm.x) / 2.0;

          let wristSpeed = 0;
          let deltaY = 0;

          if (prevHandPosRef.current) {
            const dx = currentHandX - prevHandPosRef.current.x;
            const dy = currentHandY - prevHandPosRef.current.y;
            deltaY = dy;
            wristSpeed = Math.hypot(dx, dy);
          }

          // 4. Natural Finger Air-Tap Detection (State Machine)
          // When clicking: The wrist/palm is relatively STILL, while the index finger presses down and releases.
          const isWristStill = wristSpeed < 0.035;

          // Extension distance: indexPip.y - indexTip.y (Positive when finger is pointing up/extended)
          const extensionDist = indexPip.y - indexTip.y;

          if (fingerStateRef.current === 'extended') {
            // Finger presses down: tip moves level with or below PIP knuckle while wrist is held still
            if (extensionDist < 0.008 && isWristStill) {
              fingerStateRef.current = 'pressed';

              if (now - lastTapTimeRef.current >= TAP_COOLDOWN_MS) {
                lastTapTimeRef.current = now;
                setIsTapping(true);
                setTimeout(() => setIsTapping(false), 220);

                // Dispatch native click at current cursor position
                const hitElement = document.elementFromPoint(nextX, nextY);
                if (hitElement) {
                  const clickable = hitElement.closest(
                    'button, a, input, select, textarea, [role="button"], [data-clickable], article, .clickable'
                  ) || hitElement;

                  clickable.click();
                }
              }
            }
          } else if (fingerStateRef.current === 'pressed') {
            // Re-arm state: Finger must be lifted back up into extended pose
            if (extensionDist > 0.03) {
              fingerStateRef.current = 'extended';
            }
          }

          // 5. Natural Vertical Hand Swipe / Air Drag Scrolling
          // When moving hand up or down (wrist & fingers moving together)
          if (prevHandPosRef.current && wristSpeed > 0.025) {
            // A. Fast Flick Gesture
            if (Math.abs(deltaY) > 0.055 && now - lastSwipeTimeRef.current >= 450) {
              lastSwipeTimeRef.current = now;
              const scrollStep = deltaY < 0 ? -SWIPE_STEP_PX : SWIPE_STEP_PX;

              window.scrollBy({ top: scrollStep, behavior: 'smooth' });

              const scrollTarget = document.elementFromPoint(nextX, nextY)?.closest('.overflow-y-auto, .overflow-y-scroll, main');
              if (scrollTarget && scrollTarget !== document.body) {
                scrollTarget.scrollBy({ top: scrollStep, behavior: 'smooth' });
              }
            }
            // B. Continuous Hand Drag Scrolling
            else if (Math.abs(deltaY) > 0.012 && Math.abs(deltaY) <= 0.055) {
              const scrollAmount = deltaY * screenH * 1.6;
              window.scrollBy({ top: scrollAmount, behavior: 'auto' });

              const scrollTarget = document.elementFromPoint(nextX, nextY)?.closest('.overflow-y-auto, .overflow-y-scroll, main');
              if (scrollTarget && scrollTarget !== document.body) {
                scrollTarget.scrollBy({ top: scrollAmount, behavior: 'auto' });
              }
            }
          }

          prevHandPosRef.current = { x: currentHandX, y: currentHandY, time: now };
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
 * Clean Cyan / Emerald Air Tap Reticle with Ripple
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
        {/* Glowing ring */}
        <div
          className={`h-10 w-10 rounded-full border-2 transition-all duration-150 ${
            isTapping
              ? 'border-emerald-400 bg-emerald-400/35 shadow-[0_0_24px_rgba(52,211,153,1)] scale-110'
              : 'border-cyan-400 bg-cyan-400/15 shadow-[0_0_16px_rgba(6,182,212,0.75)]'
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

        {/* Tap Ripple */}
        {isTapping && (
          <div className="absolute h-14 w-14 rounded-full border-2 border-emerald-400/70 animate-ping" />
        )}
      </div>
    </div>
  );
}

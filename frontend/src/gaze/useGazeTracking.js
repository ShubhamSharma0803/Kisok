import { useEffect, useRef, useState, useCallback } from 'react';
import { updateChannel } from '../core/api';

const FACEMESH_SCRIPT = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';

let scriptLoadPromise = null;

function loadMediaPipeFaceMesh() {
  if (typeof window !== 'undefined' && window.FaceMesh) {
    return Promise.resolve(window.FaceMesh);
  }
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${FACEMESH_SCRIPT}"]`);
    if (existing && window.FaceMesh) {
      return resolve(window.FaceMesh);
    }
    const script = document.createElement('script');
    script.src = FACEMESH_SCRIPT;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (window.FaceMesh) {
        resolve(window.FaceMesh);
      } else {
        reject(new Error('FaceMesh loaded but window.FaceMesh undefined'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load MediaPipe FaceMesh'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

// Gain Multipliers
const HEAD_GAIN_X = 3.5; // Horizontal head yaw multiplier
const HEAD_GAIN_Y = 4.2; // Vertical head pitch multiplier
const IRIS_GAIN_X = 1.8; // Fine iris horizontal multiplier
const IRIS_GAIN_Y = 2.2; // Fine iris vertical multiplier

// Snappy zero-lag smoothing
const LERP_ALPHA = 0.35;
// 3px deadband to absorb micro-saccadic eye tremor
const DEADBAND_PX = 3.0;
// Screen boundary padding
const SCREEN_MARGIN_PX = 25;
// Baseline calibration frames
const CALIBRATION_FRAMES = 8;

export function useGazeTracking({ enabled = true, sessionId = null }) {
  const [gaze, setGaze] = useState(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 500,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 400,
  }));
  const [status, setStatus] = useState('loading'); // loading | ready | calibration_failed | denied | error

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceMeshRef = useRef(null);
  const animFrameRef = useRef(null);

  const cursorRef = useRef({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 500,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 400,
  });

  const frameCountRef = useRef(0);
  const baselineRef = useRef(null); // { nose: {x, y}, iris: {x, y} }
  const sessionIdRef = useRef(sessionId);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    if (sessionId && status === 'ready') {
      updateChannel(sessionId, 'gaze_input', true).catch((err) => {
        console.warn('[useGazeTracking] Failed to set gaze_input=true on late session init:', err);
      });
    }
  }, [sessionId, status]);

  const resetCenter = useCallback(() => {
    frameCountRef.current = 0;
    baselineRef.current = null;
    const center = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    cursorRef.current = center;
    setGaze(center);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let isCancelled = false;
    setStatus('loading');
    frameCountRef.current = 0;
    baselineRef.current = null;

    // 15-second calibration timeout
    const timeoutId = setTimeout(() => {
      if (!isCancelled) {
        setStatus((prev) => {
          if (prev !== 'ready') {
            console.warn('[useGazeTracking] 15s calibration timeout exceeded -> calibration_failed');
            return 'calibration_failed';
          }
          return prev;
        });
      }
    }, 15000);

    const markReady = () => {
      setStatus('ready');
      const currentSid = sessionIdRef.current;
      if (currentSid) {
        updateChannel(currentSid, 'gaze_input', true).catch((err) => {
          console.warn('[useGazeTracking] Failed to set gaze_input=true:', err);
        });
      }
    };

    // 1. Create hidden offscreen video element for real-time camera frames
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

    async function initTracking() {
      try {
        // 2. Request user camera directly
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

        // 3. Load MediaPipe FaceMesh
        const FaceMeshClass = await loadMediaPipeFaceMesh();
        if (isCancelled) return;

        const faceMesh = new FaceMeshClass({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true, // Enables iris landmarks 468-477
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        // 4. On Results: Process Hybrid Head Pose + Iris Gaze Coordinates
        faceMesh.onResults((results) => {
          if (isCancelled) return;

          if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            return;
          }

          const landmarks = results.multiFaceLandmarks[0];
          const screenW = window.innerWidth || 1920;
          const screenH = window.innerHeight || 1080;

          // Landmark 1: Nose tip (0.0 to 1.0)
          const nose = landmarks[1];
          // Landmark 468: Left Iris center
          const iris = landmarks[468] || landmarks[1];
          // Landmark 33 & 133: Left eye corners
          const eyeOuter = landmarks[33] || { x: 0.3, y: 0.3 };
          const eyeInner = landmarks[133] || { x: 0.4, y: 0.3 };
          const eyeTop = landmarks[159] || { x: 0.35, y: 0.28 };
          const eyeBottom = landmarks[145] || { x: 0.35, y: 0.32 };

          const noseX = nose.x;
          const noseY = nose.y;

          const eyeWidth = Math.max(0.01, Math.abs(eyeOuter.x - eyeInner.x));
          const eyeHeight = Math.max(0.01, Math.abs(eyeBottom.y - eyeTop.y));

          const irisRatioX = (iris.x - Math.min(eyeOuter.x, eyeInner.x)) / eyeWidth - 0.5;
          const irisRatioY = (iris.y - eyeTop.y) / eyeHeight - 0.5;

          // Auto-centering Baseline (first 8 frames upon mounting)
          if (!baselineRef.current) {
            frameCountRef.current += 1;
            if (frameCountRef.current >= CALIBRATION_FRAMES) {
              baselineRef.current = {
                nose: { x: noseX, y: noseY },
                iris: { x: irisRatioX, y: irisRatioY },
              };
              const initialCenter = { x: screenW / 2, y: screenH / 2 };
              cursorRef.current = initialCenter;
              setGaze(initialCenter);
              markReady();
            }
            return;
          }

          // Compute Deltas (Mirrored horizontal axis for webcam)
          const headDeltaX = -(noseX - baselineRef.current.nose.x);
          const headDeltaY = noseY - baselineRef.current.nose.y;

          const irisDeltaX = -(irisRatioX - baselineRef.current.iris.x);
          const irisDeltaY = irisRatioY - baselineRef.current.iris.y;

          // Hybrid Fusion Vector
          const totalOffsetX = headDeltaX * HEAD_GAIN_X + irisDeltaX * IRIS_GAIN_X;
          const totalOffsetY = headDeltaY * HEAD_GAIN_Y + irisDeltaY * IRIS_GAIN_Y;

          // Map to screen coordinates centered at screen midpoint
          const targetX = screenW * 0.5 + totalOffsetX * screenW;
          const targetY = screenH * 0.5 + totalOffsetY * screenH;

          // Soft Clamping
          const clampedX = Math.max(SCREEN_MARGIN_PX, Math.min(screenW - SCREEN_MARGIN_PX, targetX));
          const clampedY = Math.max(SCREEN_MARGIN_PX, Math.min(screenH - SCREEN_MARGIN_PX, targetY));

          // Deadband filter
          const prev = cursorRef.current;
          const dist = Math.hypot(clampedX - prev.x, clampedY - prev.y);

          let nextX = prev.x;
          let nextY = prev.y;

          if (dist >= DEADBAND_PX) {
            nextX = prev.x + (clampedX - prev.x) * LERP_ALPHA;
            nextY = prev.y + (clampedY - prev.y) * LERP_ALPHA;
          }

          cursorRef.current = { x: nextX, y: nextY };
          setGaze({ x: nextX, y: nextY });
        });

        faceMeshRef.current = faceMesh;

        // 5. Continuous processing loop via requestVideoFrameCallback or rAF
        const processFrame = async () => {
          if (isCancelled) return;
          if (video && video.readyState >= 2) {
            try {
              await faceMesh.send({ image: video });
            } catch (_) {}
          }
          if ('requestVideoFrameCallback' in video) {
            video.requestVideoFrameCallback(() => {
              if (!isCancelled) processFrame();
            });
          } else {
            animFrameRef.current = requestAnimationFrame(processFrame);
          }
        };

        processFrame();
      } catch (err) {
        console.error('[useGazeTracking] Camera/FaceMesh initialization error:', err);
        if (!isCancelled) {
          setStatus('calibration_failed');
        }
      }
    }

    initTracking();

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (faceMeshRef.current) {
        try {
          faceMeshRef.current.close();
        } catch (_) {}
        faceMeshRef.current = null;
      }
      if (videoRef.current && videoRef.current.parentNode) {
        videoRef.current.parentNode.removeChild(videoRef.current);
        videoRef.current = null;
      }
    };
  }, [enabled]);

  return { gaze, status, resetCenter };
}
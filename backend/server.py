import asyncio
import json
import math
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

# Safe optional imports for vision dependencies on headless cloud servers (e.g. Railway)
try:
    import cv2
    import numpy as np
    import mediapipe as mp
    HAS_VISION_DEPS = True
except ImportError as err:
    print(f"[server.py] Vision hardware/OpenCV libraries not available on this host: {err}")
    HAS_VISION_DEPS = False
    cv2 = None
    np = None
    mp = None

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize MediaPipe Pose and Face Mesh if available
mp_pose = None
mp_face_mesh = None

if HAS_VISION_DEPS and mp is not None:
    try:
        mp_pose = mp.solutions.pose.Pose(
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,  # Enables iris landmarks (468-477)
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
    except Exception as e:
        print(f"[server.py] MediaPipe initialization error: {e}")

# Eye Landmark Indices for EAR Calculation
LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]


def calculate_ear(landmarks, indices, img_w, img_h):
    def dist(p1, p2):
        return math.hypot((p1.x - p2.x) * img_w, (p1.y - p2.y) * img_h)

    p1, p2, p3, p4, p5, p6 = [landmarks[i] for i in indices]
    v1 = dist(p2, p6)
    v2 = dist(p3, p5)
    h = dist(p1, p4)
    return (v1 + v2) / (2.0 * h) if h > 0 else 0.0


@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Kiosk Vision Detection Engine",
        "ws_endpoint": "/ws/detect"
    }


@app.websocket("/ws/detect")
async def detect_stream(websocket: WebSocket):
    await websocket.accept()

    # Cloud fallback if vision dependencies or hardware camera are absent
    cap = None
    if HAS_VISION_DEPS and cv2 is not None:
        try:
            cap = cv2.VideoCapture(0)
            if not cap.isOpened():
                cap = None
        except Exception:
            cap = None

    if cap is None:
        # Stream simulated progress for the 3.0s welcome animation and return standard decision
        try:
            for step in range(1, 31):
                pct = int((step / 30) * 100)
                await websocket.send_text(json.dumps({
                    "type": "telemetry",
                    "elapsed": round(step * 0.1, 2),
                    "progress_pct": pct,
                    "metrics": {
                        "shoulder_y": 0.5,
                        "nose_y": 0.4,
                        "ear_score": 0.25,
                        "hands_visible": True,
                        "gaze_status": "Ready"
                    }
                }))
                await asyncio.sleep(0.1)

            await websocket.send_text(json.dumps({
                "type": "final_decision",
                "data": {
                    "decision": "Simple Touch Mode",
                    "confidence": 0.95,
                    "reason": "Standard Fallback"
                }
            }))
        except Exception as e:
            print(f"[ws/detect] Fallback client disconnected: {type(e).__name__}")
        return

    # Hardware camera loop
    try:
        pose_buffer = []
        ear_buffer = []
        iris_gaze_buffer = []
        wrists_visible_frames = 0
        total_frames = 0

        start_time = asyncio.get_event_loop().time()
        duration = 3.0  # 3-second profiling window matching the 3.3s welcome animation

        while True:
            current_time = asyncio.get_event_loop().time()
            elapsed = current_time - start_time
            if elapsed >= duration:
                break

            ret, frame = cap.read()
            if not ret:
                await asyncio.sleep(0.04)
                continue

            total_frames += 1
            h, w, _ = frame.shape
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # 1. Pose Processing
            pose_results = mp_pose.process(rgb_frame) if mp_pose else None
            has_wrist = False
            current_pose = {}

            if pose_results and pose_results.pose_landmarks:
                landmarks = pose_results.pose_landmarks.landmark
                left_shoulder = landmarks[11]
                right_shoulder = landmarks[12]
                left_wrist = landmarks[15]
                right_wrist = landmarks[16]
                nose = landmarks[0]

                avg_shoulder_y = (left_shoulder.y + right_shoulder.y) / 2.0
                has_wrist = (left_wrist.visibility > 0.4) or (right_wrist.visibility > 0.4)
                if has_wrist:
                    wrists_visible_frames += 1

                current_pose = {
                    "shoulder_y": avg_shoulder_y,
                    "nose_y": nose.y,
                    "r_wrist_x": right_wrist.x if right_wrist.visibility > 0.4 else None,
                    "r_wrist_y": right_wrist.y if right_wrist.visibility > 0.4 else None
                }
                pose_buffer.append(current_pose)

            # 2. Face & Iris Processing
            face_results = mp_face_mesh.process(rgb_frame) if mp_face_mesh else None
            current_ear = 0.25
            gaze_locked = False

            if face_results and face_results.multi_face_landmarks:
                face_landmarks = face_results.multi_face_landmarks[0].landmark
                left_ear = calculate_ear(face_landmarks, LEFT_EYE, w, h)
                right_ear = calculate_ear(face_landmarks, RIGHT_EYE, w, h)
                current_ear = (left_ear + right_ear) / 2.0
                ear_buffer.append(current_ear)

                # Iris Landmarks (Left: 468, Right: 473)
                if len(face_landmarks) > 473:
                    left_iris = face_landmarks[468]
                    right_iris = face_landmarks[473]
                    if left_iris.visibility > 0.5 or right_iris.visibility > 0.5:
                        iris_gaze_buffer.append((left_iris.x, left_iris.y))
                        gaze_locked = True

            # Telemetry Stream for Frontend UI
            payload = {
                "type": "telemetry",
                "elapsed": round(elapsed, 2),
                "progress_pct": int((elapsed / duration) * 100),
                "metrics": {
                    "shoulder_y": round(current_pose.get("shoulder_y", 0), 3) if current_pose else "None",
                    "nose_y": round(current_pose.get("nose_y", 0), 3) if current_pose else "None",
                    "ear_score": round(current_ear, 3),
                    "hands_visible": bool(has_wrist),
                    "gaze_status": "Locked" if gaze_locked else ("Closed Eyes" if current_ear < 0.18 else "Searching")
                }
            }
            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(0.04)

        # Calculate final mode decision
        decision_payload = evaluate_profile(
            pose_buffer, 
            ear_buffer, 
            iris_gaze_buffer, 
            wrists_visible_frames, 
            total_frames
        )
        await websocket.send_text(json.dumps({"type": "final_decision", "data": decision_payload}))

    except Exception as e:
        # Gracefully handle client disconnects (WebSocketDisconnect, ClientDisconnected, etc.)
        print(f"[ws/detect] Client disconnected or error during detection: {type(e).__name__}")
    finally:
        if cap is not None:
            cap.release()



def evaluate_profile(pose_buffer, ear_buffer, iris_buffer, wrist_frames, total_frames):
    if not pose_buffer and not ear_buffer:
        print("[evaluate_profile] No pose or ear buffer -> Fallback Simple Touch Mode")
        return {
            "decision": "Simple Touch Mode",
            "confidence": 0.95,
            "reason": "Default fallback (No user detected)"
        }

    avg_shoulder_y = float(np.mean([p["shoulder_y"] for p in pose_buffer])) if (pose_buffer and np is not None) else 0.5
    avg_nose_y = float(np.mean([p["nose_y"] for p in pose_buffer])) if (pose_buffer and np is not None) else 0.5
    avg_ear = float(np.mean(ear_buffer)) if (ear_buffer and np is not None) else 0.25

    total = max(total_frames, 1)
    wrist_ratio = wrist_frames / total

    closed_eye_count = len([e for e in ear_buffer if e < 0.20])
    closed_eye_ratio = (closed_eye_count / len(ear_buffer)) if ear_buffer else 0.0

    # Tremor variance computation
    wrist_pts = [(p["r_wrist_x"], p["r_wrist_y"]) for p in pose_buffer if p.get("r_wrist_x") is not None]
    if len(wrist_pts) > 10 and np is not None:
        arr = np.array(wrist_pts)
        tremor_score = float(np.var(arr[:, 0]) + np.var(arr[:, 1]))
    else:
        tremor_score = 0.0

    # Height classification (y=0.0 top, y=1.0 bottom):
    is_tall_standing = (avg_nose_y < 0.26) and (avg_shoulder_y < 0.44)
    is_seated = (avg_nose_y >= 0.28 or avg_shoulder_y >= 0.46) and not is_tall_standing

    print(
        f"[evaluate_profile] avg_shoulder_y={avg_shoulder_y:.3f}, "
        f"avg_nose_y={avg_nose_y:.3f}, avg_ear={avg_ear:.3f}, closed_ratio={closed_eye_ratio:.2f}, "
        f"is_seated={is_seated}, is_tall={is_tall_standing}, wrist_ratio={wrist_ratio:.2f}, tremor={tremor_score:.5f}"
    )

    # 1. PRIORITY 1: Visual Impairment / Closed Eyes -> Simple Touch Mode (Voice Guided /order)
    if (closed_eye_ratio >= 0.35 or avg_ear < 0.19) and len(ear_buffer) >= 8:
        print("[evaluate_profile] Decision: Simple Touch Mode (Closed Eyes / Visual guidance required)")
        return {
            "decision": "Simple Touch Mode",
            "voice_assistant": True,
            "confidence": 0.95,
            "reason": "Closed eyes / Visual guidance required",
            "metrics": {"avg_ear": round(avg_ear, 3), "closed_eye_ratio": round(closed_eye_ratio, 2)}
        }

    # 2. PRIORITY 2: Seated / Wheelchair User (Lower height & reach) -> Big Icons Mode (/large-ui)
    if is_seated:
        print("[evaluate_profile] Decision: Big Icons Mode (Seated reach profile)")
        return {
            "decision": "Big Icons Mode",
            "confidence": 0.95,
            "reason": "Seated / Wheelchair height reach profile",
            "metrics": {"avg_shoulder_y": round(avg_shoulder_y, 3), "avg_nose_y": round(avg_nose_y, 3)}
        }

    # 3. PRIORITY 3: Hand Tremors -> Big Icons Mode (/large-ui)
    if tremor_score > 0.005:
        print("[evaluate_profile] Decision: Big Icons Mode (Tremor detected)")
        return {
            "decision": "Big Icons Mode",
            "confidence": 0.95,
            "reason": "Motor tremor compensation",
            "metrics": {"tremor_score": round(tremor_score, 5)}
        }

    # 4. PRIORITY 4: Hands-free / Upper Limb Limitation -> Gaze Mode (/gaze)
    if wrist_ratio < 0.15 and len(iris_buffer) >= 10 and avg_ear >= 0.20:
        print("[evaluate_profile] Decision: Gaze Mode (Hands-free gaze profile)")
        return {
            "decision": "Gaze Mode",
            "confidence": 0.95,
            "reason": "Hands-free gaze interaction profile",
            "metrics": {"wrist_ratio": round(wrist_ratio, 2), "iris_samples": len(iris_buffer)}
        }

    # 5. PRIORITY 5: Standard User -> Simple Touch Mode (/order)
    print("[evaluate_profile] Decision: Simple Touch Mode (Standard standing profile)")
    return {
        "decision": "Simple Touch Mode",
        "confidence": 0.96,
        "reason": "Standard standing touch profile",
        "metrics": {
            "avg_shoulder_y": round(avg_shoulder_y, 3),
            "avg_nose_y": round(avg_nose_y, 3),
            "avg_ear": round(avg_ear, 3)
        }
    }
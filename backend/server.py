import asyncio
import cv2
import json
import math
import numpy as np
import mediapipe as mp
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Enable CORS for React frontend (Vite / localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize MediaPipe Pose and Face Mesh
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
    cap = cv2.VideoCapture(0)

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
                await asyncio.sleep(0.03)
                continue

            total_frames += 1
            h, w, _ = frame.shape
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # 1. Pose Landmark Extraction
            pose_results = mp_pose.process(rgb_frame)
            current_pose = {}
            has_wrist = False

            if pose_results.pose_landmarks:
                lm = pose_results.pose_landmarks.landmark

                nose = lm[mp.solutions.pose.PoseLandmark.NOSE]
                l_sh = lm[mp.solutions.pose.PoseLandmark.LEFT_SHOULDER]
                r_sh = lm[mp.solutions.pose.PoseLandmark.RIGHT_SHOULDER]
                l_wr = lm[mp.solutions.pose.PoseLandmark.LEFT_WRIST]
                r_wr = lm[mp.solutions.pose.PoseLandmark.RIGHT_WRIST]

                avg_shoulder_y = (l_sh.y + r_sh.y) / 2.0
                has_wrist = (r_wr.visibility > 0.45 or l_wr.visibility > 0.45)

                if has_wrist:
                    wrists_visible_frames += 1

                current_pose = {
                    "nose_y": nose.y,
                    "shoulder_y": avg_shoulder_y,
                    "r_wrist_x": r_wr.x if has_wrist else None,
                    "r_wrist_y": r_wr.y if has_wrist else None
                }
                pose_buffer.append(current_pose)

            # 2. Face Mesh & EAR Calculation
            face_results = mp_face_mesh.process(rgb_frame)
            current_ear = 0.0
            gaze_locked = False

            if face_results.multi_face_landmarks:
                flm = face_results.multi_face_landmarks[0].landmark
                
                l_ear = calculate_ear(flm, LEFT_EYE, w, h)
                r_ear = calculate_ear(flm, RIGHT_EYE, w, h)
                current_ear = (l_ear + r_ear) / 2.0
                ear_buffer.append(current_ear)

                # Iris coordinate tracking (only when eyes are open)
                if current_ear >= 0.18 and len(flm) > 473:
                    left_iris = flm[468]
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
        cap.release()



def evaluate_profile(pose_buffer, ear_buffer, iris_buffer, wrist_frames, total_frames):
    if not pose_buffer and not ear_buffer:
        print("[evaluate_profile] No pose or ear buffer -> Fallback Simple Touch Mode")
        return {
            "decision": "Simple Touch Mode",
            "confidence": 0.5,
            "reason": "Default fallback (No user detected)"
        }

    avg_shoulder_y = float(np.mean([p["shoulder_y"] for p in pose_buffer])) if pose_buffer else 0.5
    avg_nose_y = float(np.mean([p["nose_y"] for p in pose_buffer])) if pose_buffer else 0.5
    avg_ear = float(np.mean(ear_buffer)) if ear_buffer else 0.0

    total = max(total_frames, 1)
    wrist_ratio = wrist_frames / total

    # Tremor variance computation
    wrist_pts = [(p["r_wrist_x"], p["r_wrist_y"]) for p in pose_buffer if p["r_wrist_x"] is not None]
    if len(wrist_pts) > 10:
        arr = np.array(wrist_pts)
        tremor_score = float(np.var(arr[:, 0]) + np.var(arr[:, 1]))
    else:
        tremor_score = 0.0

    # Height classification:
    # Top-of-frame is y=0.0, bottom is y=1.0.
    # Standing users have higher head position (lower y value, e.g. nose_y < 0.28, shoulder_y < 0.42).
    # Seated / wheelchair users have lower head position (higher y value, e.g. nose_y >= 0.28 or shoulder_y >= 0.46).
    is_tall_standing = (avg_nose_y < 0.25) and (avg_shoulder_y < 0.42)
    is_seated = (avg_shoulder_y >= 0.46 or avg_nose_y >= 0.28) and not is_tall_standing

    print(
        f"[evaluate_profile] avg_shoulder_y={avg_shoulder_y:.3f}, "
        f"avg_nose_y={avg_nose_y:.3f}, avg_ear={avg_ear:.3f}, "
        f"is_seated={is_seated}, is_tall={is_tall_standing}, tremor={tremor_score:.5f}"
    )

    # 1. PRIORITY 1: Visual Impairment (Closed Eyes / Low EAR) -> Voice Guided Touch Mode
    if avg_ear < 0.16 and len(ear_buffer) > 15:
        print("[evaluate_profile] Decision: Simple Touch Mode (Voice Guided / Low EAR)")
        return {
            "decision": "Simple Touch Mode",
            "voice_assistant": True,
            "confidence": 0.95,
            "metrics": {"avg_ear": round(avg_ear, 3), "reason": "Closed eyes / Visual guidance required"}
        }

    # 2. PRIORITY 2: Seated / Wheelchair User (Low Reach) -> Big Icons Mode
    if is_seated:
        print("[evaluate_profile] Decision: Big Icons Mode (Seated profile)")
        return {
            "decision": "Big Icons Mode",
            "confidence": 0.95,
            "metrics": {"avg_shoulder_y": round(avg_shoulder_y, 3), "avg_nose_y": round(avg_nose_y, 3)}
        }

    # 3. PRIORITY 3: Hand Tremors -> Big Icons Mode
    if tremor_score > 0.008:
        print("[evaluate_profile] Decision: Big Icons Mode (Tremor detected)")
        return {
            "decision": "Big Icons Mode",
            "confidence": 0.90,
            "metrics": {"tremor_score": round(tremor_score, 5), "sub_reason": "Motor Tremor Detected"}
        }

    # 4. PRIORITY 4: Severe Upper Limb Limitation -> Gaze Mode
    if is_tall_standing and wrist_ratio == 0.0 and len(iris_buffer) > 25 and avg_ear >= 0.18:
        print("[evaluate_profile] Decision: Gaze Mode")
        return {
            "decision": "Gaze Mode",
            "confidence": 0.92,
            "metrics": {"wrist_ratio": round(wrist_ratio, 2), "iris_samples": len(iris_buffer)}
        }

    # 5. PRIORITY 5: Standard User -> Simple Touch Mode
    print("[evaluate_profile] Decision: Simple Touch Mode (Standard)")
    return {
        "decision": "Simple Touch Mode",
        "confidence": 0.96,
        "metrics": {
            "avg_shoulder_y": round(avg_shoulder_y, 3),
            "avg_nose_y": round(avg_nose_y, 3),
            "avg_ear": round(avg_ear, 3)
        }
    }
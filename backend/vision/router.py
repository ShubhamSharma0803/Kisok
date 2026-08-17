from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from vision.narration_engine import narrate

# Safe optional import of WS manager
try:
    from core.ws_manager import manager as ws_manager
except Exception:
    ws_manager = None

router = APIRouter()


class NarrateRequest(BaseModel):
    screen: str = Field(..., pattern="^(start|menu|cart|gaze|handoff|payment|default)$")
    context: Dict[str, Any] = Field(default_factory=dict)
    screenshot_b64: Optional[str] = Field(default=None, description="Optional PNG base64 for VLM")
    prefer_vision: bool = Field(default=False, description="Use VLM if screenshot provided")
    push_ws: bool = Field(default=False, description="Also push result via WebSocket")


class NarrateResponse(BaseModel):
    narration: str
    tts_audio_b64: str
    source: str
    cached: bool
    elapsed_ms: int


@router.post("/sessions/{session_id}/narrate", response_model=NarrateResponse)
async def narrate_endpoint(session_id: str, req: NarrateRequest):
    """
    Main screen narration endpoint.
    - Template: ~50 ms
    - Vision (Groq): ~300–1200 ms (only if prefer_vision=True + screenshot)
    """
    try:
        result = await narrate(
            screen=req.screen,
            context=req.context,
            screenshot_b64=req.screenshot_b64,
            prefer_vision=req.prefer_vision,
            lang=req.context.get("lang", "en"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Narration failed: {str(e)}")

    # Proactive WebSocket push (best-effort)
    if req.push_ws and ws_manager and hasattr(ws_manager, "broadcast_to_session"):
        try:
            await ws_manager.broadcast_to_session(
                session_id,
                {
                    "type": "narration_ready",
                    "payload": {
                        "narration": result["narration"],
                        "tts_audio_b64": result["tts_audio_b64"],
                        "source": result["source"],
                    },
                },
            )
        except Exception as e:
            print(f"[narrate] WS push failed: {e}")

    return NarrateResponse(**result)


@router.post("/sessions/{session_id}/narrate/push")
async def narrate_and_push(
    session_id: str, req: NarrateRequest, background_tasks: BackgroundTasks
):
    """
    Fire-and-forget narration pushed to WebSocket.
    Use this when the backend detects a screen change (e.g., from gaze tracking).
    """
    background_tasks.add_task(_push_task, session_id, req)
    return {"status": "queued", "session_id": session_id}


async def _push_task(session_id: str, req: NarrateRequest):
    try:
        result = await narrate(
            screen=req.screen,
            context=req.context,
            screenshot_b64=req.screenshot_b64,
            prefer_vision=req.prefer_vision,
            lang=req.context.get("lang", "en"),
        )
        if ws_manager and hasattr(ws_manager, "broadcast_to_session"):
            await ws_manager.broadcast_to_session(
                session_id,
                {"type": "narration_ready", "payload": result},
            )
    except Exception as e:
        print(f"[narrate_push] Failed for {session_id}: {e}")
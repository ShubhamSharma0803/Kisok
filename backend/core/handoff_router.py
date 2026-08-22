from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from core.database import get_db
from core.models import Session, HandoffLog, utcnow
from core.enums import SessionStatus, HandoffReason
from core.schemas import ResolveHandoffRequest
from core.orchestrator import increment_failed_tap, evaluate_rules, get_idle_seconds
from core.ws_manager import manager
from core.events import EventType

router = APIRouter(tags=["handoff"])

def _get_session_or_404(db: DBSession, session_id: str) -> Session:
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.post("/sessions/{session_id}/failed-tap")
async def report_failed_tap(session_id: str, db: DBSession = Depends(get_db)):
    session = _get_session_or_404(db, session_id)
    count = increment_failed_tap(session_id)
    await evaluate_rules(db, session)
    return {"failed_tap_count": count, "idle_seconds": get_idle_seconds(session)}

@router.get("/sessions/{session_id}/orchestrator-state")
def get_orchestrator_state(session_id: str, db: DBSession = Depends(get_db)):
    session = _get_session_or_404(db, session_id)
    from core.orchestrator import _failed_tap_counts
    return {
        "failed_tap_count": _failed_tap_counts.get(session_id, 0),
        "idle_seconds": get_idle_seconds(session),
        "ui_emphasis": session.ui_emphasis,
        "active_channels": session.active_channels,
        "detection_confidence": session.detection_confidence,
        "detection_source": session.detection_source,
        "detection_set_at": session.detection_set_at,
        "status": session.status,
    }

async def perform_handoff(db: DBSession, session_id: str, reason: HandoffReason = HandoffReason.manual, detail: str = "user_requested"):
    session = _get_session_or_404(db, session_id)

    log = HandoffLog(session_id=session_id, reason=reason, detail=detail)
    db.add(log)
    session.status = SessionStatus.handed_off
    db.commit()

    await manager.send_event(
        session_id,
        EventType.handoff_triggered,
        {"reason": reason.value if hasattr(reason, "value") else str(reason), "detail": detail},
    )
    return {"handed_off": True}

@router.post("/sessions/{session_id}/handoff")
async def trigger_handoff(session_id: str, db: DBSession = Depends(get_db)):
    return await perform_handoff(db, session_id, HandoffReason.manual, "user_requested")

@router.post("/sessions/{session_id}/resolve-handoff")
async def resolve_handoff(session_id: str, payload: ResolveHandoffRequest, db: DBSession = Depends(get_db)):
    session = _get_session_or_404(db, session_id)

    if session.status != SessionStatus.handed_off:
        raise HTTPException(status_code=400, detail="Session is not currently handed off")

    session.status = SessionStatus.active
    session.ui_emphasis = payload.ui_emphasis
    session.detection_source = "attendant_set"
    session.detection_confidence = 1.0
    session.detection_set_at = utcnow()
    db.commit()
    db.refresh(session)

    from core.orchestrator import _failed_tap_counts
    _failed_tap_counts[session_id] = 0

    await manager.send_event(
        session_id,
        EventType.mode_change,
        {"ui_emphasis": session.ui_emphasis, "status": session.status},
    )

    return {
        "id": session.id,
        "status": session.status,
        "ui_emphasis": session.ui_emphasis,
        "active_channels": session.active_channels,
        "detection_confidence": session.detection_confidence,
        "detection_source": session.detection_source,
        "detection_set_at": session.detection_set_at,
        "failed_tap_count": 0,
        "idle_seconds": get_idle_seconds(session),
    }
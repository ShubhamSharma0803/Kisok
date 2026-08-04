from datetime import datetime, timezone
from sqlalchemy.orm import Session as DBSession
from core.models import Session, HandoffLog
from core.enums import SessionMode, SessionStatus, HandoffReason
from core.ws_manager import manager
from core.events import EventType

# In-memory signal state — mirrors the ConnectionManager pattern from Module 2.
# Not persisted: these are live operational signals, not durable records.
_failed_tap_counts: dict[str, int] = {}

IDLE_THRESHOLD_SECONDS = 8
FAILED_TAP_THRESHOLD = 3

def increment_failed_tap(session_id: str) -> int:
    _failed_tap_counts[session_id] = _failed_tap_counts.get(session_id, 0) + 1
    return _failed_tap_counts[session_id]

def reset_failed_tap(session_id: str):
    _failed_tap_counts[session_id] = 0

def get_idle_seconds(session: Session) -> float:
    now = datetime.now(timezone.utc)
    last_active = session.last_active_at
    if last_active.tzinfo is None:
        last_active = last_active.replace(tzinfo=timezone.utc)
    return (now - last_active).total_seconds()

async def evaluate_rules(db: DBSession, session: Session):
    """Section 4.1: plain threshold checks against live signals."""
    idle_seconds = get_idle_seconds(session)
    failed_taps = _failed_tap_counts.get(session.id, 0)

    if idle_seconds > IDLE_THRESHOLD_SECONDS and failed_taps >= FAILED_TAP_THRESHOLD:
        if session.current_mode != SessionMode.simplified_ui:
            session.current_mode = SessionMode.simplified_ui
            db.commit()
            await manager.send_event(
                session.id,
                EventType.mode_change,
                {"mode": SessionMode.simplified_ui.value, "reason": "idle_and_failed_taps"},
            )

        log = HandoffLog(
            session_id=session.id,
            reason=HandoffReason.automatic,
            detail="idle_timeout_and_failed_tap_threshold",
        )
        db.add(log)
        session.status = SessionStatus.handed_off
        db.commit()
        await manager.send_event(
            session.id,
            EventType.handoff_triggered,
            {"reason": "automatic", "detail": log.detail},
        )
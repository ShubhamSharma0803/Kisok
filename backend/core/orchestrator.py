from datetime import datetime, timezone
from sqlalchemy.orm import Session as DBSession
from core.models import Session, HandoffLog
from core.enums import UIEmphasis, SessionStatus, HandoffReason
from core.ws_manager import manager
from core.events import EventType

# In-memory signal state — mirrors the ConnectionManager pattern from Module 2.
# Not persisted: these are live operational signals, not durable records.
_failed_tap_counts: dict[str, int] = {}
_successful_action_counts: dict[str, int] = {}

IDLE_THRESHOLD_SECONDS = 8
FAILED_TAP_THRESHOLD = 3

def increment_failed_tap(session_id: str) -> int:
    _failed_tap_counts[session_id] = _failed_tap_counts.get(session_id, 0) + 1
    return _failed_tap_counts[session_id]

def reset_failed_tap(session_id: str):
    _failed_tap_counts[session_id] = 0

def increment_successful_action(session_id: str) -> int:
    _successful_action_counts[session_id] = _successful_action_counts.get(session_id, 0) + 1
    return _successful_action_counts[session_id]

def reset_successful_action(session_id: str):
    _successful_action_counts[session_id] = 0

def get_successful_action_count(session_id: str) -> int:
    return _successful_action_counts.get(session_id, 0)

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
        if session.ui_emphasis != UIEmphasis.big_icons:
            session.ui_emphasis = UIEmphasis.big_icons
            db.commit()
            await manager.send_event(
                session.id,
                EventType.mode_change,
                {"ui_emphasis": UIEmphasis.big_icons.value, "reason": "idle_and_failed_taps"},
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

async def maybe_confirm_detection(db: DBSession, session: Session):
    """If the user has succeeded at actions with zero failures since a camera-based guess,
    treat that as confirmation and raise confidence — never changes ui_emphasis, only
    detection_confidence/detection_source/detection_set_at. Never overwrites manual_override
    or attendant_set sources."""
    idle_seconds = get_idle_seconds(session)
    successes = _successful_action_counts.get(session.id, 0)
    failures = _failed_tap_counts.get(session.id, 0)

    eligible_source = session.detection_source in ("camera_auto", "camera_auto_low_confidence_fallback")
    already_confirmed = session.detection_source in ("user_touch_signal", "user_voice_signal")

    if eligible_source and not already_confirmed and successes > 0 and failures == 0 and idle_seconds >= IDLE_THRESHOLD_SECONDS:
        session.detection_confidence = min(1.0, session.detection_confidence + 0.2)
        session.detection_source = "user_touch_signal"
        session.detection_set_at = datetime.now(timezone.utc)
        db.commit()
        await manager.send_event(
            session.id,
            EventType.mode_change,
            {"ui_emphasis": session.ui_emphasis, "status": session.status},
        )
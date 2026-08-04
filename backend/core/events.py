import enum

class EventType(str, enum.Enum):
    caption = "caption"
    voice_transcript = "voice_transcript"
    order_updated = "order_updated"
    mode_change = "mode_change"
    payment_status = "payment_status"
    handoff_triggered = "handoff_triggered"
    screen_narration = "screen_narration"
    gaze_event = "gaze_event"
    processing = "processing"
    error = "error"
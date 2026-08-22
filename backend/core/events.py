import enum

class EventType(str, enum.Enum):
    voice_transcript = "voice_transcript"
    order_updated = "order_updated"
    order_confirmed = "order_confirmed"
    mode_change = "mode_change"
    handoff_triggered = "handoff_triggered"
    screen_narration = "screen_narration"
    order_paid = "order_paid"
    navigate = "navigate"
    
    # Reserved for future implementation steps
    caption = "caption" # Reserved for Phase A step 2b
    processing = "processing" # Reserved for future state updates
    error = "error" # Reserved for future error handling
    gaze_event = "gaze_event" # Reserved for Step 10
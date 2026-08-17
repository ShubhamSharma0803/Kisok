import enum

class SessionMode(str, enum.Enum):
    voice_first = "voice_first"
    simplified_ui = "simplified_ui"
    gaze_active = "gaze_active"

class SessionStatus(str, enum.Enum):
    active = "active"
    handed_off = "handed_off"
    completed = "completed"

class OrderStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    paid = "paid"

class HandoffReason(str, enum.Enum):
    manual = "manual"
    automatic = "automatic"
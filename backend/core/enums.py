import enum

class UIEmphasis(str, enum.Enum):
    standard_touch = "standard_touch"
    big_icons = "big_icons"
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
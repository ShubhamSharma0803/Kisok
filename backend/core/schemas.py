from datetime import datetime
from pydantic import BaseModel
from core.enums import SessionMode, SessionStatus

class SessionResponse(BaseModel):
    id: str
    status: SessionStatus
    current_mode: SessionMode
    created_at: datetime
    last_active_at: datetime

    class Config:
        from_attributes = True
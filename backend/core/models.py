import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Enum as SQLEnum
from core.database import Base
from core.enums import SessionMode, SessionStatus

def utcnow():
    return datetime.now(timezone.utc)

class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    status = Column(SQLEnum(SessionStatus), default=SessionStatus.active, nullable=False)
    current_mode = Column(SQLEnum(SessionMode), default=SessionMode.voice_first, nullable=False)
    created_at = Column(DateTime, default=utcnow)
    last_active_at = Column(DateTime, default=utcnow, onupdate=utcnow)
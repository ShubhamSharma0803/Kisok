import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Integer, Float, ForeignKey, JSON, Enum as SQLEnum
from sqlalchemy.orm import relationship
from core.database import Base
from core.enums import UIEmphasis, SessionStatus
from core.enums import HandoffReason, OrderStatus

def utcnow():
    return datetime.now(timezone.utc)

DEFAULT_ACTIVE_CHANNELS = {
    "voice_input": True,
    "voice_output": True,
    "touch_input": True,
    "gaze_input": False,
    "captions": True,
}

class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    status = Column(SQLEnum(SessionStatus), default=SessionStatus.active, nullable=False)
    active_channels = Column(JSON, default=lambda: dict(DEFAULT_ACTIVE_CHANNELS), nullable=False)
    ui_emphasis = Column(SQLEnum(UIEmphasis), default=UIEmphasis.standard_touch, nullable=False)
    detection_confidence = Column(Float, default=0.0, nullable=False)
    detection_source = Column(String, default="not_yet_implemented", nullable=False)
    detection_set_at = Column(DateTime, default=utcnow, nullable=False)
    created_at = Column(DateTime, default=utcnow)
    last_active_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class MenuItem(Base):
    __tablename__ = "menu_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    name_hi = Column(String, nullable=True)          # Hindi name for voice ordering
    price = Column(Float, nullable=False)
    category = Column(String, nullable=True)
    available_modifiers = Column(String, nullable=True)  # comma-separated modifier options
    image_url = Column(String, nullable=True)            # food image URL

class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, unique=True)
    status = Column(SQLEnum(OrderStatus), default=OrderStatus.pending, nullable=False)
    payment_link_id = Column(String, nullable=True)
    payment_link_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    menu_item_id = Column(String, ForeignKey("menu_items.id"), nullable=False)
    item_name = Column(String, nullable=False)   # snapshot, see note below
    unit_price = Column(Float, nullable=False)   # snapshot, see note below
    quantity = Column(Integer, nullable=False, default=1)
    modifiers = Column(String, nullable=True)    # e.g. "oat milk, extra shot" — plain string for now

    order = relationship("Order", back_populates="items")


class HandoffLog(Base):
    __tablename__ = "handoff_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    reason = Column(SQLEnum(HandoffReason), nullable=False)
    detail = Column(String, nullable=True)   # e.g. "idle_timeout", "failed_tap_threshold"
    created_at = Column(DateTime, default=utcnow)
from datetime import datetime
from pydantic import BaseModel
from core.enums import UIEmphasis, SessionStatus, OrderStatus
from typing import List, Optional, Dict, Any

class SessionResponse(BaseModel):
    id: str
    status: SessionStatus
    active_channels: Dict[str, bool]
    ui_emphasis: UIEmphasis
    detection_confidence: float
    detection_source: str
    detection_set_at: datetime
    created_at: datetime
    last_active_at: datetime

    class Config:
        from_attributes = True

class MenuItemResponse(BaseModel):
    id: str
    name: str
    name_hi: Optional[str] = None
    price: float
    category: Optional[str] = None
    available_modifiers: Optional[str] = None
    image_url: Optional[str] = None

    class Config:
        from_attributes = True

class OrderItemResponse(BaseModel):
    id: str
    menu_item_id: str
    item_name: str
    unit_price: float
    quantity: int
    modifiers: Optional[str] = None

    class Config:
        from_attributes = True

class OrderResponse(BaseModel):
    id: str
    session_id: str
    status: OrderStatus
    items: List[OrderItemResponse]
    total: float
    updated_at: datetime

    class Config:
        from_attributes = True

class AddItemRequest(BaseModel):
    menu_item_id: str
    quantity: int = 1
    modifiers: Optional[str] = None

class UpdateItemQuantityRequest(BaseModel):
    quantity: int

class ResolveHandoffRequest(BaseModel):
    ui_emphasis: UIEmphasis
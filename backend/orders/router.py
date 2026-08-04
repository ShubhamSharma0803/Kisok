from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from core.database import get_db
from core.models import Session, Order, OrderItem, MenuItem
from core.schemas import OrderResponse, MenuItemResponse, AddItemRequest
from core.ws_manager import manager
from core.events import EventType

router = APIRouter(tags=["orders"])

def _order_response(order: Order) -> dict:
    total = sum(item.unit_price * item.quantity for item in order.items)
    return {
        "id": order.id,
        "session_id": order.session_id,
        "items": order.items,
        "total": total,
        "updated_at": order.updated_at,
    }

def _get_or_create_order(db: DBSession, session_id: str) -> Order:
    order = db.query(Order).filter(Order.session_id == session_id).first()
    if not order:
        order = Order(session_id=session_id)
        db.add(order)
        db.commit()
        db.refresh(order)
    return order

@router.get("/menu", response_model=list[MenuItemResponse])
def list_menu(db: DBSession = Depends(get_db)):
    return db.query(MenuItem).all()

@router.get("/sessions/{session_id}/orders", response_model=OrderResponse)
def get_order(session_id: str, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    order = _get_or_create_order(db, session_id)
    return _order_response(order)

@router.post("/sessions/{session_id}/orders/items", response_model=OrderResponse)
async def add_item(session_id: str, body: AddItemRequest, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    menu_item = db.query(MenuItem).filter(MenuItem.id == body.menu_item_id).first()
    if not menu_item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    order = _get_or_create_order(db, session_id)

    item = OrderItem(
        order_id=order.id,
        menu_item_id=menu_item.id,
        item_name=menu_item.name,
        unit_price=menu_item.price,
        quantity=body.quantity,
        modifiers=body.modifiers,
    )
    db.add(item)
    db.commit()
    db.refresh(order)

    response = _order_response(order)
    await manager.send_event(session_id, EventType.order_updated, response)
    return response